import SwiftUI

// MARK: - Posts

struct ProfilePostsSection: View {
  let repo: ProfileContentRepo
  let profileRepo: ProfileRepo
  let userID: String
  let reloadToken: Int

  @EnvironmentObject private var blockedUsers: BlockedUsersStore
  @State private var posts: [FeedItem] = []
  @State private var nextPage: ProfileListCursor?
  @State private var isLoading = true
  @State private var isLoadingMore = false
  @State private var errorMessage: String?
  private let commentsRepo: any PostCommentsRepo = AppRepos.postComments()
  private static let pageSize = 20

  var body: some View {
    ProfileSectionCard(title: "Publicaciones", icon: "square.text.square") {
      if isLoading {
        ProgressView()
      } else if let errorMessage {
        ProfileSectionMessage(text: errorMessage, isError: true)
      } else if posts.isEmpty {
        ProfileSectionMessage(text: "Todavía no hay publicaciones.")
      } else {
        ForEach(posts) { post in
          NavigationLink {
            PostDetailView(item: post, profileRepo: profileRepo, commentsRepo: commentsRepo)
          } label: {
            VStack(alignment: .leading, spacing: 6) {
              Text(post.text.isEmpty ? "Publicación" : post.text)
                .font(.subheadline)
                .foregroundStyle(VinctusTokens.Color.textPrimary)
                .lineLimit(4)
                .multilineTextAlignment(.leading)
              HStack(spacing: 12) {
                Label("\(post.likeCount)", systemImage: "heart")
                Label("\(post.commentCount)", systemImage: "text.bubble")
                if let createdAt = post.createdAt {
                  Spacer()
                  Text(createdAt.formatted(date: .abbreviated, time: .omitted))
                }
              }
              .font(.caption)
              .foregroundStyle(VinctusTokens.Color.textMuted)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.vertical, 6)
          }
          .buttonStyle(.plain)
          if post.id != posts.last?.id {
            Divider()
          }
        }
        if nextPage != nil {
          LoadMoreButton(isLoading: isLoadingMore) {
            Task { await loadMore() }
          }
        }
      }
    }
    .task(id: reloadToken) {
      do {
        let page = try await repo.fetchPosts(uid: userID, limit: Self.pageSize, after: nil)
        posts = page.items
        nextPage = page.next
        errorMessage = nil
      } catch {
        errorMessage = "No se pudieron cargar las publicaciones."
      }
      isLoading = false
    }
  }

  private func loadMore() async {
    guard let cursor = nextPage, !isLoadingMore else { return }
    isLoadingMore = true
    defer { isLoadingMore = false }
    do {
      let page = try await repo.fetchPosts(uid: userID, limit: Self.pageSize, after: cursor)
      let known = Set(posts.map(\.id))
      posts += page.items.filter { !known.contains($0.id) }
      nextPage = page.next
    } catch {
      errorMessage = "No se pudieron cargar más publicaciones."
    }
  }
}

// MARK: - Contributions

struct ProfileContributionsSection: View {
  let repo: ProfileContentRepo
  let userID: String
  let canEdit: Bool
  let reloadToken: Int

  @Environment(\.openURL) private var openURL
  @State private var contributions: [Contribution] = []
  @State private var isLoading = true
  @State private var errorMessage: String?
  @State private var isAdding = false

  var body: some View {
    ProfileSectionCard(title: "Aportes", icon: "shippingbox") {
      if canEdit {
        Button {
          isAdding = true
        } label: {
          Image(systemName: "plus.circle.fill")
            .foregroundStyle(VinctusTokens.Color.accent)
        }
        .accessibilityLabel("Añadir aporte")
      }
    } content: {
      if isLoading {
        ProgressView()
      } else if let errorMessage {
        ProfileSectionMessage(text: errorMessage, isError: true)
      } else if contributions.isEmpty {
        ProfileSectionMessage(text: canEdit
          ? "Comparte tus proyectos, papers, certificaciones o tu CV. Toca + para añadir uno."
          : "Todavía no hay aportes.")
      } else {
        ForEach(contributions) { item in
          row(item)
          if item.id != contributions.last?.id {
            Divider()
          }
        }
      }
    }
    .sheet(isPresented: $isAdding) {
      NewContributionSheet(repo: repo) {
        Task { await load() }
      }
    }
    .task(id: reloadToken) { await load() }
  }

  private func row(_ item: Contribution) -> some View {
    HStack(alignment: .top, spacing: VinctusTokens.Spacing.sm) {
      Image(systemName: item.type.icon)
        .foregroundStyle(VinctusTokens.Color.accent)
        .frame(width: 22)
      VStack(alignment: .leading, spacing: 4) {
        Text(item.title)
          .font(.subheadline.weight(.semibold))
          .foregroundStyle(VinctusTokens.Color.textPrimary)
        Text([item.type.title, item.categoryID.map(InterestCategory.title(for:))].compactMap { $0 }.joined(separator: " · "))
          .font(.caption)
          .foregroundStyle(VinctusTokens.Color.textMuted)
        if let description = item.description {
          Text(description)
            .font(.footnote)
            .foregroundStyle(VinctusTokens.Color.textMuted)
            .lineLimit(3)
        }
        HStack(spacing: VinctusTokens.Spacing.md) {
          if let link = item.link, let url = URL(string: link) {
            Button("Abrir enlace") { openURL(url) }
          }
          if let file = item.fileURL, let url = URL(string: file) {
            Button(item.fileName ?? "Ver archivo") { openURL(url) }
              .lineLimit(1)
          }
          if canEdit {
            Button("Eliminar", role: .destructive) { delete(item) }
          }
        }
        .font(.caption.weight(.semibold))
      }
    }
    .padding(.vertical, 6)
  }

  private func load() async {
    do {
      contributions = try await repo.fetchContributions(uid: userID)
      errorMessage = nil
    } catch {
      errorMessage = "No se pudieron cargar los aportes."
    }
    isLoading = false
  }

  private func delete(_ item: Contribution) {
    let previous = contributions
    contributions.removeAll { $0.id == item.id }
    Task {
      do {
        try await repo.deleteContribution(id: item.id)
      } catch {
        contributions = previous
        errorMessage = "No se pudo eliminar el aporte."
      }
    }
  }
}

private struct NewContributionSheet: View {
  let repo: ProfileContentRepo
  let onSaved: () -> Void

  @Environment(\.dismiss) private var dismiss
  @State private var draft = NewContribution()
  @State private var isSaving = false
  @State private var errorMessage: String?

  private var canSave: Bool {
    !isSaving && !draft.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
  }

  var body: some View {
    NavigationStack {
      Form {
        Section("Tipo") {
          Picker("Tipo", selection: $draft.type) {
            ForEach(ContributionType.allCases) { type in
              Label(type.title, systemImage: type.icon).tag(type)
            }
          }
        }
        Section("Título") {
          TextField("Nombre del proyecto, paper…", text: $draft.title)
        }
        Section("Descripción (opcional)") {
          TextField("¿De qué trata?", text: $draft.description, axis: .vertical)
            .lineLimit(3...6)
        }
        Section {
          TextField("https://", text: $draft.link)
            .keyboardType(.URL)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
        } header: {
          Text("Enlace (opcional)")
        } footer: {
          Text("Para subir un archivo (PDF, CV…), usa la versión web.")
        }
        Section("Categoría (opcional)") {
          Picker("Categoría", selection: $draft.categoryID) {
            Text("Ninguna").tag(String?.none)
            ForEach(InterestCategory.all) { category in
              Text(category.title).tag(String?.some(category.id))
            }
          }
        }
        if let errorMessage {
          Section {
            Text(errorMessage)
              .foregroundStyle(.red)
          }
        }
      }
      .navigationTitle("Nuevo aporte")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("Cancelar") { dismiss() }
        }
        ToolbarItem(placement: .confirmationAction) {
          Button("Guardar", action: save)
            .disabled(!canSave)
        }
      }
      .vinctusLoading(isSaving)
    }
  }

  private func save() {
    isSaving = true
    errorMessage = nil
    Task {
      do {
        try await repo.createContribution(draft)
        onSaved()
        dismiss()
      } catch {
        errorMessage = (error as? LocalizedError)?.errorDescription ?? "No se pudo guardar el aporte."
      }
      isSaving = false
    }
  }
}

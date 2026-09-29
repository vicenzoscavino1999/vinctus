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

  private let columns = [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)]

  /// A two-column grid like the web's ProfilePostsGrid: photo or video thumbnail, the text at
  /// the bottom, and a VIDEO badge.
  var body: some View {
    VStack(alignment: .leading, spacing: 18) {
      Text("PUBLICACIONES")
        .font(VinctusTokens.Typography.serif(14))
        .tracking(4)
        .foregroundStyle(VinctusTokens.Color.textMuted)

      if isLoading {
        ProgressView()
          .frame(maxWidth: .infinity)
      } else if let errorMessage {
        ProfileSectionMessage(text: errorMessage, isError: true)
      } else if posts.isEmpty {
        VStack(spacing: 10) {
          Image(systemName: "photo")
            .font(.title3)
            .foregroundStyle(VinctusTokens.Color.textMuted)
            .frame(width: 48, height: 48)
            .background(VinctusTokens.Color.surface2)
            .clipShape(Circle())
          Text("Aún no hay publicaciones.")
            .font(.subheadline)
            .foregroundStyle(VinctusTokens.Color.textMuted)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 36)
        .overlay(
          RoundedRectangle(cornerRadius: 10, style: .continuous)
            .stroke(VinctusTokens.Color.border, style: StrokeStyle(lineWidth: 1, dash: [5, 4]))
        )
      } else {
        LazyVGrid(columns: columns, spacing: 12) {
          ForEach(posts) { post in
            NavigationLink {
              PostDetailView(item: post, profileRepo: profileRepo, commentsRepo: commentsRepo)
            } label: {
              PostGridTile(post: post)
            }
            .buttonStyle(.plain)
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

/// One square tile of the posts grid.
private struct PostGridTile: View {
  let post: FeedItem

  var body: some View {
    SwiftUI.Color.clear
      .aspectRatio(1, contentMode: .fit)
      .overlay {
        if let preview = post.previewImageURL, let url = URL(string: preview) {
          AsyncImage(url: url) { phase in
            if case .success(let image) = phase {
              image.resizable().scaledToFill()
            } else {
              emptyBackground
            }
          }
        } else {
          emptyBackground
        }
      }
      .overlay {
        LinearGradient(
          colors: [.black.opacity(0.7), .black.opacity(0.2), .clear],
          startPoint: .bottom,
          endPoint: .top
        )
        .opacity(0.8)
      }
      .overlay(alignment: .bottomLeading) {
        caption
          .padding(14)
      }
      .overlay(alignment: .topTrailing) {
        if post.hasVideo {
          Label("VIDEO", systemImage: "film")
            .font(.system(size: 11))
            .tracking(0.5)
            .foregroundStyle(SwiftUI.Color(white: 0.9))
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(SwiftUI.Color.black.opacity(0.5))
            .clipShape(Capsule())
            .padding(10)
        }
      }
      .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
      .overlay(
        RoundedRectangle(cornerRadius: 20, style: .continuous)
          .stroke(VinctusTokens.Color.border, lineWidth: 1)
      )
      .contentShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
  }

  @ViewBuilder
  private var caption: some View {
    if let fileName = post.fileName, post.previewImageURL == nil, !post.hasVideo {
      Label(fileName, systemImage: "doc.text")
        .font(.caption)
        .foregroundStyle(SwiftUI.Color(white: 0.9))
        .lineLimit(1)
    } else {
      Text(post.text.isEmpty ? "Publicación" : post.text)
        .font(.subheadline)
        .foregroundStyle(post.text.isEmpty ? VinctusTokens.Color.textSecondary : SwiftUI.Color(white: 0.96))
        .lineLimit(3)
        .multilineTextAlignment(.leading)
    }
  }

  private var emptyBackground: some View {
    LinearGradient(
      colors: [SwiftUI.Color(white: 0.09), SwiftUI.Color(white: 0.15), .black],
      startPoint: .topLeading,
      endPoint: .bottomTrailing
    )
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

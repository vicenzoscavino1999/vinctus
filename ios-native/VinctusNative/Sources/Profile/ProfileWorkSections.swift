import SwiftUI

// MARK: - Posts

struct ProfilePostsSection: View {
  let profileRepo: ProfileRepo
  let reloadToken: Int

  @EnvironmentObject private var blockedUsers: BlockedUsersStore
  @StateObject private var vm: ProfilePostsViewModel
  private let commentsRepo: any PostCommentsRepo = AppRepos.postComments()

  init(repo: ProfileContentRepo, profileRepo: ProfileRepo, userID: String, reloadToken: Int) {
    self.profileRepo = profileRepo
    self.reloadToken = reloadToken
    _vm = StateObject(wrappedValue: ProfilePostsViewModel(repo: repo, userID: userID))
  }

  private let columns = [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)]

  /// A two-column grid like the web's ProfilePostsGrid: photo or video thumbnail, the text at
  /// the bottom, and a VIDEO badge.
  var body: some View {
    VStack(alignment: .leading, spacing: 18) {
      Text("PUBLICACIONES")
        .font(VinctusTokens.Typography.serif(14))
        .tracking(4)
        .foregroundStyle(VinctusTokens.Color.textMuted)

      if vm.isLoading {
        ProgressView()
          .frame(maxWidth: .infinity)
      } else if let errorMessage = vm.errorMessage {
        ProfileSectionMessage(text: errorMessage, isError: true)
      } else if vm.posts.isEmpty {
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
          ForEach(vm.posts) { post in
            NavigationLink {
              PostDetailView(item: post, profileRepo: profileRepo, commentsRepo: commentsRepo)
            } label: {
              PostGridTile(post: post)
            }
            .buttonStyle(.plain)
          }
        }
        if vm.hasMore {
          LoadMoreButton(isLoading: vm.isLoadingMore) {
            Task { await vm.loadMore() }
          }
        }
      }
    }
    .task(id: reloadToken) { await vm.load() }
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
  let canEdit: Bool
  let reloadToken: Int

  @Environment(\.openURL) private var openURL
  @StateObject private var vm: ContributionsViewModel
  @State private var isAdding = false

  init(repo: ProfileContentRepo, userID: String, canEdit: Bool, reloadToken: Int) {
    self.repo = repo
    self.canEdit = canEdit
    self.reloadToken = reloadToken
    _vm = StateObject(wrappedValue: ContributionsViewModel(repo: repo, userID: userID))
  }

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
      if vm.isLoading {
        ProgressView()
      } else if let errorMessage = vm.errorMessage {
        ProfileSectionMessage(text: errorMessage, isError: true)
      } else if vm.contributions.isEmpty {
        ProfileSectionMessage(text: canEdit
          ? "Comparte tus proyectos, papers, certificaciones o tu CV. Toca + para añadir uno."
          : "Todavía no hay aportes.")
      } else {
        ForEach(vm.contributions) { item in
          row(item)
          if item.id != vm.contributions.last?.id {
            Divider()
          }
        }
      }
    }
    .sheet(isPresented: $isAdding) {
      NewContributionSheet(repo: repo) {
        Task { await vm.load() }
      }
    }
    .task(id: reloadToken) { await vm.load() }
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
            Button("Eliminar", role: .destructive) {
              Task { await vm.delete(item) }
            }
          }
        }
        .font(.caption.weight(.semibold))
      }
    }
    .padding(.vertical, 6)
  }
}

private struct NewContributionSheet: View {
  let onSaved: () -> Void

  @Environment(\.dismiss) private var dismiss
  @StateObject private var vm: NewContributionViewModel

  init(repo: ProfileContentRepo, onSaved: @escaping () -> Void) {
    self.onSaved = onSaved
    _vm = StateObject(wrappedValue: NewContributionViewModel(repo: repo))
  }

  var body: some View {
    NavigationStack {
      Form {
        Section("Tipo") {
          Picker("Tipo", selection: $vm.draft.type) {
            ForEach(ContributionType.allCases) { type in
              Label(type.title, systemImage: type.icon).tag(type)
            }
          }
        }
        Section("Título") {
          TextField("Nombre del proyecto, paper…", text: $vm.draft.title)
        }
        Section("Descripción (opcional)") {
          TextField("¿De qué trata?", text: $vm.draft.description, axis: .vertical)
            .lineLimit(3...6)
        }
        Section {
          TextField("https://", text: $vm.draft.link)
            .keyboardType(.URL)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
        } header: {
          Text("Enlace (opcional)")
        } footer: {
          Text("Para subir un archivo (PDF, CV…), usa la versión web.")
        }
        Section("Categoría (opcional)") {
          Picker("Categoría", selection: $vm.draft.categoryID) {
            Text("Ninguna").tag(String?.none)
            ForEach(InterestCategory.all) { category in
              Text(category.title).tag(String?.some(category.id))
            }
          }
        }
        if let errorMessage = vm.errorMessage {
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
          Button("Guardar") {
            Task {
              if await vm.save() {
                onSaved()
                dismiss()
              }
            }
          }
          .disabled(!vm.canSave)
        }
      }
      .vinctusLoading(vm.isSaving)
    }
  }
}

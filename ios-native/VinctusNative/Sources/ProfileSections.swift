import SwiftUI

/// Card with a small uppercase title, like the sections of the web profile.
struct ProfileSectionCard<Content: View, Accessory: View>: View {
  let title: String
  let icon: String
  let accessory: Accessory
  let content: Content

  init(
    title: String,
    icon: String,
    @ViewBuilder accessory: () -> Accessory,
    @ViewBuilder content: () -> Content
  ) {
    self.title = title
    self.icon = icon
    self.accessory = accessory()
    self.content = content()
  }

  var body: some View {
    VStack(alignment: .leading, spacing: VinctusTokens.Spacing.sm) {
      HStack {
        Label(title.uppercased(), systemImage: icon)
          .font(.caption.weight(.semibold))
          .tracking(1.2)
          .foregroundStyle(VinctusTokens.Color.textMuted)
        Spacer()
        accessory
      }
      content
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(VinctusTokens.Spacing.md)
    .background(VinctusTokens.Color.surface)
    .clipShape(RoundedRectangle(cornerRadius: VinctusTokens.Radius.lg, style: .continuous))
  }
}

extension ProfileSectionCard where Accessory == EmptyView {
  init(title: String, icon: String, @ViewBuilder content: () -> Content) {
    self.init(title: title, icon: icon, accessory: { EmptyView() }, content: content)
  }
}

private struct ProfileSectionMessage: View {
  let text: String
  var isError = false

  var body: some View {
    Text(text)
      .font(.footnote)
      .foregroundStyle(isError ? SwiftUI.Color.red : VinctusTokens.Color.textMuted)
  }
}

// MARK: - About

struct ProfileAboutSection: View {
  let profile: UserProfile
  let isOwnProfile: Bool
  let onEdit: () -> Void

  var body: some View {
    ProfileSectionCard(title: "Sobre mí", icon: "person.text.rectangle") {
      if let bio = profile.bio, !bio.isEmpty {
        Text(bio)
          .font(.body)
          .foregroundStyle(VinctusTokens.Color.textPrimary)
      } else if isOwnProfile {
        ProfileSectionMessage(text: "Aún no has añadido una biografía. ¡Cuéntale al mundo sobre ti!")
        Button("+ Añadir biografía", action: onEdit)
          .font(.subheadline.weight(.semibold))
          .foregroundStyle(VinctusTokens.Color.accent)
      } else {
        ProfileSectionMessage(text: "Sin biografía aún.")
      }
    }
  }
}

// MARK: - Reputation

struct ProfileReputationSection: View {
  let reputation: Int
  let karma: [String: Double]

  private var topInterests: [(id: String, value: Double)] {
    karma.filter { $0.value > 0 }
      .sorted { $0.value > $1.value }
      .prefix(6)
      .map { (id: $0.key, value: $0.value) }
  }

  var body: some View {
    ProfileSectionCard(title: "Reputación", icon: "star") {
      HStack(spacing: VinctusTokens.Spacing.md) {
        GeometryReader { proxy in
          ZStack(alignment: .leading) {
            Capsule().fill(VinctusTokens.Color.surface2)
            Capsule()
              .fill(LinearGradient(
                colors: [VinctusTokens.Color.accent.opacity(0.7), VinctusTokens.Color.accent],
                startPoint: .leading,
                endPoint: .trailing
              ))
              .frame(width: proxy.size.width * CGFloat(min(max(reputation, 0), 100)) / 100)
          }
        }
        .frame(height: 6)
        Text("\(reputation)")
          .font(.title3)
          .foregroundStyle(VinctusTokens.Color.textPrimary)
      }
      ProfileSectionMessage(text: "Contribuye para aumentar tu reputación.")
      if !topInterests.isEmpty {
        ProfileChips(items: topInterests.map {
          "\(InterestCategory.title(for: $0.id)) · \(Int($0.value.rounded()))"
        })
      }
    }
  }
}

/// Wrapping row of small pills.
private struct ProfileChips: View {
  let items: [String]

  var body: some View {
    ViewThatFits(in: .horizontal) {
      HStack(spacing: 6) { chips }
      VStack(alignment: .leading, spacing: 6) { chips }
    }
  }

  private var chips: some View {
    ForEach(items, id: \.self) { item in
      Text(item)
        .font(.caption)
        .padding(.horizontal, 10)
        .padding(.vertical, 5)
        .background(VinctusTokens.Color.surface2)
        .foregroundStyle(VinctusTokens.Color.textPrimary)
        .clipShape(Capsule())
    }
  }
}

// MARK: - Followed categories

struct ProfileCategoriesSection: View {
  let repo: ProfileContentRepo

  @State private var followed: [String] = []
  @State private var isLoading = true
  @State private var errorMessage: String?

  var body: some View {
    ProfileSectionCard(title: "Categorías seguidas", icon: "square.grid.2x2") {
      Menu {
        ForEach(InterestCategory.all.filter { !followed.contains($0.id) }) { category in
          Button {
            set(true, category.id)
          } label: {
            Label(category.title, systemImage: category.icon)
          }
        }
      } label: {
        Image(systemName: "plus.circle.fill")
          .foregroundStyle(VinctusTokens.Color.accent)
      }
      .disabled(followed.count == InterestCategory.all.count)
      .accessibilityLabel("Seguir una categoría")
    } content: {
      if isLoading {
        ProgressView()
      } else if let errorMessage {
        ProfileSectionMessage(text: errorMessage, isError: true)
      } else if followed.isEmpty {
        ProfileSectionMessage(text: "Aún no sigues categorías. Toca + para elegir las que te interesan.")
      } else {
        ForEach(followed, id: \.self) { id in
          let category = InterestCategory.all.first { $0.id == id }
          HStack {
            Label(category?.title ?? id, systemImage: category?.icon ?? "tag")
              .font(.subheadline)
              .foregroundStyle(VinctusTokens.Color.textPrimary)
            Spacer()
            Button("Dejar") { set(false, id) }
              .font(.caption.weight(.semibold))
              .foregroundStyle(VinctusTokens.Color.textMuted)
          }
          .padding(.vertical, 4)
        }
      }
    }
    .task {
      do {
        followed = try await repo.fetchFollowedCategories()
      } catch {
        errorMessage = "No se pudieron cargar tus categorías."
      }
      isLoading = false
    }
  }

  private func set(_ follow: Bool, _ id: String) {
    let previous = followed
    followed = follow ? followed + [id] : followed.filter { $0 != id }
    Task {
      do {
        try await repo.setCategoryFollowed(follow, categoryID: id)
      } catch {
        followed = previous
        errorMessage = "No se pudo actualizar la categoría."
      }
    }
  }
}

// MARK: - Saved Arena debates

struct ProfileSavedDebatesSection: View {
  let repo: ProfileContentRepo

  @State private var debates: [SavedDebate] = []
  @State private var isLoading = true
  @State private var errorMessage: String?

  var body: some View {
    ProfileSectionCard(title: "Debates guardados", icon: "bookmark") {
      if isLoading {
        ProgressView()
      } else if let errorMessage {
        ProfileSectionMessage(text: errorMessage, isError: true)
      } else if debates.isEmpty {
        ProfileSectionMessage(text: "Aún no tienes debates guardados. Desde Arena IA puedes guardarlos.")
      } else {
        ForEach(debates) { debate in
          VStack(alignment: .leading, spacing: 6) {
            Text(debate.topic)
              .font(.subheadline.weight(.semibold))
              .foregroundStyle(VinctusTokens.Color.textPrimary)
            Text(subtitle(debate))
              .font(.caption)
              .foregroundStyle(VinctusTokens.Color.textMuted)
            if let summary = debate.summary {
              Text(summary)
                .font(.footnote)
                .foregroundStyle(VinctusTokens.Color.textMuted)
                .lineLimit(3)
            }
            HStack(spacing: VinctusTokens.Spacing.md) {
              NavigationLink("Ver debate") {
                SavedDebateView(debate: debate)
              }
              Button("Quitar", role: .destructive) { remove(debate) }
            }
            .font(.caption.weight(.semibold))
          }
          .padding(.vertical, 6)
          if debate.id != debates.last?.id {
            Divider()
          }
        }
      }
    }
    .task {
      do {
        debates = try await repo.fetchSavedDebates()
      } catch {
        errorMessage = "No se pudieron cargar tus debates guardados."
      }
      isLoading = false
    }
  }

  private func subtitle(_ debate: SavedDebate) -> String {
    let names = "\(SavedDebate.personaName(debate.personaA)) vs \(SavedDebate.personaName(debate.personaB))"
    guard let date = debate.createdAt else { return names }
    return "\(names) · \(date.formatted(date: .abbreviated, time: .omitted))"
  }

  private func remove(_ debate: SavedDebate) {
    let previous = debates
    debates.removeAll { $0.id == debate.id }
    Task {
      do {
        try await repo.removeSavedDebate(id: debate.id)
      } catch {
        debates = previous
        errorMessage = "No se pudo quitar el debate."
      }
    }
  }
}

/// A saved debate with its turns, read from `arenaDebates/{id}/turns`.
private struct SavedDebateView: View {
  let debate: SavedDebate
  var aiRepo: AIRepo = FirebaseAIRepo()

  @State private var turns: [ArenaTurn] = []
  @State private var isLoading = true
  @State private var errorMessage: String?

  var body: some View {
    List {
      Section {
        Text(debate.topic)
          .font(.headline)
        Text("\(SavedDebate.personaName(debate.personaA)) vs \(SavedDebate.personaName(debate.personaB))")
          .foregroundStyle(VinctusTokens.Color.textMuted)
      }
      Section("Debate") {
        if isLoading {
          ProgressView()
        } else if let errorMessage {
          Text(errorMessage)
            .foregroundStyle(.red)
        } else {
          ForEach(turns) { turn in
            VStack(alignment: .leading, spacing: 4) {
              Text(SavedDebate.personaName(turn.speaker == "A" ? debate.personaA : debate.personaB))
                .font(.caption.weight(.semibold))
                .foregroundStyle(turn.speaker == "A" ? VinctusTokens.Color.accent : VinctusTokens.Color.accentAlt)
              Text(turn.text)
                .textSelection(.enabled)
            }
            .padding(.vertical, 4)
          }
        }
      }
      if debate.summary != nil || debate.winner != nil {
        Section("Veredicto") {
          if let summary = debate.summary {
            Text(summary)
          }
          if let winner = debate.winner {
            Text("Ganador: \(winnerName(winner))")
              .font(.headline)
          }
        }
      }
    }
    .navigationTitle("Debate")
    .navigationBarTitleDisplayMode(.inline)
    .task {
      do {
        turns = try await aiRepo.fetchDebateTurns(debateID: debate.id)
      } catch {
        errorMessage = "No se pudo cargar el debate."
      }
      isLoading = false
    }
  }

  private func winnerName(_ winner: String) -> String {
    switch winner {
    case "A": return SavedDebate.personaName(debate.personaA)
    case "B": return SavedDebate.personaName(debate.personaB)
    default: return "Empate"
    }
  }
}

// MARK: - Posts

struct ProfilePostsSection: View {
  let repo: ProfileContentRepo
  let profileRepo: ProfileRepo
  let userID: String
  let reloadToken: Int

  @EnvironmentObject private var blockedUsers: BlockedUsersStore
  @State private var posts: [FeedItem] = []
  @State private var isLoading = true
  @State private var errorMessage: String?
  private let commentsRepo: any PostCommentsRepo = FirebasePostCommentsRepo()

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
      }
    }
    .task(id: reloadToken) {
      do {
        posts = try await repo.fetchPosts(uid: userID, limit: 20)
        errorMessage = nil
      } catch {
        errorMessage = "No se pudieron cargar las publicaciones."
      }
      isLoading = false
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

// MARK: - Followers / following

/// Followers and following lists, plus pending follow requests on your own profile, like the
/// web's FollowListPage.
struct FollowListView: View {
  let repo: ProfileContentRepo
  let profileRepo: ProfileRepo
  let userID: String
  let showsRequests: Bool

  @EnvironmentObject private var blockedUsers: BlockedUsersStore
  @State private var kind: FollowListKind
  @State private var users: [ProfileUserSummary] = []
  @State private var requests: [IncomingFollowRequest] = []
  @State private var isLoading = true
  @State private var errorMessage: String?

  init(repo: ProfileContentRepo, profileRepo: ProfileRepo, userID: String, initialKind: FollowListKind, showsRequests: Bool) {
    self.repo = repo
    self.profileRepo = profileRepo
    self.userID = userID
    self.showsRequests = showsRequests
    _kind = State(initialValue: initialKind)
  }

  var body: some View {
    List {
      Section {
        Picker("Lista", selection: $kind) {
          ForEach(FollowListKind.allCases) { kind in
            Text(kind.title).tag(kind)
          }
        }
        .pickerStyle(.segmented)
        .listRowBackground(SwiftUI.Color.clear)
      }

      if showsRequests && !requests.isEmpty {
        Section("Solicitudes de seguimiento") {
          ForEach(requests) { request in
            HStack {
              userRow(request.from)
              Spacer()
              Button {
                answer(request, accept: true)
              } label: {
                Image(systemName: "checkmark.circle.fill")
                  .font(.title2)
                  .foregroundStyle(VinctusTokens.Color.accent)
              }
              .buttonStyle(.plain)
              .accessibilityLabel("Aceptar")
              Button {
                answer(request, accept: false)
              } label: {
                Image(systemName: "xmark.circle.fill")
                  .font(.title2)
                  .foregroundStyle(VinctusTokens.Color.textMuted)
              }
              .buttonStyle(.plain)
              .accessibilityLabel("Rechazar")
            }
          }
        }
      }

      Section {
        if isLoading {
          ProgressView()
        } else if let errorMessage {
          Text(errorMessage)
            .foregroundStyle(.red)
        } else if visibleUsers.isEmpty {
          Text(kind == .followers ? "Todavía no hay seguidores." : "Todavía no sigue a nadie.")
            .foregroundStyle(VinctusTokens.Color.textMuted)
        } else {
          ForEach(visibleUsers) { user in
            NavigationLink {
              ProfileView(repo: profileRepo, userID: user.id)
            } label: {
              userRow(user)
            }
          }
        }
      }
    }
    .navigationTitle(kind.title)
    .navigationBarTitleDisplayMode(.inline)
    .task(id: kind) { await load() }
    .task {
      if showsRequests {
        requests = (try? await repo.fetchIncomingFollowRequests()) ?? []
      }
    }
    .refreshable { await load() }
  }

  private var visibleUsers: [ProfileUserSummary] {
    users.filter { !blockedUsers.isBlocked($0.id) }
  }

  private func userRow(_ user: ProfileUserSummary) -> some View {
    HStack(spacing: VinctusTokens.Spacing.sm) {
      AvatarView(name: user.name, photoURLString: user.photoURL, size: 40)
      VStack(alignment: .leading, spacing: 2) {
        Text(user.name)
          .font(.subheadline.weight(.semibold))
        if let username = user.username {
          Text("@\(username)")
            .font(.caption)
            .foregroundStyle(VinctusTokens.Color.textMuted)
        }
      }
    }
  }

  private func load() async {
    isLoading = true
    do {
      users = try await repo.fetchFollowList(uid: userID, kind: kind, limit: 50)
      errorMessage = nil
    } catch {
      errorMessage = "No se pudo cargar la lista."
    }
    isLoading = false
  }

  private func answer(_ request: IncomingFollowRequest, accept: Bool) {
    requests.removeAll { $0.id == request.id }
    Task {
      try? await repo.answerFollowRequest(from: request.from.id, accept: accept)
      if accept, kind == .followers {
        await load()
      }
    }
  }
}

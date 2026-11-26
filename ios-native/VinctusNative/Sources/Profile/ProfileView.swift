import SwiftUI

struct ProfileView: View {
  let userID: String

  @EnvironmentObject private var authVM: AuthViewModel

  private let repo: ProfileRepo
  private let chatRepo: ChatRepo
  private let contentRepo: ProfileContentRepo

  init(
    repo: ProfileRepo,
    userID: String,
    chatRepo: ChatRepo = AppRepos.chat(),
    contentRepo: ProfileContentRepo = AppRepos.profileContent()
  ) {
    self.userID = userID
    self.repo = repo
    self.chatRepo = chatRepo
    self.contentRepo = contentRepo
  }

  var body: some View {
    ProfileBodyView(repo: repo, userID: userID, chatRepo: chatRepo, contentRepo: contentRepo)
      .id("\(authVM.currentUserID ?? "anon"):\(userID)")
  }
}

private struct ProfileBodyView: View {
  let userID: String

  @StateObject private var vm: ProfileViewModel
  @EnvironmentObject private var authVM: AuthViewModel
  @EnvironmentObject private var blockedUsers: BlockedUsersStore
  @StateObject private var connection: ProfileConnectionViewModel
  @State private var isEditing = false
  @State private var followStatus: FollowStatus?
  @State private var followList: FollowListKind?
  @State private var reloadToken = 0
  @State private var followRefreshTask: Task<Void, Never>?
  @State private var tab: ProfileTab = .profile

  private let repo: ProfileRepo
  private let chatRepo: ChatRepo
  private let contentRepo: ProfileContentRepo

  init(
    repo: ProfileRepo,
    userID: String,
    chatRepo: ChatRepo,
    contentRepo: ProfileContentRepo
  ) {
    self.userID = userID
    self.repo = repo
    self.chatRepo = chatRepo
    self.contentRepo = contentRepo
    _vm = StateObject(wrappedValue: ProfileViewModel(repo: repo))
    _connection = StateObject(wrappedValue: ProfileConnectionViewModel(
      userID: userID,
      chatRepo: chatRepo,
      contentRepo: contentRepo
    ))
  }

  private var isOwnProfile: Bool { userID == authVM.currentUserID }

  /// Same rule as `canViewPrivateContent` in the web's UserProfilePage.
  private func canViewContent(_ profile: UserProfile) -> Bool {
    guard isOwnProfile || !blockedUsers.isBlocked(userID) else { return false }
    return isOwnProfile || profile.accountVisibility == .public || followStatus == .following
  }

  var body: some View {
    ScrollViewReader { proxy in
    ScrollView {
      VStack(spacing: VinctusTokens.Spacing.lg) {
        if let profile = vm.profile {
          ProfileHeader(profile: profile, isOwnProfile: isOwnProfile)
          ProfileStatsBar(profile: profile, canOpenLists: canViewContent(profile)) { followList = $0 }
          actions(profile)
          content(profile)
        } else if vm.isLoading {
          ProgressView()
            .padding(.top, 80)
        } else if let error = vm.errorMessage {
          VCard {
            VStack(alignment: .leading, spacing: VinctusTokens.Spacing.sm) {
              Text(error)
                .font(.footnote)
                .foregroundStyle(.red)
              VButton("Reintentar", variant: .secondary) {
                Task { await vm.load(userID: userID) }
              }
            }
          }
        }
      }
      .padding(VinctusTokens.Spacing.lg)
    }
    .task(id: vm.profile?.id) {
      // Screenshot builds scroll to a section with `-VinctusScrollTo <id>`.
      guard vm.profile != nil, let target = AppRepos.demoArgument("-VinctusScrollTo") else { return }
      if let targetTab = ProfileTab.containing(target) { tab = targetTab }
      try? await Task.sleep(nanoseconds: 500_000_000)
      proxy.scrollTo(target, anchor: .top)
    }
    }
    .background(VinctusTokens.Color.background)
    .navigationTitle(isOwnProfile ? "Mi perfil" : (vm.profile?.displayName ?? "Perfil"))
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      ToolbarItem(placement: .topBarTrailing) {
        if !isOwnProfile {
          ModerationMenu(
            target: .user(userID: userID),
            authorID: userID,
            authorName: vm.profile?.displayName ?? "este usuario"
          )
        }
      }
    }
    .navigationDestination(item: $connection.openedConversationID) { conversationID in
      ConversationView(
        repo: chatRepo,
        profileRepo: repo,
        conversationID: conversationID,
        title: vm.profile?.displayName ?? "Mensajes",
        otherUserID: userID
      )
    }
    .navigationDestination(item: $followList) { kind in
      FollowListView(
        repo: contentRepo,
        profileRepo: repo,
        userID: userID,
        initialKind: kind,
        showsRequests: isOwnProfile
      )
    }
    .sheet(isPresented: $isEditing) {
      if let profile = vm.profile {
        EditProfileSheet(profile: profile, repo: repo) {
          Task { await reload() }
        }
      }
    }
    .task(id: userID) {
      await reload()
    }
    .onReceive(NotificationCenter.default.publisher(for: .vinctusPostPublished)) { _ in
      guard isOwnProfile else { return }
      Task { await reload() }
    }
    .refreshable {
      await reload()
    }
    .onDisappear {
      followRefreshTask?.cancel()
    }
  }

  private func reload() async {
    await vm.load(userID: userID)
    reloadToken += 1
    await connection.loadRequests(isOwnProfile: isOwnProfile)
  }

  private func scheduleSilentCounterRefresh() {
    followRefreshTask?.cancel()
    followRefreshTask = Task {
      try? await Task.sleep(nanoseconds: 1_200_000_000)
      guard !Task.isCancelled else { return }
      await vm.refreshSilently(userID: userID)
    }
  }

  // MARK: Actions

  @ViewBuilder
  private func actions(_ profile: UserProfile) -> some View {
    if isOwnProfile {
      VStack(spacing: VinctusTokens.Spacing.sm) {
        VButton("Editar perfil", variant: .secondary) {
          isEditing = true
        }
        if connection.incomingRequestCount > 0 {
          Button { followList = .followers } label: {
            Label(
              connection.incomingRequestCount == 1
                ? "1 solicitud de seguimiento"
                : "\(connection.incomingRequestCount) solicitudes de seguimiento",
              systemImage: "person.badge.clock"
            )
            .font(.subheadline.weight(.semibold))
            .frame(maxWidth: .infinity)
            .frame(height: 40)
            .foregroundStyle(SwiftUI.Color.black)
            .background(VinctusTokens.Color.accent)
            .clipShape(RoundedRectangle(cornerRadius: VinctusTokens.Radius.sm, style: .continuous))
          }
          .buttonStyle(.plain)
        }
      }
    } else if !blockedUsers.isBlocked(userID) {
      VStack(alignment: .leading, spacing: 6) {
        if connection.hasIncomingRequest {
          incomingRequestBanner(profile)
        }

        HStack(spacing: VinctusTokens.Spacing.sm) {
          FollowButton(
            targetUID: userID,
            isPrivate: profile.accountVisibility == .private,
            onStatusChange: { newValue in
              let previous = followStatus
              followStatus = newValue
              if let previous, previous != newValue, previous == .following || newValue == .following {
                scheduleSilentCounterRefresh()
              }
            }
          )

          Button {
            Task { await connection.openConversation() }
          } label: {
            HStack(spacing: 6) {
              if connection.isOpeningConversation {
                ProgressView()
                  .controlSize(.small)
              } else {
                Image(systemName: "bubble.left.fill")
              }
              Text("Mensaje")
                .font(.subheadline.weight(.semibold))
            }
            .frame(maxWidth: .infinity)
            .frame(height: 40)
            .foregroundStyle(VinctusTokens.Color.textPrimary)
            .background(VinctusTokens.Color.surface2)
            .clipShape(RoundedRectangle(cornerRadius: VinctusTokens.Radius.sm, style: .continuous))
          }
          .buttonStyle(.plain)
          .disabled(connection.isOpeningConversation)
        }

        if let messageError = connection.messageError {
          Text(messageError)
            .font(.caption)
            .foregroundStyle(.red)
        }
      }
    } else {
      Text("Bloqueaste a esta persona. Puedes desbloquearla en Ajustes > Usuarios bloqueados.")
        .font(.footnote)
        .foregroundStyle(VinctusTokens.Color.textMuted)
        .multilineTextAlignment(.center)
    }
  }

  private func incomingRequestBanner(_ profile: UserProfile) -> some View {
    VStack(alignment: .leading, spacing: 8) {
      Text("\(profile.displayName) quiere seguirte")
        .font(.subheadline.weight(.semibold))
      HStack(spacing: VinctusTokens.Spacing.sm) {
        VButton("Aceptar") {
          Task {
            if await connection.answerRequest(accept: true) {
              scheduleSilentCounterRefresh()
            }
          }
        }
        VButton("Rechazar", variant: .secondary) {
          Task { await connection.answerRequest(accept: false) }
        }
      }
      .disabled(connection.isAnsweringRequest)
    }
    .padding(VinctusTokens.Spacing.md)
    .background(VinctusTokens.Color.surface)
    .clipShape(RoundedRectangle(cornerRadius: VinctusTokens.Radius.lg, style: .continuous))
  }

  // MARK: Content

  /// Your posts come first, like the web: on your own profile "Mi perfil" holds your work and
  /// the details, "Guardados" what you saved and "Colecciones" your collections. Other people's
  /// profiles show the same order without tabs.
  @ViewBuilder
  private func content(_ profile: UserProfile) -> some View {
    if !isOwnProfile && blockedUsers.isBlocked(userID) {
      EmptyView()
    } else if canViewContent(profile) {
      if isOwnProfile || !(profile.bio ?? "").isEmpty {
        ProfileAboutSection(profile: profile, isOwnProfile: isOwnProfile) { isEditing = true }
      }
      if isOwnProfile {
        StoriesBar()
        Picker("Sección del perfil", selection: $tab) {
          ForEach(ProfileTab.allCases) { item in
            Text(item.title).tag(item)
          }
        }
        .pickerStyle(.segmented)
        switch tab {
        case .profile:
          workSections(profile)
        case .saved:
          NavigationLink {
            SavedPostsView(profileRepo: repo)
          } label: {
            ProfileLinkRow(
              icon: "bookmark",
              title: "Publicaciones guardadas",
              subtitle: "Lo que guardaste del feed y de los grupos"
            )
          }
          .buttonStyle(.plain)
          ProfileSavedDebatesSection(repo: contentRepo)
        case .collections:
          ProfileCollectionsLink()
            .id("collections")
        }
      } else {
        workSections(profile)
      }
    } else {
      PrivateProfileNotice()
    }
  }

  @ViewBuilder
  private func workSections(_ profile: UserProfile) -> some View {
    ProfilePostsSection(repo: contentRepo, profileRepo: repo, userID: userID, canCreate: isOwnProfile, reloadToken: reloadToken)
      .id("posts")
    ProfileContributionsSection(repo: contentRepo, userID: userID, canEdit: isOwnProfile, reloadToken: reloadToken)
    ProfileReputationSection(reputation: profile.reputation, karma: profile.karmaByInterest)
    if isOwnProfile {
      ProfileCategoriesSection(repo: contentRepo)
        .id("categories")
    }
    ProfileDetailsSection(profile: profile, isOwnProfile: isOwnProfile)
  }
}

/// The tabs of your own profile, like the web's "Mi Perfil · Guardados · Colecciones".
enum ProfileTab: String, CaseIterable, Identifiable {
  case profile, saved, collections

  var id: String { rawValue }

  var title: String {
    switch self {
    case .profile: return "Mi perfil"
    case .saved: return "Guardados"
    case .collections: return "Colecciones"
    }
  }

  /// The tab that holds a section id used by `-VinctusScrollTo` in screenshot builds.
  static func containing(_ sectionID: String) -> ProfileTab? {
    switch sectionID {
    case "posts", "categories": return .profile
    case "saved": return .saved
    case "collections": return .collections
    default: return nil
    }
  }
}

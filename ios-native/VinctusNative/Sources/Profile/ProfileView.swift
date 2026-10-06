import SwiftUI

struct ProfileView: View {
  let userID: String

  @StateObject private var vm: ProfileViewModel
  @EnvironmentObject private var authVM: AuthViewModel
  @EnvironmentObject private var blockedUsers: BlockedUsersStore
  @StateObject private var connection: ProfileConnectionViewModel
  @State private var isEditing = false
  @State private var followStatus: FollowStatus?
  @State private var followList: FollowListKind?
  @State private var reloadToken = 0

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
    isOwnProfile || profile.accountVisibility == .public || followStatus == .following
  }

  var body: some View {
    ScrollViewReader { proxy in
    ScrollView {
      VStack(spacing: VinctusTokens.Spacing.lg) {
        if let profile = vm.profile {
          ProfileHeader(profile: profile)
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
    .refreshable {
      await reload()
    }
  }

  private func reload() async {
    await vm.load(userID: userID)
    reloadToken += 1
    await connection.loadRequests(isOwnProfile: isOwnProfile)
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
            onStatusChange: { followStatus = $0 }
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
          Task { await connection.answerRequest(accept: true) }
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

  @ViewBuilder
  private func content(_ profile: UserProfile) -> some View {
    if !isOwnProfile && blockedUsers.isBlocked(userID) {
      EmptyView()
    } else if canViewContent(profile) {
      ProfileAboutSection(profile: profile, isOwnProfile: isOwnProfile) { isEditing = true }
      ProfileReputationSection(reputation: profile.reputation, karma: profile.karmaByInterest)
      if isOwnProfile {
        StoriesBar()
        ProfileCollectionsLink()
          .id("collections")
        ProfileCategoriesSection(repo: contentRepo)
          .id("categories")
        ProfileSavedDebatesSection(repo: contentRepo)
      }
      ProfilePostsSection(repo: contentRepo, profileRepo: repo, userID: userID, reloadToken: reloadToken)
        .id("posts")
      ProfileContributionsSection(repo: contentRepo, userID: userID, canEdit: isOwnProfile, reloadToken: reloadToken)
      ProfileDetailsSection(profile: profile, isOwnProfile: isOwnProfile)
    } else {
      PrivateProfileNotice()
    }
  }
}

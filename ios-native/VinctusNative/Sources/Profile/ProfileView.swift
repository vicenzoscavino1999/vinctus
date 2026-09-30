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
          header(profile)
          stats(profile)
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

  // MARK: Header

  private func header(_ profile: UserProfile) -> some View {
    VStack(spacing: 10) {
      AvatarView(name: profile.displayName, photoURLString: profile.photoURL, size: 96)
        .overlay(
          Circle()
            .stroke(
              LinearGradient(
                colors: [VinctusTokens.Color.accent, VinctusTokens.Color.accentBright],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
              ),
              lineWidth: 2
            )
            .padding(-5)
        )
        .padding(.top, 8)

      Text(profile.displayName)
        .font(VinctusTokens.Typography.brandTitle(size: 28))
        .foregroundStyle(VinctusTokens.Color.textPrimary)
        .multilineTextAlignment(.center)

      Text(profile.role ?? "Nuevo miembro")
        .font(.subheadline)
        .foregroundStyle(VinctusTokens.Color.textMuted)

      HStack(spacing: 8) {
        if let username = profile.username {
          Text("@\(username)")
            .foregroundStyle(VinctusTokens.Color.textMuted)
        }
        Label(
          profile.accountVisibility == .private ? "Privada" : "Pública",
          systemImage: profile.accountVisibility == .private ? "lock.fill" : "globe"
        )
        .font(.caption.weight(.semibold))
        .padding(.horizontal, 8)
        .padding(.vertical, 3)
        .background(VinctusTokens.Color.surface2)
        .foregroundStyle(VinctusTokens.Color.textMuted)
        .clipShape(Capsule())
      }
      .font(.subheadline)
    }
    .frame(maxWidth: .infinity)
  }

  // MARK: Stats

  private func stats(_ profile: UserProfile) -> some View {
    let canOpenLists = canViewContent(profile)
    return HStack(spacing: 0) {
      stat(value: profile.postsCount, label: "Publicaciones")
      divider
      Button { followList = .followers } label: {
        stat(value: profile.followersCount, label: "Seguidores")
      }
      .buttonStyle(.plain)
      .disabled(!canOpenLists)
      divider
      Button { followList = .following } label: {
        stat(value: profile.followingCount, label: "Siguiendo")
      }
      .buttonStyle(.plain)
      .disabled(!canOpenLists)
      divider
      stat(value: profile.reputation, label: "Reputación")
    }
    .padding(.vertical, 14)
    .background(VinctusTokens.Color.surface)
    .clipShape(RoundedRectangle(cornerRadius: VinctusTokens.Radius.lg, style: .continuous))
    .overlay(
      RoundedRectangle(cornerRadius: VinctusTokens.Radius.lg, style: .continuous)
        .stroke(VinctusTokens.Color.border.opacity(0.55), lineWidth: 1)
    )
  }

  private var divider: some View {
    Rectangle()
      .fill(VinctusTokens.Color.border.opacity(0.6))
      .frame(width: 1, height: 30)
  }

  private func stat(value: Int, label: String) -> some View {
    VStack(spacing: 2) {
      Text("\(value)")
        .font(.title3.weight(.bold))
        .foregroundStyle(VinctusTokens.Color.textPrimary)
      Text(label)
        .font(.caption2)
        .foregroundStyle(VinctusTokens.Color.textMuted)
        .lineLimit(1)
        .minimumScaleFactor(0.8)
    }
    .frame(maxWidth: .infinity)
    .contentShape(Rectangle())
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
        NavigationLink {
          CollectionsView()
        } label: {
          HStack(spacing: VinctusTokens.Spacing.sm) {
            Image(systemName: "books.vertical")
              .foregroundStyle(VinctusTokens.Color.accent)
            VStack(alignment: .leading, spacing: 2) {
              Text("Colecciones")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(VinctusTokens.Color.textPrimary)
              Text("Tus enlaces y notas guardados, solo para ti")
                .font(.caption)
                .foregroundStyle(VinctusTokens.Color.textMuted)
            }
            Spacer()
            Image(systemName: "chevron.right")
              .foregroundStyle(VinctusTokens.Color.textMuted)
          }
          .padding(VinctusTokens.Spacing.md)
          .background(VinctusTokens.Color.surface)
          .clipShape(RoundedRectangle(cornerRadius: VinctusTokens.Radius.lg, style: .continuous))
        }
        .buttonStyle(.plain)
        .id("collections")
        ProfileCategoriesSection(repo: contentRepo)
          .id("categories")
        ProfileSavedDebatesSection(repo: contentRepo)
      }
      ProfilePostsSection(repo: contentRepo, profileRepo: repo, userID: userID, reloadToken: reloadToken)
        .id("posts")
      ProfileContributionsSection(repo: contentRepo, userID: userID, canEdit: isOwnProfile, reloadToken: reloadToken)
      details(profile)
    } else {
      VStack(spacing: 8) {
        Image(systemName: "lock.fill")
          .font(.system(size: 28))
          .foregroundStyle(VinctusTokens.Color.accent)
        Text("Cuenta privada")
          .font(.headline)
        Text("Sigue a esta persona para ver sus publicaciones, aportes y seguidores.")
          .font(.footnote)
          .foregroundStyle(VinctusTokens.Color.textMuted)
          .multilineTextAlignment(.center)
      }
      .frame(maxWidth: .infinity)
      .padding(VinctusTokens.Spacing.xl)
      .background(VinctusTokens.Color.surface)
      .clipShape(RoundedRectangle(cornerRadius: VinctusTokens.Radius.lg, style: .continuous))
    }
  }

  private struct DetailRow: Hashable {
    let icon: String
    let text: String
  }

  private func detailRows(_ profile: UserProfile) -> [DetailRow] {
    var rows: [DetailRow] = []
    if let location = profile.location {
      rows.append(DetailRow(icon: "mappin.and.ellipse", text: location))
    }
    if isOwnProfile, let email = profile.email {
      rows.append(DetailRow(icon: "envelope", text: email))
    }
    rows.append(
      DetailRow(
        icon: "calendar",
        text: "Se unió en \(profile.createdAt.formatted(.dateTime.month(.wide).year()))"
      )
    )
    return rows
  }

  private func details(_ profile: UserProfile) -> some View {
    ProfileSectionCard(title: isOwnProfile ? "Contacto" : "Detalles", icon: "info.circle") {
      VStack(alignment: .leading, spacing: 10) {
        ForEach(detailRows(profile), id: \.self) { row in
          Label(row.text, systemImage: row.icon)
            .font(.subheadline)
            .foregroundStyle(VinctusTokens.Color.textMuted)
        }
      }
    }
  }
}

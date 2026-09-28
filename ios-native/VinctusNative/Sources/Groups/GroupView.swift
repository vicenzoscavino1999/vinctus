import SwiftUI

/// All groups, as web-style cards.
struct GroupsListView: View {
  @StateObject private var vm: GroupsListViewModel
  @State private var openedGroupID: String?

  private let repo: any GroupsRepo

  init(repo: any GroupsRepo) {
    self.repo = repo
    _vm = StateObject(wrappedValue: GroupsListViewModel(repo: repo))
  }

  var body: some View {
    ScrollView {
      LazyVStack(alignment: .leading, spacing: 16) {
        (Text("Todos los ").foregroundStyle(VinctusTokens.Color.textSecondary)
          + Text("grupos").foregroundStyle(VinctusTokens.Color.textPrimary))
          .font(VinctusTokens.Typography.serif(26))
          .padding(.top, 8)

        if vm.isShowingCachedData {
          Label("Mostrando grupos guardados en el teléfono.", systemImage: "externaldrive.badge.clock")
            .font(.footnote)
            .foregroundStyle(VinctusTokens.Color.textMuted)
        }

        if vm.isLoading, vm.groups.isEmpty {
          ProgressView()
            .frame(maxWidth: .infinity)
            .padding(.vertical, 40)
        } else if vm.groups.isEmpty, let error = vm.errorMessage {
          VStack(alignment: .leading, spacing: 10) {
            Text(error)
              .font(.footnote)
              .foregroundStyle(.red)
            VButton("Reintentar", variant: .secondary) {
              Task { await vm.refresh() }
            }
          }
        } else if vm.groups.isEmpty {
          Text("Aún no hay grupos disponibles.")
            .foregroundStyle(VinctusTokens.Color.textMuted)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 40)
        } else {
          ForEach(vm.groups) { group in
            GroupCard(group: group, repo: repo) {
              openedGroupID = group.id
            }
          }
        }
      }
      .padding(.horizontal, 16)
      .padding(.bottom, 24)
    }
    .background(VinctusTokens.Color.background)
    .navigationTitle("Grupos")
    .navigationBarTitleDisplayMode(.inline)
    .navigationDestination(item: $openedGroupID) { groupID in
      GroupView(repo: repo, groupID: groupID)
    }
    .task { await vm.refresh() }
    .refreshable { await vm.refresh() }
  }
}

/// A group, laid out like the web's GroupDetailView (`src/features/groups/components`).
struct GroupView: View {
  @StateObject private var vm: GroupDetailViewModel
  @StateObject private var connectivity = ConnectivityMonitor()
  @EnvironmentObject private var blockedUsers: BlockedUsersStore
  @EnvironmentObject private var authVM: AuthViewModel
  @State private var openedConversationID: String?
  @State private var openedProfileID: String?
  @State private var isOpeningChat = false
  @State private var isComposing = false
  @State private var isConfirmingLeave = false
  @State private var chatError: String?

  private let groupID: String
  private let chatRepo: ChatRepo
  private let profileRepo: ProfileRepo

  init(
    repo: any GroupsRepo,
    groupID: String,
    chatRepo: ChatRepo = AppRepos.chat(),
    profileRepo: ProfileRepo = AppRepos.profile()
  ) {
    _vm = StateObject(wrappedValue: GroupDetailViewModel(repo: repo, groupID: groupID))
    self.groupID = groupID
    self.chatRepo = chatRepo
    self.profileRepo = profileRepo
  }

  private var currentUserID: String? { authVM.currentUserID }
  private var isJoined: Bool { vm.membership?.isJoined == true }

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 32) {
        if let detail = vm.detail {
          header(detail)
          postsSection(detail)
          membersSection(detail)
        } else if vm.isLoading {
          ProgressView()
            .frame(maxWidth: .infinity)
            .padding(.top, 80)
        }

        if let error = vm.errorMessage {
          VStack(alignment: .leading, spacing: 10) {
            Text(error)
              .font(.footnote)
              .foregroundStyle(.red)
            VButton("Reintentar", variant: .secondary) {
              Task { await vm.refresh() }
            }
          }
        }
      }
      .padding(.horizontal, 16)
      .padding(.top, 8)
      .padding(.bottom, 24)
    }
    .background(VinctusTokens.Color.background)
    .navigationTitle("")
    .navigationBarTitleDisplayMode(.inline)
    .task {
      vm.handleConnectivityChange(connectivity.isOnline)
      await vm.refresh()
      await vm.loadMembership(uid: currentUserID)
    }
    .navigationDestination(item: $openedConversationID) { conversationID in
      ConversationView(
        repo: chatRepo,
        profileRepo: profileRepo,
        conversationID: conversationID,
        title: vm.detail?.name ?? "Grupo",
        otherUserID: nil
      )
    }
    .navigationDestination(item: $openedProfileID) { userID in
      ProfileView(repo: profileRepo, userID: userID)
    }
    .navigationDestination(isPresented: $isComposing) {
      CreatePostView(repo: AppRepos.createPost(), groupID: groupID)
    }
    .confirmationDialog("¿Salir del grupo?", isPresented: $isConfirmingLeave, titleVisibility: .visible) {
      Button("Salir", role: .destructive) {
        Task { await vm.performMembershipAction(uid: currentUserID) }
      }
    }
    .onChange(of: connectivity.isOnline) { _, newValue in
      vm.handleConnectivityChange(newValue)
    }
    .refreshable {
      await vm.refresh()
      await vm.loadMembership(uid: currentUserID)
    }
  }

  // MARK: Header

  @ViewBuilder
  private func stats(_ detail: GroupDetail) -> some View {
    Label("\(detail.memberCount.formatted()) miembros", systemImage: "person.2")
    Label("\(detail.postsPerWeek) posts/semana", systemImage: "bubble.left")
  }

  private func header(_ detail: GroupDetail) -> some View {
    VStack(alignment: .leading, spacing: 16) {
      HStack(alignment: .top, spacing: 16) {
        GroupSquareIcon(name: detail.name, iconURL: detail.iconURL, size: 64)

        VStack(alignment: .leading, spacing: 8) {
          Text(detail.name)
            .font(VinctusTokens.Typography.serif(32))
            .foregroundStyle(VinctusTokens.Color.textPrimary)
            .fixedSize(horizontal: false, vertical: true)
          // Side by side when they fit, stacked on narrow screens.
          ViewThatFits(in: .horizontal) {
            HStack(spacing: 14) { stats(detail) }
            VStack(alignment: .leading, spacing: 4) { stats(detail) }
          }
          .lineLimit(1)
          .labelStyle(CompactLabelStyle())
          .font(.subheadline)
          .foregroundStyle(VinctusTokens.Color.textMuted)
        }
      }

      if !detail.description.isEmpty {
        Text(detail.description)
          .font(.body)
          .foregroundStyle(VinctusTokens.Color.textSecondary)
      }

      actions(detail)

      if let error = vm.membershipError ?? chatError {
        Text(error)
          .font(.footnote)
          .foregroundStyle(.red)
      }
    }
  }

  @ViewBuilder
  private func actions(_ detail: GroupDetail) -> some View {
    let isPrivate = detail.visibility == .private
    ScrollView(.horizontal, showsIndicators: false) {
      HStack(spacing: 10) {
        if let membership = vm.membership, membership != .owner {
          if membership == .member {
            GroupActionButton(title: "Unido", systemImage: "checkmark", style: .gold) {}
              .disabled(true)
          } else {
            GroupActionButton(
              title: vm.isUpdatingMembership ? "Procesando..." : membership.buttonTitle(isPrivate: isPrivate).uppercased(),
              style: membership == .pending ? .muted : .neutral
            ) {
              Task { await vm.performMembershipAction(uid: currentUserID) }
            }
            .disabled(vm.isUpdatingMembership || membership == .pending)
          }
        }

        GroupActionButton(title: isOpeningChat ? "Abriendo..." : "Chat", systemImage: "bubble.left", style: .neutral) {
          openGroupChat()
        }
        .disabled(!isJoined || isOpeningChat)

        if vm.membership == .member {
          GroupActionButton(title: "Salir", style: .danger) {
            isConfirmingLeave = true
          }
          .disabled(vm.isUpdatingMembership)
        }
      }
      .padding(.vertical, 1)
    }
  }

  // MARK: Posts

  private func postsSection(_ detail: GroupDetail) -> some View {
    VStack(alignment: .leading, spacing: 14) {
      HStack {
        Text("Publicaciones recientes")
          .font(VinctusTokens.Typography.serif(24))
          .foregroundStyle(VinctusTokens.Color.textPrimary)
        Spacer()
        if isJoined {
          Button {
            isComposing = true
          } label: {
            Text("PUBLICAR")
              .font(.caption.weight(.medium))
              .tracking(1)
              .foregroundStyle(.black)
              .padding(.horizontal, 16)
              .padding(.vertical, 9)
              .background(VinctusTokens.Color.accent)
              .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
          }
          .buttonStyle(.plain)
        }
      }

      let posts = detail.recentPosts.filter { !blockedUsers.isBlocked($0.authorID) }
      if posts.isEmpty {
        Text("Aún no hay publicaciones en este grupo.")
          .foregroundStyle(VinctusTokens.Color.textMuted)
          .frame(maxWidth: .infinity)
          .padding(.vertical, 20)
      } else {
        ForEach(posts) { post in
          HStack(alignment: .center, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
              Text(post.title)
                .font(.body.weight(.medium))
                .foregroundStyle(VinctusTokens.Color.textPrimary)
                .lineLimit(2)
              HStack(spacing: 6) {
                Text(post.authorName)
                if let createdAt = post.createdAt {
                  Text("·")
                  Text(createdAt, style: .relative)
                }
              }
              .font(.subheadline)
              .foregroundStyle(VinctusTokens.Color.textMuted)
            }
            Spacer()
            ModerationMenu(
              target: .post(postID: post.id, authorID: post.authorID),
              authorID: post.authorID,
              authorName: post.authorName
            )
          }
          .padding(16)
          .background(VinctusTokens.Color.surface2)
          .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
          .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
              .stroke(VinctusTokens.Color.border.opacity(0.5), lineWidth: 1)
          )
        }
      }
    }
  }

  // MARK: Members

  private func membersSection(_ detail: GroupDetail) -> some View {
    VStack(alignment: .leading, spacing: 14) {
      Text("Miembros destacados")
        .font(VinctusTokens.Typography.serif(24))
        .foregroundStyle(VinctusTokens.Color.textPrimary)

      if detail.topMembers.isEmpty {
        Text("Sin miembros destacados por ahora.")
          .foregroundStyle(VinctusTokens.Color.textMuted)
          .frame(maxWidth: .infinity)
          .padding(.vertical, 20)
      } else {
        ForEach(detail.topMembers.filter { !blockedUsers.isBlocked($0.uid) }) { member in
          Button {
            openedProfileID = member.uid
          } label: {
            VStack(spacing: 6) {
              AvatarView(name: member.name, photoURLString: member.photoURL, size: 48)
                .padding(.bottom, 6)
              Text(member.name)
                .font(.body.weight(.medium))
                .foregroundStyle(VinctusTokens.Color.textPrimary)
              Text(Self.roleTitle(member.role))
                .font(.caption)
                .tracking(1)
                .foregroundStyle(VinctusTokens.Color.accent)
            }
            .frame(maxWidth: .infinity)
            .padding(16)
            .background(VinctusTokens.Color.surface2)
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(
              RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(VinctusTokens.Color.border.opacity(0.5), lineWidth: 1)
            )
          }
          .buttonStyle(.plain)
        }
      }
    }
  }

  static func roleTitle(_ role: String) -> String {
    switch role {
    case "admin": return "ADMIN"
    case "moderator": return "MODERADOR"
    default: return "MIEMBRO"
    }
  }

  private func openGroupChat() {
    isOpeningChat = true
    chatError = nil
    Task {
      do {
        openedConversationID = try await chatRepo.openGroupConversation(groupID: groupID)
      } catch {
        chatError = (error as? LocalizedError)?.errorDescription ?? "No se pudo abrir el chat del grupo."
      }
      isOpeningChat = false
    }
  }
}

// MARK: - Pieces

private struct CompactLabelStyle: LabelStyle {
  func makeBody(configuration: Configuration) -> some View {
    HStack(spacing: 4) {
      configuration.icon
      configuration.title
    }
  }
}

/// Buttons of the group header, like the web's rounded-button row.
private struct GroupActionButton: View {
  enum Style {
    case gold
    case neutral
    case muted
    case danger
  }

  let title: String
  var systemImage: String?
  let style: Style
  let action: () -> Void

  @Environment(\.isEnabled) private var isEnabled

  var body: some View {
    Button(action: action) {
      HStack(spacing: 6) {
        if let systemImage {
          Image(systemName: systemImage)
        }
        Text(title)
      }
      .font(.subheadline.weight(.medium))
      .foregroundStyle(foreground)
      .padding(.horizontal, 18)
      .padding(.vertical, 12)
      .background(background)
      .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
      .overlay(
        RoundedRectangle(cornerRadius: 10, style: .continuous)
          .stroke(border, lineWidth: 1)
      )
      .opacity(isEnabled || style == .gold ? 1 : 0.5)
    }
    .buttonStyle(.plain)
  }

  private var foreground: SwiftUI.Color {
    switch style {
    case .gold: return .black
    case .neutral: return VinctusTokens.Color.textPrimary
    case .muted: return VinctusTokens.Color.textMuted
    case .danger: return SwiftUI.Color(red: 0.99, green: 0.65, blue: 0.65)
    }
  }

  private var background: SwiftUI.Color {
    switch style {
    case .gold: return VinctusTokens.Color.accent
    case .neutral, .muted: return VinctusTokens.Color.surface3
    case .danger: return SwiftUI.Color.red.opacity(0.1)
    }
  }

  private var border: SwiftUI.Color {
    switch style {
    case .gold: return .clear
    case .neutral, .muted: return SwiftUI.Color(white: 0.25)
    case .danger: return SwiftUI.Color.red.opacity(0.3)
    }
  }
}

/// Rounded-square group icon with the photo or the name's initial (web's detail header).
private struct GroupSquareIcon: View {
  let name: String
  let iconURL: String?
  let size: CGFloat

  var body: some View {
    ZStack {
      RoundedRectangle(cornerRadius: 16, style: .continuous)
        .fill(VinctusTokens.Color.surface3)
      if let iconURL, let url = URL(string: iconURL) {
        AsyncImage(url: url) { phase in
          if case .success(let image) = phase {
            image.resizable().scaledToFill()
          } else {
            initial
          }
        }
      } else {
        initial
      }
    }
    .frame(width: size, height: size)
    .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    .overlay(
      RoundedRectangle(cornerRadius: 16, style: .continuous)
        .stroke(SwiftUI.Color(white: 0.25), lineWidth: 1)
    )
  }

  private var initial: some View {
    Text(String(name.prefix(1)).uppercased())
      .font(.title2)
      .foregroundStyle(VinctusTokens.Color.textPrimary.opacity(0.85))
  }
}

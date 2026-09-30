import SwiftUI

/// A group, laid out like the web's GroupDetailView (`src/features/groups/components`).
struct GroupView: View {
  @StateObject private var vm: GroupDetailViewModel
  @StateObject private var groupChat: GroupChatViewModel
  @StateObject private var connectivity = ConnectivityMonitor()
  @EnvironmentObject private var blockedUsers: BlockedUsersStore
  @EnvironmentObject private var authVM: AuthViewModel
  @State private var openedProfileID: String?
  @State private var isComposing = false
  @State private var isConfirmingLeave = false
  @State private var isEditing = false

  private let groupID: String
  private let repo: any GroupsRepo
  private let chatRepo: ChatRepo
  private let profileRepo: ProfileRepo

  init(
    repo: any GroupsRepo,
    groupID: String,
    chatRepo: ChatRepo = AppRepos.chat(),
    profileRepo: ProfileRepo = AppRepos.profile()
  ) {
    _vm = StateObject(wrappedValue: GroupDetailViewModel(repo: repo, groupID: groupID))
    _groupChat = StateObject(wrappedValue: GroupChatViewModel(groupID: groupID, chatRepo: chatRepo))
    self.groupID = groupID
    self.repo = repo
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
      // Screenshot builds open the editor with `-VinctusEditGroup 1`.
      if vm.membership == .owner, AppRepos.demoArgument("-VinctusEditGroup") != nil {
        isEditing = true
      }
    }
    .sheet(isPresented: $isEditing) {
      if let detail = vm.detail {
        EditGroupSheet(detail: detail, repo: repo, ownerID: currentUserID) {
          Task { await vm.refresh() }
        }
      }
    }
    .navigationDestination(item: $groupChat.openedConversationID) { conversationID in
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

      if let error = vm.membershipError ?? groupChat.errorMessage {
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

        if vm.membership == .owner {
          GroupActionButton(title: "Editar grupo", systemImage: "pencil", style: .gold) {
            isEditing = true
          }
        }

        GroupActionButton(title: groupChat.isOpening ? "Abriendo..." : "Chat", systemImage: "bubble.left", style: .neutral) {
          Task { await groupChat.open() }
        }
        .disabled(!isJoined || groupChat.isOpening)

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
}

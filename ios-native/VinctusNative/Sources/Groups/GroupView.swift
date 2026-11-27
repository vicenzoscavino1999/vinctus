import SwiftUI

/// A group, laid out like the web's GroupDetailView (`src/features/groups/components`): who it is
/// (icon, name, members, activity, category), what you can do (join or request, chat, edit or
/// leave in "⋯"), its latest posts and its members.
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
    .task(id: "\(groupID):\(currentUserID ?? "anon")") {
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
      CreatePostView(repo: AppRepos.createPost(), groupID: groupID, categoryID: vm.detail?.categoryID)
    }
    .onChange(of: isComposing) { _, composing in
      if !composing {
        Task { await vm.refresh() }
      }
    }
    .onReceive(NotificationCenter.default.publisher(for: .vinctusPostPublished)) { _ in
      Task { await vm.refresh() }
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

  /// "1.284 miembros · 24 publicaciones esta semana · Privado", like the web.
  private func metaLine(_ detail: GroupDetail) -> String {
    var parts = [
      detail.memberCount == 1 ? "1 miembro" : "\(detail.memberCount.formatted()) miembros",
      detail.postsPerWeek == 1 ? "1 publicación esta semana" : "\(detail.postsPerWeek) publicaciones esta semana",
    ]
    if detail.visibility == .private { parts.append("Privado") }
    return parts.joined(separator: " · ")
  }

  private func header(_ detail: GroupDetail) -> some View {
    VStack(alignment: .leading, spacing: 16) {
      HStack(alignment: .center, spacing: 16) {
        GroupSquareIcon(name: detail.name, iconURL: detail.iconURL, size: 72)
        VStack(alignment: .leading, spacing: 6) {
          Text(detail.name)
            .font(VinctusTokens.Typography.serif(30))
            .foregroundStyle(VinctusTokens.Color.textPrimary)
            .fixedSize(horizontal: false, vertical: true)
          Text(metaLine(detail))
            .font(.subheadline)
            .foregroundStyle(VinctusTokens.Color.textMuted)
        }
      }

      if let category = detail.categoryID.flatMap({ id in InterestCategory.all.first { $0.id == id } }) {
        Text(category.title)
          .font(.caption.weight(.medium))
          .foregroundStyle(VinctusTokens.Color.textSecondary)
          .padding(.horizontal, 12)
          .padding(.vertical, 6)
          .overlay(Capsule().stroke(VinctusTokens.Color.border, lineWidth: 1))
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

  private enum ActionTone { case gold, amber, neutral }

  private func actionButton(
    _ title: String, systemImage: String? = nil, tone: ActionTone, action: @escaping () -> Void
  ) -> some View {
    Button(action: action) {
      HStack(spacing: 6) {
        if let systemImage { Image(systemName: systemImage) }
        Text(title)
      }
      .font(.subheadline.weight(.semibold))
      .lineLimit(1)
      .frame(maxWidth: .infinity)
      .frame(height: 44)
      .foregroundStyle(tone == .gold ? SwiftUI.Color.black : tone == .amber ? VinctusTokens.Color.accent : VinctusTokens.Color.textPrimary)
      .background {
        if tone == .gold {
          RoundedRectangle(cornerRadius: VinctusTokens.Radius.sm, style: .continuous).fill(VinctusTokens.Color.accent)
        } else {
          RoundedRectangle(cornerRadius: VinctusTokens.Radius.sm, style: .continuous)
            .stroke(tone == .amber ? VinctusTokens.Color.accent.opacity(0.5) : VinctusTokens.Color.border, lineWidth: 1)
        }
      }
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
  }

  /// Unirme or Solicitar in gold, Pendiente in amber, Unido or Tu grupo neutral; Chat; and edit or
  /// leave in "⋯", like the web.
  @ViewBuilder
  private func actions(_ detail: GroupDetail) -> some View {
    let isPrivate = detail.visibility == .private
    HStack(spacing: 10) {
      if let membership = vm.membership {
        let effective = (!isPrivate && membership == .pending) ? GroupMembershipStatus.none : membership
        switch effective {
        case .owner:
          actionButton("Tu grupo", systemImage: "checkmark", tone: .neutral) {}
            .disabled(true)
        case .member:
          actionButton("Unido", systemImage: "checkmark", tone: .neutral) {}
            .disabled(true)
        case .pending:
          actionButton("Pendiente", systemImage: "clock", tone: .amber) {}
            .disabled(true)
        case .none:
          actionButton(vm.isUpdatingMembership ? "Procesando…" : effective.buttonTitle(isPrivate: isPrivate), tone: .gold) {
            Task { await vm.performMembershipAction(uid: currentUserID) }
          }
          .disabled(vm.isUpdatingMembership)
        }
      }

      actionButton(groupChat.isOpening ? "Abriendo…" : "Chat", systemImage: "bubble.left", tone: .neutral) {
        Task { await groupChat.open() }
      }
      .disabled(!isJoined || groupChat.isOpening)
      .opacity(isJoined ? 1 : 0.5)

      if vm.membership == .owner || vm.membership == .member {
        Menu {
          if vm.membership == .owner {
            Button {
              isEditing = true
            } label: {
              Label("Editar grupo", systemImage: "pencil")
            }
          }
          if vm.membership == .member {
            Button(role: .destructive) {
              isConfirmingLeave = true
            } label: {
              Label("Salir", systemImage: "rectangle.portrait.and.arrow.right")
            }
            .disabled(vm.isUpdatingMembership)
          }
        } label: {
          Image(systemName: "ellipsis")
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(VinctusTokens.Color.textPrimary)
            .frame(width: 44, height: 44)
            .overlay(
              RoundedRectangle(cornerRadius: VinctusTokens.Radius.sm, style: .continuous)
                .stroke(VinctusTokens.Color.border, lineWidth: 1)
            )
        }
        .accessibilityLabel("Opciones del grupo")
      }
    }
  }

  // MARK: Posts

  private func postsSection(_ detail: GroupDetail) -> some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack {
        Text("Publicaciones")
          .font(VinctusTokens.Typography.serif(24))
          .foregroundStyle(VinctusTokens.Color.textPrimary)
        Spacer()
        if isJoined {
          Button {
            isComposing = true
          } label: {
            Label("Publicar", systemImage: "plus")
              .font(.caption.weight(.semibold))
              .foregroundStyle(.black)
              .padding(.horizontal, 12)
              .padding(.vertical, 7)
              .background(VinctusTokens.Color.accent, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
          }
          .buttonStyle(.plain)
        }
      }

      let isPrivateLocked = detail.visibility == .private && !isJoined
      let posts = detail.recentPosts.filter { !blockedUsers.isBlocked($0.authorID) }
      if isPrivateLocked {
        notice("Este grupo es privado. Solicita acceso para ver las publicaciones.")
      } else if posts.isEmpty {
        notice("Aún no hay publicaciones en este grupo.")
      } else {
        ForEach(posts) { post in
          HStack(alignment: .center, spacing: 12) {
            NavigationLink {
              PostDetailView(
                item: post.resolvedFeedItem,
                profileRepo: profileRepo,
                commentsRepo: AppRepos.postComments()
              )
            } label: {
              GroupPostRow(post: post)
            }
            .buttonStyle(.plain)

            ModerationMenu(
              target: .post(postID: post.id, authorID: post.authorID),
              authorID: post.authorID,
              authorName: post.authorName
            )
          }
          .padding(.vertical, 6)
        }
      }
    }
  }

  // MARK: Members

  private func membersSection(_ detail: GroupDetail) -> some View {
    VStack(alignment: .leading, spacing: 10) {
      Text("Miembros")
        .font(VinctusTokens.Typography.serif(24))
        .foregroundStyle(VinctusTokens.Color.textPrimary)

      let isPrivateLocked = detail.visibility == .private && !isJoined
      let members = detail.topMembers.filter { !blockedUsers.isBlocked($0.uid) }
      if isPrivateLocked {
        notice("Solo los miembros pueden ver la lista de participantes.")
      } else if members.isEmpty {
        notice("Sin miembros destacados por ahora.")
      } else {
        ForEach(members) { member in
          Button {
            openedProfileID = member.uid
          } label: {
            HStack(spacing: 12) {
              AvatarView(name: member.name, photoURLString: member.photoURL, size: 40)
              VStack(alignment: .leading, spacing: 2) {
                Text(member.name)
                  .font(.subheadline.weight(.semibold))
                  .foregroundStyle(VinctusTokens.Color.textPrimary)
                Text(Self.roleTitle(member.role))
                  .font(.caption)
                  .foregroundStyle(VinctusTokens.Color.textMuted)
              }
              Spacer()
            }
            .padding(.vertical, 4)
            .contentShape(Rectangle())
          }
          .buttonStyle(.plain)
        }
      }
    }
  }

  private func notice(_ text: String) -> some View {
    Text(text)
      .font(.footnote)
      .foregroundStyle(VinctusTokens.Color.textMuted)
      .multilineTextAlignment(.center)
      .frame(maxWidth: .infinity)
      .padding(.vertical, 22)
      .overlay(
        RoundedRectangle(cornerRadius: 16, style: .continuous)
          .stroke(VinctusTokens.Color.border.opacity(0.6), style: StrokeStyle(lineWidth: 1, dash: [4, 4]))
      )
  }

  static func roleTitle(_ role: String) -> String {
    switch role {
    case "admin": return "Admin"
    case "moderator": return "Moderador"
    default: return "Miembro"
    }
  }
}

/// A post of the group: thumbnail, title in serif, author, age and counters, like the web.
private struct GroupPostRow: View {
  let post: GroupPostPreview

  var body: some View {
    let item = post.resolvedFeedItem
    HStack(alignment: .center, spacing: 12) {
      ZStack {
        RoundedRectangle(cornerRadius: 12, style: .continuous)
          .fill(VinctusTokens.Color.surface)
        if let image = item.previewImageURL {
          PostImageView(source: image)
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        } else if item.hasVideo {
          Image(systemName: "play.fill")
            .foregroundStyle(VinctusTokens.Color.textMuted)
        } else {
          Text("“")
            .font(VinctusTokens.Typography.serif(28))
            .foregroundStyle(VinctusTokens.Color.accent.opacity(0.7))
        }
      }
      .frame(width: 60, height: 60)
      .clipped()

      VStack(alignment: .leading, spacing: 4) {
        Text(post.title)
          .font(VinctusTokens.Typography.serif(18))
          .foregroundStyle(VinctusTokens.Color.textPrimary)
          .lineLimit(2)
          .multilineTextAlignment(.leading)
        HStack(spacing: 10) {
          Text([post.authorName, post.createdAt.map { ConnectionsFormat.relativeAge($0) }]
            .compactMap { $0 }
            .joined(separator: " · "))
          if item.likeCount > 0 {
            Label("\(item.likeCount)", systemImage: "heart")
          }
          if item.commentCount > 0 {
            Label("\(item.commentCount)", systemImage: "bubble.left")
          }
        }
        .labelStyle(CompactLabelStyle())
        .font(.caption)
        .foregroundStyle(VinctusTokens.Color.textMuted)
        .lineLimit(1)
      }
      Spacer(minLength: 0)
    }
    .contentShape(Rectangle())
  }
}

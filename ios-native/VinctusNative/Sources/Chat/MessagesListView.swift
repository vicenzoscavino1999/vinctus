import SwiftUI

/// Mensajes, like the web's inbox: every conversation newest first, a search and
/// Todos · Privados · Grupos; each row shows who, a short time and the last message. Under
/// Grupos, the groups you belong to; "Crear grupo" is in the bar.
struct MessagesListView: View {
  let repo: ChatRepo
  let profileRepo: ProfileRepo
  let groupsRepo: any GroupsRepo
  let contentRepo: ProfileContentRepo

  @EnvironmentObject private var authVM: AuthViewModel
  @EnvironmentObject private var blockedUsers: BlockedUsersStore
  @StateObject private var vm: ConversationsViewModel
  /// Screenshot builds open a conversation with `-VinctusOpenChat <id>`.
  @State private var openedConversation: ChatConversation?
  /// Screenshot builds open a filter with `-VinctusInboxFilter <all|direct|group>`.
  @State private var filter: InboxFilter = AppRepos.demoArgument("-VinctusInboxFilter").flatMap { InboxFilter(rawValue: $0) } ?? .all
  @State private var query = ""
  @StateObject private var myGroups = MyGroupsViewModel()
  /// Screenshot builds open the sheet with `-VinctusCreateGroup 1`.
  @State private var isCreatingGroup = AppRepos.demoArgument("-VinctusCreateGroup") != nil
  @State private var openedGroupID: String?
  @State private var createdGroupWarning: String?

  init(
    repo: ChatRepo,
    profileRepo: ProfileRepo,
    groupsRepo: any GroupsRepo = AppRepos.groups(),
    contentRepo: ProfileContentRepo = AppRepos.profileContent()
  ) {
    self.repo = repo
    self.profileRepo = profileRepo
    self.groupsRepo = groupsRepo
    self.contentRepo = contentRepo
    _vm = StateObject(wrappedValue: ConversationsViewModel(repo: repo))
  }

  private var visibleGroups: [GroupSummary] {
    myGroups.groups.filter { InboxFormat.matches($0.name, query: query) }
  }

  /// Every conversation except direct chats with people you blocked.
  private var allConversations: [ChatConversation] {
    vm.conversations.filter { !blockedUsers.isBlocked($0.otherUserID) }
  }

  private var visibleConversations: [ChatConversation] {
    allConversations.filter { filter.includes($0) && InboxFormat.matches($0.title, query: query) }
  }

  private var noResultsText: String {
    if !query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { return "No hay resultados." }
    switch filter {
    case .all: return "No hay resultados."
    case .direct: return "Aún no tienes mensajes privados."
    case .group: return "Aún no hay chats de grupo."
    }
  }

  var body: some View {
    List {
      if let error = vm.errorMessage, !vm.conversations.isEmpty {
        VStack(alignment: .leading, spacing: 6) {
          Text(error)
            .font(.footnote)
            .foregroundStyle(.red)
          Button("Reintentar") {
            vm.stop()
            vm.start()
          }
        }
        .listRowBackground(SwiftUI.Color.clear)
      }
      if vm.isLoading, vm.conversations.isEmpty {
        HStack {
          Spacer()
          ProgressView()
          Spacer()
        }
        .listRowBackground(SwiftUI.Color.clear)
      } else if let error = vm.errorMessage, vm.conversations.isEmpty {
        emptyState(icon: "exclamationmark.bubble", title: error, message: "Desliza hacia abajo para reintentar.")
      } else {
        filterChips

        if allConversations.isEmpty, filter == .all {
          emptyState(
            icon: "bubble.left.and.bubble.right",
            title: "Aún no tienes conversaciones",
            message: "Entra al perfil de alguien que sigues (o que te sigue) y toca Mensaje. Los chats de tus grupos también aparecen aquí."
          )
        } else if visibleConversations.isEmpty {
          Text(noResultsText)
            .font(.footnote)
            .foregroundStyle(VinctusTokens.Color.textMuted)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 28)
            .listRowBackground(SwiftUI.Color.clear)
            .listRowSeparator(.hidden)
        }

        // Rows open the chat without List's arrow, like the web.
        ForEach(visibleConversations) { conversation in
          Button {
            openedConversation = conversation
          } label: {
            ConversationRow(conversation: conversation, uid: authVM.currentUserID)
          }
          .buttonStyle(.plain)
          .listRowBackground(SwiftUI.Color.clear)
          .listRowSeparator(.hidden)
          .listRowInsets(EdgeInsets(top: 6, leading: 16, bottom: 6, trailing: 16))
        }

        if filter == .group {
          yourGroupsSection
        }
      }
    }
    .listStyle(.plain)
    .scrollContentBackground(.hidden)
    .background(VinctusTokens.Color.background)
    .navigationTitle("Mensajes")
    .searchable(text: $query, prompt: "Buscar conversaciones o grupos")
    .toolbar {
      ToolbarItem(placement: .topBarTrailing) {
        Button {
          isCreatingGroup = true
        } label: {
          Image(systemName: "plus")
            .font(.body.weight(.semibold))
            .foregroundStyle(VinctusTokens.Color.accent)
        }
        .accessibilityLabel("Crear grupo")
      }
    }
    .sheet(isPresented: $isCreatingGroup) {
      CreateGroupSheet(repo: groupsRepo, contentRepo: contentRepo) { _, warning in
        createdGroupWarning = warning
        filter = .group
        Task { await myGroups.load(uid: authVM.currentUserID, repo: groupsRepo) }
      }
    }
    .alert(
      "Grupo creado",
      isPresented: Binding(get: { createdGroupWarning != nil }, set: { if !$0 { createdGroupWarning = nil } })
    ) {
      Button("OK", role: .cancel) {}
    } message: {
      Text(createdGroupWarning ?? "")
    }
    .navigationDestination(item: $openedGroupID) { groupID in
      GroupView(repo: groupsRepo, groupID: groupID, chatRepo: repo, profileRepo: profileRepo)
    }
    .task(id: authVM.currentUserID) {
      await myGroups.load(uid: authVM.currentUserID, repo: groupsRepo)
    }
    .navigationDestination(item: $openedConversation) { conversation in
      ConversationView(
        repo: repo,
        profileRepo: profileRepo,
        conversationID: conversation.id,
        title: conversation.title,
        otherUserID: conversation.otherUserID
      )
    }
    .onAppear {
      vm.start()
      if let id = AppRepos.demoArgument("-VinctusOpenChat"), openedConversation == nil {
        openedConversation = vm.conversations.first { $0.id == id }
      }
    }
    .refreshable {
      vm.stop()
      vm.start()
      await myGroups.load(uid: authVM.currentUserID, repo: groupsRepo)
    }
  }

  // MARK: Your groups

  /// The groups you belong to: the row opens the group, "Abrir chat" its chat (the web's
  /// "Tus grupos").
  @ViewBuilder
  private var yourGroupsSection: some View {
    Text("TUS GRUPOS")
      .font(.caption.weight(.semibold))
      .tracking(1.6)
      .foregroundStyle(VinctusTokens.Color.textMuted)
      .padding(.top, VinctusTokens.Spacing.lg)
      .listRowBackground(SwiftUI.Color.clear)
      .listRowSeparator(.hidden)

    if let error = myGroups.errorMessage ?? myGroups.chatError {
      Text(error)
        .font(.footnote)
        .foregroundStyle(.red)
        .listRowBackground(SwiftUI.Color.clear)
        .listRowSeparator(.hidden)
    }

    if myGroups.isLoading, myGroups.groups.isEmpty {
      HStack {
        Spacer()
        ProgressView()
        Spacer()
      }
      .listRowBackground(SwiftUI.Color.clear)
      .listRowSeparator(.hidden)
    } else if visibleGroups.isEmpty, myGroups.errorMessage == nil {
      Text(query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
           ? "Aún no tienes grupos. Crea uno con +."
           : "Ningún grupo coincide.")
        .font(.footnote)
        .foregroundStyle(VinctusTokens.Color.textMuted)
        .listRowBackground(SwiftUI.Color.clear)
        .listRowSeparator(.hidden)
    } else {
      ForEach(visibleGroups) { group in
        MyGroupRow(
          group: group,
          isOpening: myGroups.openingGroupID == group.id,
          onOpenGroup: { openedGroupID = group.id },
          onOpenChat: {
            Task {
              if let conversation = await myGroups.openChat(for: group, chatRepo: repo) {
                openedConversation = conversation
              }
            }
          }
        )
        .listRowBackground(SwiftUI.Color.clear)
        .listRowSeparator(.hidden)
        .listRowInsets(EdgeInsets(top: 6, leading: 16, bottom: 6, trailing: 16))
      }
    }
  }

  private var filterChips: some View {
    HStack(spacing: 8) {
      ForEach(InboxFilter.allCases) { option in
        let isSelected = filter == option
        Button {
          filter = option
        } label: {
          Text(option.label)
            .font(.system(size: 13, weight: .medium))
            .padding(.horizontal, 14)
            .frame(height: 32)
            .foregroundStyle(isSelected ? SwiftUI.Color.black : VinctusTokens.Color.textSecondary)
            .background(isSelected ? SwiftUI.Color.white : VinctusTokens.Color.surface)
            .clipShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isSelected ? .isSelected : [])
      }
      Spacer(minLength: 0)
    }
    .listRowBackground(SwiftUI.Color.clear)
    .listRowSeparator(.hidden)
    .listRowInsets(EdgeInsets(top: 4, leading: 16, bottom: 8, trailing: 16))
  }

  private func emptyState(icon: String, title: String, message: String) -> some View {
    VStack(spacing: VinctusTokens.Spacing.md) {
      Image(systemName: icon)
        .font(.system(size: 40))
        .foregroundStyle(VinctusTokens.Color.accent)
      Text(title)
        .font(.headline)
        .multilineTextAlignment(.center)
      Text(message)
        .font(.subheadline)
        .foregroundStyle(VinctusTokens.Color.textMuted)
        .multilineTextAlignment(.center)
    }
    .frame(maxWidth: .infinity)
    .padding(.vertical, 60)
    .listRowBackground(SwiftUI.Color.clear)
    .listRowSeparator(.hidden)
  }
}

/// One conversation: photo, initials or the group's icon; the name with a short time; the last
/// message in one line ("Tú: …" for yours).
private struct ConversationRow: View {
  let conversation: ChatConversation
  let uid: String?

  var body: some View {
    HStack(spacing: VinctusTokens.Spacing.md) {
      avatar

      VStack(alignment: .leading, spacing: 3) {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
          Text(conversation.title)
            .font(.body.weight(.semibold))
            .foregroundStyle(VinctusTokens.Color.textPrimary)
            .lineLimit(1)
          Spacer(minLength: 8)
          Text(InboxFormat.time(conversation.updatedAt))
            .font(.caption)
            .foregroundStyle(VinctusTokens.Color.textMuted)
        }
        HStack(spacing: 5) {
          if conversation.isGroup {
            Image(systemName: "person.2")
              .font(.caption2)
              .accessibilityLabel("Grupo")
          }
          Text(InboxFormat.preview(conversation, uid: uid))
            .lineLimit(1)
        }
        .font(.subheadline)
        .foregroundStyle(VinctusTokens.Color.textMuted)
      }
    }
    .padding(.vertical, 4)
    .contentShape(Rectangle())
  }

  @ViewBuilder
  private var avatar: some View {
    if conversation.isGroup, conversation.photoURL == nil {
      Image(systemName: "person.2")
        .font(.system(size: 18))
        .foregroundStyle(VinctusTokens.Color.textMuted)
        .frame(width: 48, height: 48)
        .background(VinctusTokens.Color.surface)
        .clipShape(Circle())
        .overlay(Circle().stroke(VinctusTokens.Color.border.opacity(0.6), lineWidth: 1))
    } else {
      AvatarView(name: conversation.title, photoURLString: conversation.photoURL, size: 48)
    }
  }
}

/// The groups the signed-in person belongs to, and opening a group's chat from the list.
@MainActor
final class MyGroupsViewModel: ObservableObject {
  @Published private(set) var groups: [GroupSummary] = []
  @Published private(set) var isLoading = false
  @Published private(set) var errorMessage: String?
  @Published private(set) var openingGroupID: String?
  @Published private(set) var chatError: String?

  static let limit = 50

  func load(uid: String?, repo: any GroupsRepo) async {
    guard let uid else {
      groups = []
      return
    }
    isLoading = true
    defer { isLoading = false }
    do {
      groups = try await repo.fetchMyGroups(uid: uid, limit: Self.limit)
      errorMessage = nil
    } catch {
      errorMessage = "No se pudieron cargar tus grupos."
    }
  }

  /// Opens (or creates) the group's conversation, like the web's `getOrCreateGroupConversation`.
  func openChat(for group: GroupSummary, chatRepo: ChatRepo) async -> ChatConversation? {
    guard openingGroupID == nil else { return nil }
    openingGroupID = group.id
    chatError = nil
    defer { openingGroupID = nil }
    do {
      let conversationID = try await chatRepo.openGroupConversation(groupID: group.id)
      return ChatConversation(
        id: conversationID, isGroup: true, title: group.name, photoURL: group.iconURL,
        otherUserID: nil, groupID: group.id, lastMessageText: nil, lastMessageSenderID: nil,
        updatedAt: Date()
      )
    } catch {
      chatError = "No se pudo abrir el chat del grupo."
      return nil
    }
  }
}

/// A group you belong to: its icon, name, members and description; "Abrir chat" on the right.
private struct MyGroupRow: View {
  let group: GroupSummary
  let isOpening: Bool
  let onOpenGroup: () -> Void
  let onOpenChat: () -> Void

  var body: some View {
    HStack(spacing: VinctusTokens.Spacing.md) {
      Button(action: onOpenGroup) {
        HStack(spacing: VinctusTokens.Spacing.md) {
          GroupSquareIcon(name: group.name, iconURL: group.iconURL, size: 48)
          VStack(alignment: .leading, spacing: 3) {
            Text(group.name)
              .font(.body.weight(.semibold))
              .foregroundStyle(VinctusTokens.Color.textPrimary)
              .lineLimit(1)
            Text(details)
              .font(.subheadline)
              .foregroundStyle(VinctusTokens.Color.textMuted)
              .lineLimit(1)
          }
          Spacer(minLength: 4)
        }
        .contentShape(Rectangle())
      }
      .buttonStyle(.borderless)
      .accessibilityLabel("Ver grupo \(group.name)")

      Button(action: onOpenChat) {
        Text(isOpening ? "Abriendo…" : "Abrir chat")
          .font(.caption.weight(.medium))
          .padding(.horizontal, 12)
          .padding(.vertical, 7)
          .foregroundStyle(VinctusTokens.Color.textPrimary)
          .overlay(Capsule().stroke(VinctusTokens.Color.border, lineWidth: 1))
      }
      .buttonStyle(.borderless)
      .disabled(isOpening)
    }
  }

  private var details: String {
    let members = group.memberCount == 1 ? "1 miembro" : "\(group.memberCount) miembros"
    return group.description.isEmpty ? members : "\(members) · \(group.description)"
  }
}

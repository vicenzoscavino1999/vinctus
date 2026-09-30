import Foundation

@MainActor
final class GroupsListViewModel: ObservableObject {
  @Published private(set) var groups: [GroupSummary] = []
  @Published private(set) var isLoading = false
  @Published private(set) var errorMessage: String?
  @Published private(set) var isShowingCachedData = false

  private let repo: GroupsRepo

  init(repo: GroupsRepo) {
    self.repo = repo
  }

  func refresh() async {
    isLoading = true
    errorMessage = nil
    defer { isLoading = false }

    do {
      let page = try await repo.fetchGroups(limit: 50)
      groups = page.items
      isShowingCachedData = page.isFromCache
      let count = groups.count
      AppLog.groups.info("groups.list.success count=\(count, privacy: .public) cache=\(page.isFromCache, privacy: .public)")
    } catch {
      AppLog.groups.error("groups.list.failed errorType=\(AppLog.errorType(error), privacy: .public)")
      errorMessage = error.localizedDescription
      groups = []
      isShowingCachedData = false
    }
  }
}

/// A short list of groups to discover, shown by Descubrir and the search screen. A failed
/// refresh keeps the groups already shown.
@MainActor
final class GroupSuggestionsViewModel: ObservableObject {
  @Published private(set) var groups: [GroupSummary] = []
  @Published private(set) var isLoading = false
  @Published private(set) var errorMessage: String?
  @Published private(set) var isShowingCachedData = false

  private let repo: GroupsRepo
  private let limit: Int

  init(repo: GroupsRepo, limit: Int) {
    self.repo = repo
    self.limit = limit
  }

  func refresh() async {
    guard !isLoading else { return }
    isLoading = true
    errorMessage = nil
    defer { isLoading = false }
    do {
      let page = try await repo.fetchGroups(limit: limit)
      groups = page.items
      isShowingCachedData = page.isFromCache
    } catch {
      errorMessage = error.localizedDescription
    }
  }

  /// Groups whose name, description or category contains `query`, ignoring case and spaces
  /// around it. An empty query returns every group.
  func filtered(by query: String) -> [GroupSummary] {
    let query = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    guard !query.isEmpty else { return groups }
    return groups.filter { group in
      group.name.lowercased().contains(query)
        || group.description.lowercased().contains(query)
        || (group.categoryID?.lowercased().contains(query) ?? false)
    }
  }
}

/// The Chat button of a group: opens (or creates) the group's conversation.
@MainActor
final class GroupChatViewModel: ObservableObject {
  /// Set when the conversation is ready; the view navigates to it and clears it on the way back.
  @Published var openedConversationID: String?
  @Published private(set) var isOpening = false
  @Published private(set) var errorMessage: String?

  private let groupID: String
  private let chatRepo: ChatRepo

  init(groupID: String, chatRepo: ChatRepo) {
    self.groupID = groupID
    self.chatRepo = chatRepo
  }

  func open() async {
    guard !isOpening else { return }
    isOpening = true
    errorMessage = nil
    defer { isOpening = false }
    do {
      openedConversationID = try await chatRepo.openGroupConversation(groupID: groupID)
    } catch {
      errorMessage = (error as? LocalizedError)?.errorDescription ?? "No se pudo abrir el chat del grupo."
    }
  }
}

extension GroupsRepo {
  /// Joins a public group or asks the owner of a private one, like the web's `handleGroupAction`.
  /// Returns the new status: `.member` or `.pending`.
  func joinOrRequest(
    groupID: String,
    groupName: String,
    ownerID: String?,
    isPrivate: Bool,
    uid: String
  ) async throws -> GroupMembershipStatus {
    if isPrivate {
      guard let ownerID else { throw GroupsRepoError.privateGroup }
      try await requestToJoin(groupID: groupID, groupName: groupName, ownerID: ownerID, uid: uid)
      return .pending
    }
    try await joinGroup(groupID: groupID, uid: uid)
    return .member
  }
}

/// The join button of a group card (Discover, search and the groups list).
@MainActor
final class GroupCardViewModel: ObservableObject {
  /// nil while unknown (not loaded yet, signed out, or failed to load).
  @Published private(set) var status: GroupMembershipStatus?
  @Published private(set) var isWorking = false
  @Published private(set) var errorMessage: String?

  private let group: GroupSummary
  private let repo: GroupsRepo

  init(group: GroupSummary, repo: GroupsRepo) {
    self.group = group
    self.repo = repo
  }

  func loadStatus(uid: String?) async {
    guard let uid else { return }
    status = try? await repo.membershipStatus(groupID: group.id, ownerID: group.ownerID, uid: uid)
  }

  /// Only acts when the user is not in the group yet; leaving happens on the group's screen.
  func join(uid: String?) async {
    guard let uid, status == GroupMembershipStatus.none, !isWorking else { return }
    isWorking = true
    errorMessage = nil
    defer { isWorking = false }
    do {
      status = try await repo.joinOrRequest(
        groupID: group.id,
        groupName: group.name,
        ownerID: group.ownerID,
        isPrivate: group.visibility == .private,
        uid: uid
      )
    } catch {
      errorMessage = error.localizedDescription
    }
  }
}

@MainActor
final class GroupDetailViewModel: ObservableObject {
  @Published private(set) var detail: GroupDetail?
  @Published private(set) var isLoading = false
  @Published private(set) var errorMessage: String?
  @Published private(set) var isShowingCachedData = false
  @Published private(set) var isOnline = true

  private let repo: GroupsRepo
  private let groupID: String

  init(repo: GroupsRepo, groupID: String) {
    self.repo = repo
    self.groupID = groupID
  }

  func refresh() async {
    let normalizedGroupID = groupID.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !normalizedGroupID.isEmpty else {
      detail = nil
      errorMessage = "Grupo inválido."
      return
    }

    isLoading = true
    errorMessage = nil
    defer { isLoading = false }

    do {
      let loadedDetail = try await repo.fetchGroupDetail(
        groupID: normalizedGroupID,
        recentPostLimit: 5,
        topMemberLimit: 5
      )

      guard let loadedDetail else {
        detail = nil
        isShowingCachedData = false
        errorMessage = "Grupo no encontrado."
        return
      }

      detail = loadedDetail
      isShowingCachedData = loadedDetail.isFromCache
      AppLog.groups.info("groups.detail.success groupID=\(normalizedGroupID, privacy: .private) cache=\(loadedDetail.isFromCache, privacy: .public)")
    } catch {
      AppLog.groups.error("groups.detail.failed groupID=\(normalizedGroupID, privacy: .private) errorType=\(AppLog.errorType(error), privacy: .public)")
      errorMessage = error.localizedDescription
    }
  }

  /// nil while unknown (not loaded yet or failed to load).
  @Published private(set) var membership: GroupMembershipStatus?
  @Published private(set) var isUpdatingMembership = false
  @Published private(set) var membershipError: String?

  var isMember: Bool? { membership.map(\.isJoined) }

  /// Needs the detail loaded first, to know the owner.
  func loadMembership(uid: String?) async {
    guard let uid else { return }
    do {
      membership = try await repo.membershipStatus(groupID: groupID, ownerID: detail?.ownerID, uid: uid)
    } catch {
      AppLog.groups.error("groups.membership.failed errorType=\(AppLog.errorType(error), privacy: .public)")
    }
  }

  /// The group's main button: join a public group, ask to join a private one, or leave.
  /// The owner can't leave their own group, and a pending request just waits.
  func performMembershipAction(uid: String?) async {
    guard let uid, let membership, !isUpdatingMembership else { return }
    isUpdatingMembership = true
    membershipError = nil
    defer { isUpdatingMembership = false }
    do {
      switch membership {
      case .member:
        try await repo.leaveGroup(groupID: groupID, uid: uid)
        self.membership = GroupMembershipStatus.none
      case .none:
        self.membership = try await repo.joinOrRequest(
          groupID: groupID,
          groupName: detail?.name ?? "",
          ownerID: detail?.ownerID,
          isPrivate: detail?.visibility == .private,
          uid: uid
        )
      case .owner, .pending:
        break
      }
    } catch {
      membershipError = error.localizedDescription
    }
  }

  func handleConnectivityChange(_ online: Bool) {
    let wasOnline = isOnline
    isOnline = online

    if !wasOnline && online && (isShowingCachedData || detail == nil) {
      Task {
        await refresh()
      }
    }
  }
}

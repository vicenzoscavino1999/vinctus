import Foundation
@testable import VinctusNative

/// In-memory repos for view model tests: they record calls and fail on request.
struct FakeError: LocalizedError {
  var errorDescription: String? { "Falló la prueba" }
}

final class FakeChatRepo: ChatRepo {
  var sentTexts: [String] = []
  var failsToSend = false

  func observeConversations(
    onChange: @escaping ([ChatConversation]) -> Void,
    onError: @escaping (Error) -> Void
  ) -> ChatSubscription {
    ChatSubscription {}
  }

  func observeMessages(
    conversationID: String,
    onChange: @escaping ([ChatMessage]) -> Void,
    onError: @escaping (Error) -> Void
  ) -> ChatSubscription {
    ChatSubscription {}
  }

  func sendMessage(conversationID: String, text: String) async throws {
    if failsToSend { throw FakeError() }
    sentTexts.append(text)
  }

  func markRead(conversationID: String) async {}
  func openDirectConversation(with otherUserID: String) async throws -> String { "dm_\(otherUserID)" }
  func openGroupConversation(groupID: String) async throws -> String { "grp_\(groupID)" }
}

final class FakeGroupsRepo: GroupsRepo {
  var members: Set<String> = []
  var failsToUpdate = false
  var joinCalls = 0
  var leaveCalls = 0

  func fetchGroups(limit: Int) async throws -> GroupsPage {
    GroupsPage(items: [], isFromCache: false)
  }

  func fetchGroupDetail(groupID: String, recentPostLimit: Int, topMemberLimit: Int) async throws -> GroupDetail? {
    nil
  }

  func isMember(groupID: String, uid: String) async throws -> Bool {
    members.contains(uid)
  }

  func joinGroup(groupID: String, uid: String) async throws {
    joinCalls += 1
    if failsToUpdate { throw GroupsRepoError.privateGroup }
    members.insert(uid)
  }

  func leaveGroup(groupID: String, uid: String) async throws {
    leaveCalls += 1
    if failsToUpdate { throw FakeError() }
    members.remove(uid)
  }

  var requests: [String] = []

  func membershipStatus(groupID: String, ownerID: String?, uid: String) async throws -> GroupMembershipStatus {
    if ownerID == uid { return .owner }
    if members.contains(uid) { return .member }
    return requests.contains(uid) ? .pending : .none
  }

  func requestToJoin(groupID: String, groupName: String, ownerID: String, uid: String) async throws {
    requests.append(uid)
  }

  var updates: [GroupUpdate] = []
  var uploadedIcons = 0

  func updateGroup(groupID: String, _ update: GroupUpdate) async throws {
    if failsToUpdate { throw FakeError() }
    updates.append(update)
  }

  func uploadGroupIcon(ownerID: String, groupID: String, jpegData: Data) async throws -> String {
    uploadedIcons += 1
    return "https://example.com/groups/\(ownerID)/\(groupID)/icon.jpg"
  }
}

final class FakeProfileRepo: ProfileRepo {
  var profile: UserProfile?
  var failsToLoad = false

  func fetchUserProfile(uid: String) async throws -> UserProfile? {
    if failsToLoad { throw FakeError() }
    return profile
  }

  func updateProfile(uid: String, _ update: ProfileUpdate) async throws {}
  func uploadProfilePhoto(uid: String, jpegData: Data) async throws -> String { "" }

  static func sample(id: String = "u1") -> UserProfile {
    UserProfile(
      id: id, displayName: "Lucía", photoURL: nil, username: "lucia", email: nil, bio: nil,
      role: nil, location: nil, reputation: 0, followersCount: 0, followingCount: 0, postsCount: 0,
      accountVisibility: .public, createdAt: Date(), updatedAt: Date()
    )
  }
}

final class FakeEngagementRepo: EngagementRepo {
  var likedPostIDs: Set<String> = []
  var status = FollowStatus.none
  var fails = false
  var likeWrites: [Bool] = []
  var followCalls = 0
  var unfollowCalls = 0

  func isPostLiked(postID: String) async throws -> Bool {
    likedPostIDs.contains(postID)
  }

  func setPostLiked(_ liked: Bool, postID: String) async throws {
    likeWrites.append(liked)
    if fails { throw FakeError() }
    if liked { likedPostIDs.insert(postID) } else { likedPostIDs.remove(postID) }
  }

  func followStatus(targetUID: String) async throws -> FollowStatus {
    if fails { throw FakeError() }
    return status
  }

  func follow(targetUID: String, isPrivate: Bool) async throws -> FollowStatus {
    followCalls += 1
    if fails { throw FakeError() }
    status = isPrivate ? .requested : .following
    return status
  }

  func unfollow(targetUID: String, status: FollowStatus) async throws {
    unfollowCalls += 1
    if fails { throw FakeError() }
    self.status = .none
  }
}

final class FakeProfileContentRepo: ProfileContentRepo {
  var posts: [FeedItem] = []
  var followLists: [FollowListKind: [ProfileUserSummary]] = [:]
  var incomingRequests: [IncomingFollowRequest] = []
  var answers: [(fromUID: String, accept: Bool)] = []
  var contributions: [Contribution] = []
  var createdContributions: [NewContribution] = []
  var followedCategories: [String] = []
  var categoryWrites: [(followed: Bool, categoryID: String)] = []
  var savedDebates: [SavedDebate] = []
  var removedDebateIDs: [String] = []
  var deletedContributionIDs: [String] = []
  var failsToLoad = false
  var failsToWrite = false
  var fetchFollowListCalls = 0

  func fetchPosts(uid: String, limit: Int, after cursor: ProfileListCursor?) async throws -> ProfileListPage<FeedItem> {
    if failsToLoad { throw FakeError() }
    return ProfileListPage(items: posts, next: nil)
  }

  func fetchFollowList(
    uid: String, kind: FollowListKind, limit: Int, after cursor: ProfileListCursor?
  ) async throws -> ProfileListPage<ProfileUserSummary> {
    fetchFollowListCalls += 1
    if failsToLoad { throw FakeError() }
    return ProfileListPage(items: followLists[kind] ?? [], next: nil)
  }

  func fetchIncomingFollowRequests() async throws -> [IncomingFollowRequest] {
    if failsToLoad { throw FakeError() }
    return incomingRequests
  }

  func hasPendingFollowRequest(from fromUID: String) async throws -> Bool {
    incomingRequests.contains { $0.from.id == fromUID }
  }

  func answerFollowRequest(from fromUID: String, accept: Bool) async throws {
    answers.append((fromUID: fromUID, accept: accept))
    if failsToWrite { throw FakeError() }
    incomingRequests.removeAll { $0.from.id == fromUID }
  }

  func fetchContributions(uid: String) async throws -> [Contribution] {
    if failsToLoad { throw FakeError() }
    return contributions
  }

  func createContribution(_ contribution: NewContribution) async throws {
    _ = try contribution.validated()
    if failsToWrite { throw FakeError() }
    createdContributions.append(contribution)
  }

  func deleteContribution(id: String) async throws {
    deletedContributionIDs.append(id)
    if failsToWrite { throw FakeError() }
    contributions.removeAll { $0.id == id }
  }

  func fetchFollowedCategories() async throws -> [String] {
    if failsToLoad { throw FakeError() }
    return followedCategories
  }

  func setCategoryFollowed(_ followed: Bool, categoryID: String) async throws {
    categoryWrites.append((followed: followed, categoryID: categoryID))
    if failsToWrite { throw FakeError() }
  }

  func fetchSavedDebates() async throws -> [SavedDebate] {
    if failsToLoad { throw FakeError() }
    return savedDebates
  }

  func saveDebate(_ debate: SavedDebate) async throws {
    savedDebates.append(debate)
  }

  func removeSavedDebate(id: String) async throws {
    removedDebateIDs.append(id)
    if failsToWrite { throw FakeError() }
  }

  static func user(_ id: String) -> ProfileUserSummary {
    ProfileUserSummary(id: id, name: "Usuario \(id)", photoURL: nil, username: id)
  }

  static func debate(_ id: String) -> SavedDebate {
    SavedDebate(
      id: id, topic: "Tema \(id)", personaA: "scientist", personaB: "skeptic",
      summary: nil, winner: nil, createdAt: nil
    )
  }

  static func contribution(_ id: String) -> Contribution {
    Contribution(
      id: id, type: .project, title: "Aporte \(id)", description: nil, link: nil,
      fileURL: nil, fileName: nil, categoryID: nil, createdAt: Date()
    )
  }
}

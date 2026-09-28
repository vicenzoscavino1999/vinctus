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

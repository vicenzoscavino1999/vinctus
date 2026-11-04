import Foundation
@testable import VinctusNative

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

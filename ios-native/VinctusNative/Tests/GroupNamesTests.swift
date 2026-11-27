import XCTest
@testable import VinctusNative

private final class CountingGroupNamesRepo: GroupNamesRepo {
  var names: [String: String] = [:]
  var calls: [String] = []
  var fails = false

  func name(groupID: String) async throws -> String? {
    calls.append(groupID)
    if fails { throw FakeError() }
    return names[groupID]
  }
}

@MainActor
final class GroupNamesTests: XCTestCase {
  func testAsksEachGroupOnce() async {
    let repo = CountingGroupNamesRepo()
    repo.names = ["g1": "Física para curiosos"]
    let names = GroupNames(repo: repo)

    await names.load("g1")
    await names.load("g1")

    XCTAssertEqual(names.name(for: "g1"), "Física para curiosos")
    XCTAssertEqual(repo.calls, ["g1"])
    XCTAssertNil(names.name(for: nil))
  }

  func testAFailureIsAskedAgainLater() async {
    let repo = CountingGroupNamesRepo()
    repo.fails = true
    let names = GroupNames(repo: repo)

    await names.load("g2")
    XCTAssertNil(names.name(for: "g2"))

    repo.fails = false
    repo.names = ["g2": "Jazz y café"]
    await names.load("g2")
    XCTAssertEqual(names.name(for: "g2"), "Jazz y café")
    XCTAssertEqual(repo.calls, ["g2", "g2"])
  }

  func testPostsKeepTheirGroup() {
    let inGroup = FirebaseFeedRepo.feedItem(id: "p1", data: ["text": "Hola", "groupId": "g1"])
    let alone = FirebaseFeedRepo.feedItem(id: "p2", data: ["text": "Hola"])
    XCTAssertEqual(inGroup.groupID, "g1")
    XCTAssertNil(alone.groupID)
  }

  func testThePostLinkIsTheWebPostPage() {
    XCTAssertEqual(PostLinks.webURL(postID: "abc").absoluteString, "https://vinctus.vercel.app/post/abc")
  }
}

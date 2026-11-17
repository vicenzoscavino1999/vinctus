import FirebaseFirestore
import XCTest
@testable import VinctusNative

private final class FakeSavedPostsRepo: SavedPostsRepo {
  var handler: (() async throws -> SavedPostsPage)?
  var cursors: [SavedPostsCursor?] = []
  func fetchSavedPosts(limit: Int, after cursor: SavedPostsCursor?) async throws -> SavedPostsPage {
    cursors.append(cursor)
    return try await handler?() ?? SavedPostsPage(items: [], next: nil)
  }
}

@MainActor
final class SavedPostsTests: XCTestCase {
  func testEmptyPagesKeepTheirCursorAndFailedPagesCanRetry() async {
    let repo = FakeSavedPostsRepo()
    let cursor = SavedPostsCursor(token: "gone")
    repo.handler = { SavedPostsPage(items: [], next: cursor) }
    let vm = SavedPostsViewModel(repo: repo)
    await vm.load()
    XCTAssertTrue(vm.canLoadMore)
    repo.handler = { throw FakeError() }
    await vm.loadMore()
    XCTAssertNotNil(vm.errorMessage)
    XCTAssertTrue(vm.canLoadMore)
    repo.handler = {
      SavedPostsPage(items: [FeedItem(id: "p1", authorID: "a", authorName: "Ana", text: "Hola", createdAt: nil, likeCount: 0, commentCount: 0)], next: nil)
    }
    await vm.loadMore()
    XCTAssertEqual(vm.items.map(\.id), ["p1"])
    XCTAssertEqual(repo.cursors.compactMap { $0?.token }, ["gone", "gone"])
    XCTAssertFalse(vm.canLoadMore)
  }

  func testRefreshDiscardsAnOldPageAndFailureRetainsVisiblePosts() async {
    let repo = FakeSavedPostsRepo()
    let cursor = SavedPostsCursor(token: "gone")
    repo.handler = { SavedPostsPage(items: [], next: cursor) }
    let vm = SavedPostsViewModel(repo: repo)
    await vm.load()
    let started = expectation(description: "Old saved page")
    var release: CheckedContinuation<SavedPostsPage, Never>?
    repo.handler = { await withCheckedContinuation { release = $0; started.fulfill() } }
    let old = Task { await vm.loadMore() }
    await fulfillment(of: [started], timeout: 2)
    repo.handler = {
      SavedPostsPage(items: [FeedItem(id: "fresh", authorID: "a", authorName: "Ana", text: "Hola", createdAt: nil, likeCount: 0, commentCount: 0)], next: nil)
    }
    await vm.load()
    release?.resume(returning: SavedPostsPage(items: [], next: cursor))
    await old.value
    XCTAssertEqual(vm.items.map(\.id), ["fresh"])
    XCTAssertFalse(vm.canLoadMore)
    repo.handler = { throw FakeError() }
    await vm.load()
    XCTAssertEqual(vm.items.map(\.id), ["fresh"])
    XCTAssertNotNil(vm.errorMessage)
  }
}

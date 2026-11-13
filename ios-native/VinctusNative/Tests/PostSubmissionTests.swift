import XCTest
@testable import VinctusNative

private final class PendingCommentsRepo: PostCommentsRepo {
  var sent: [(text: String, id: String)] = []
  var fails = false
  var sendHandler: (() async throws -> Void)?
  var fetchHandler: (() async throws -> PostCommentsPage)?

  func fetchComments(postID: String, limit: Int) async throws -> PostCommentsPage {
    if let fetchHandler { return try await fetchHandler() }
    return PostCommentsPage(items: [], isFromCache: false)
  }

  func addComment(postID: String, text: String, commentID: String) async throws {
    sent.append((text, commentID))
    if let sendHandler { try await sendHandler() }
    if fails { throw FakeError() }
  }
}

private final class PendingPostsRepo: CreatePostRepo {
  var sentIDs: [String] = []
  var fails = false
  var sendHandler: (() async throws -> Void)?
  func makePostID() -> String { UUID().uuidString }
  func publishTextPost(text: String, postID: String, groupID: String?) async throws {
    sentIDs.append(postID)
    if let sendHandler { try await sendHandler() }
    if fails { throw FakeError() }
  }
}

private final class PendingFeedRepo: FeedRepo {
  var handler: (() async throws -> FeedPage)?
  func fetchFeedPage(limit: Int, after cursor: FeedCursor?) async throws -> FeedPage {
    if let handler { return try await handler() }
    return FeedPage(items: [], nextCursor: nil, hasMore: true, isFromCache: false)
  }
}

@MainActor
final class PostSubmissionTests: XCTestCase {
  func testRefreshInvalidatesAPendingFeedPage() async {
    let repo = PendingFeedRepo()
    let vm = FeedViewModel(repo: repo)
    await vm.refresh()
    let started = expectation(description: "Older feed page")
    var release: CheckedContinuation<FeedPage, Never>?
    repo.handler = {
      await withCheckedContinuation { release = $0; started.fulfill() }
    }
    vm.triggerLoadMoreFromFooter()
    await fulfillment(of: [started], timeout: 2)
    repo.handler = {
      FeedPage(items: [FeedItem(id: "fresh", authorID: "a", authorName: "Ana", text: "Nuevo", createdAt: nil, likeCount: 0, commentCount: 0)], nextCursor: nil, hasMore: false, isFromCache: false)
    }
    await vm.refresh()
    release?.resume(returning: FeedPage(items: [], nextCursor: nil, hasMore: true, isFromCache: false))
    // Let the older task finish; neither its result nor its cursor may win.
    for _ in 0..<10 { await Task.yield() }
    XCTAssertEqual(vm.items.map(\.id), ["fresh"])
    XCTAssertFalse(vm.canLoadMore)
    XCTAssertFalse(vm.isLoadingMore)
  }

  func testCommentRetryKeepsItsIDAndDraftUntilSuccess() async {
    let repo = PendingCommentsRepo()
    repo.fails = true
    let vm = PostDetailViewModel(postID: "p1", repo: repo)
    vm.draftComment = "Hola"
    await vm.submitComment()?.value
    XCTAssertEqual(vm.draftComment, "Hola")
    XCTAssertNotNil(vm.errorMessage)
    repo.fails = false
    await vm.submitComment()?.value
    XCTAssertEqual(repo.sent.count, 2)
    XCTAssertEqual(repo.sent.first?.id, repo.sent.last?.id)
    XCTAssertEqual(vm.draftComment, "")
  }

  func testChangedFailedCommentGetsAnotherID() async {
    let repo = PendingCommentsRepo()
    repo.fails = true
    let vm = PostDetailViewModel(postID: "p1", repo: repo)
    vm.draftComment = "Hola"
    await vm.submitComment()?.value
    vm.draftComment = "Otra idea"
    await vm.submitComment()?.value
    XCTAssertNotEqual(repo.sent.first?.id, repo.sent.last?.id)
  }

  func testCommentDoubleTapIsBlockedAndNewDraftSurvives() async {
    let repo = PendingCommentsRepo()
    let vm = PostDetailViewModel(postID: "p1", repo: repo)
    let started = expectation(description: "Sending")
    var release: CheckedContinuation<Void, Never>?
    repo.sendHandler = {
      await withCheckedContinuation { release = $0; started.fulfill() }
    }
    vm.draftComment = "Primero"
    let send = vm.submitComment()
    XCTAssertNil(vm.submitComment())
    await fulfillment(of: [started], timeout: 2)
    vm.draftComment = "Segundo"
    release?.resume()
    await send?.value
    XCTAssertEqual(repo.sent.count, 1)
    XCTAssertEqual(vm.draftComment, "Segundo")
  }

  func testPostSuccessPreservesAnotherDraftAndFailureRetriesTheSamePost() async {
    let repo = PendingPostsRepo()
    let vm = CreatePostViewModel(repo: repo)
    repo.fails = true
    vm.draftText = "Hola"
    await vm.submit()?.value
    XCTAssertEqual(vm.draftText, "Hola")
    XCTAssertTrue(vm.canRetryPendingSubmission)

    let started = expectation(description: "Retrying")
    var release: CheckedContinuation<Void, Never>?
    repo.fails = false
    repo.sendHandler = {
      await withCheckedContinuation { release = $0; started.fulfill() }
    }
    let send = vm.retryPendingSubmission()
    XCTAssertNil(vm.submit())
    await fulfillment(of: [started], timeout: 2)
    vm.draftText = "Otra publicación"
    release?.resume()
    await send?.value
    XCTAssertEqual(Set(repo.sentIDs).count, 1)
    XCTAssertEqual(vm.draftText, "Otra publicación")
  }

  func testCommentsIgnoreAnOldRefreshThatFinishesLast() async {
    let repo = PendingCommentsRepo()
    let vm = PostDetailViewModel(postID: "p1", repo: repo)
    let started = expectation(description: "Old refresh")
    var release: CheckedContinuation<PostCommentsPage, Never>?
    repo.fetchHandler = {
      await withCheckedContinuation { release = $0; started.fulfill() }
    }
    let old = Task { await vm.refreshComments() }
    await fulfillment(of: [started], timeout: 2)
    repo.fetchHandler = { PostCommentsPage(items: [PostComment(id: "fresh", authorID: "a", authorName: "Ana", text: "Nuevo", createdAt: nil)], isFromCache: false) }
    await vm.refreshComments()
    release?.resume(returning: PostCommentsPage(items: [], isFromCache: true))
    await old.value
    XCTAssertEqual(vm.comments.map(\.id), ["fresh"])
    XCTAssertFalse(vm.isShowingCachedData)
    XCTAssertFalse(vm.isLoadingComments)
  }
}

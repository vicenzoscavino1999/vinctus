import FirebaseFirestore
import XCTest
@testable import VinctusNative

private final class PendingCommentsRepo: PostCommentsRepo {
  var sent: [(text: String, id: String)] = []
  var fails = false
  var sendHandler: (() async throws -> Void)?
  var fetchHandler: (() async throws -> PostCommentsPage)?
  var fetchedCursors: [PostCommentsCursor?] = []

  func fetchComments(postID: String, limit: Int, after cursor: PostCommentsCursor?) async throws -> PostCommentsPage {
    fetchedCursors.append(cursor)
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
  var drafts: [NativePostDraft] = []
  var fails = false
  var sendHandler: (() async throws -> Void)?
  func makePostID() -> String { UUID().uuidString }
  func publishPost(_ draft: NativePostDraft, postID: String, groupID: String?, onProgress: @escaping (Double) -> Void) async throws {
    sentIDs.append(postID)
    drafts.append(draft)
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
  func testMediaOnlyPostKeepsItsSelectionAndIDAfterFailure() async throws {
    let repo = PendingPostsRepo()
    repo.fails = true
    let vm = CreatePostViewModel(repo: repo)
    let url = ChatPendingAttachment.temporaryURL(extension: "pdf")
    try Data("%PDF-1.4".utf8).write(to: url)
    let file = ChatPendingAttachment(fileURL: url, fileName: "Notas.pdf", contentType: "application/pdf", size: 8, kind: .document)
    try vm.addAttachment(file)
    XCTAssertTrue(vm.canSubmit)
    await vm.submit()?.value
    XCTAssertEqual(vm.attachments.map(\.id), [file.id])
    XCTAssertTrue(vm.canRetryPendingSubmission)
    repo.fails = false
    await vm.retryPendingSubmission()?.value
    XCTAssertEqual(Set(repo.sentIDs).count, 1)
    XCTAssertEqual(repo.drafts.last?.normalizedTitle, "Publicación")
    XCTAssertTrue(vm.attachments.isEmpty)
  }

  func testInvalidYouTubeLinkAndTooManyMediaSlotsAreRejected() throws {
    let vm = CreatePostViewModel(repo: PendingPostsRepo())
    vm.youtubeURL = "https://example.com/video"
    XCTAssertFalse(vm.canSubmit)
    XCTAssertNil(vm.submit())
    XCTAssertNotNil(vm.errorMessage)
    vm.youtubeURL = "https://youtu.be/dQw4w9WgXcQ"
    XCTAssertTrue(vm.canSubmit)
    for _ in 0..<9 {
      let url = ChatPendingAttachment.temporaryURL(extension: "jpg")
      try Data([1]).write(to: url)
      try vm.addAttachment(ChatPendingAttachment(fileURL: url, fileName: "Foto.jpg", contentType: "image/jpeg", size: 1, kind: .image))
    }
    let extra = ChatPendingAttachment(fileURL: URL(fileURLWithPath: "/unused"), fileName: "Foto.jpg", contentType: "image/jpeg", size: 1, kind: .image)
    XCTAssertThrowsError(try vm.addAttachment(extra))
  }
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
    let vm = PostDetailViewModel(postID: "p1", repo: repo, initialCommentCount: 100)
    vm.draftComment = "Hola"
    await vm.submitComment()?.value
    XCTAssertEqual(vm.draftComment, "Hola")
    XCTAssertNotNil(vm.errorMessage)
    XCTAssertEqual(vm.commentCount, 100)
    repo.fails = false
    await vm.submitComment()?.value
    XCTAssertEqual(repo.sent.count, 2)
    XCTAssertEqual(repo.sent.first?.id, repo.sent.last?.id)
    XCTAssertEqual(vm.draftComment, "")
    XCTAssertEqual(vm.commentCount, 101)
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

  func testOlderCommentsDeduplicateAndRetryTheSameCursorAfterFailure() async {
    let repo = PendingCommentsRepo()
    let vm = PostDetailViewModel(postID: "p1", repo: repo)
    let cursor = PostCommentsCursor(token: "c2")
    let newest = PostComment(id: "c3", authorID: "a", authorName: "Ana", text: "Reciente", createdAt: nil)
    let older = PostComment(id: "c2", authorID: "a", authorName: "Ana", text: "Anterior", createdAt: nil)
    repo.fetchHandler = {
      PostCommentsPage(items: [newest], isFromCache: false, nextCursor: cursor, hasMore: true)
    }
    await vm.refreshComments()
    repo.fetchHandler = { throw FakeError() }
    await vm.loadMoreComments()
    XCTAssertEqual(vm.comments.map(\.id), ["c3"])
    XCTAssertTrue(vm.canLoadMoreComments)
    XCTAssertNotNil(vm.loadMoreErrorMessage)
    XCTAssertFalse(vm.isLoadingMoreComments)

    repo.fetchHandler = { PostCommentsPage(items: [newest, older], isFromCache: true) }
    await vm.loadMoreComments()
    XCTAssertEqual(repo.fetchedCursors.compactMap { $0?.token }, ["c2", "c2"])
    XCTAssertEqual(vm.comments.map(\.id), ["c3", "c2"])
    XCTAssertNil(vm.loadMoreErrorMessage)
    XCTAssertTrue(vm.isShowingCachedData)
    XCTAssertFalse(vm.canLoadMoreComments)
    await vm.loadMoreComments()
    XCTAssertEqual(repo.fetchedCursors.count, 3)
  }

  func testRefreshInvalidatesAnOlderCommentsPageAndBlocksDoubleLoad() async {
    let repo = PendingCommentsRepo()
    let vm = PostDetailViewModel(postID: "p1", repo: repo)
    let cursor = PostCommentsCursor(token: "old")
    repo.fetchHandler = { PostCommentsPage(items: [], isFromCache: false, nextCursor: cursor, hasMore: true) }
    await vm.refreshComments()
    let started = expectation(description: "Older comments page")
    var release: CheckedContinuation<PostCommentsPage, Never>?
    repo.fetchHandler = {
      await withCheckedContinuation { release = $0; started.fulfill() }
    }
    let old = Task { await vm.loadMoreComments() }
    await fulfillment(of: [started], timeout: 2)
    await vm.loadMoreComments()
    XCTAssertEqual(repo.fetchedCursors.count, 2)
    repo.fetchHandler = {
      PostCommentsPage(items: [PostComment(id: "fresh", authorID: "a", authorName: "Ana", text: "Nuevo", createdAt: nil)], isFromCache: false)
    }
    await vm.refreshComments()
    release?.resume(returning: PostCommentsPage(items: [], isFromCache: true, nextCursor: cursor, hasMore: true))
    await old.value
    XCTAssertEqual(vm.comments.map(\.id), ["fresh"])
    XCTAssertFalse(vm.canLoadMoreComments)
    XCTAssertFalse(vm.isShowingCachedData)
    XCTAssertFalse(vm.isLoadingMoreComments)
  }

  func testSendingWhileAnOlderPageIsLoadingRefreshesToTheNewComment() async {
    let repo = PendingCommentsRepo()
    let vm = PostDetailViewModel(postID: "p1", repo: repo)
    let cursor = PostCommentsCursor(token: "old")
    repo.fetchHandler = { PostCommentsPage(items: [], isFromCache: false, nextCursor: cursor, hasMore: true) }
    await vm.refreshComments()
    let started = expectation(description: "Older comments page")
    var release: CheckedContinuation<PostCommentsPage, Never>?
    repo.fetchHandler = {
      await withCheckedContinuation { release = $0; started.fulfill() }
    }
    let old = Task { await vm.loadMoreComments() }
    await fulfillment(of: [started], timeout: 2)
    repo.fetchHandler = {
      PostCommentsPage(items: [PostComment(id: "sent", authorID: "a", authorName: "Ana", text: "Nuevo", createdAt: nil)], isFromCache: false)
    }
    vm.draftComment = "Nuevo"
    await vm.submitComment()?.value
    release?.resume(returning: PostCommentsPage(items: [], isFromCache: true, nextCursor: cursor, hasMore: true))
    await old.value
    XCTAssertEqual(vm.comments.map(\.id), ["sent"])
    XCTAssertEqual(vm.submittedCommentCount, 1)
    XCTAssertFalse(vm.canLoadMoreComments)
    XCTAssertFalse(vm.isLoadingMoreComments)
  }
}

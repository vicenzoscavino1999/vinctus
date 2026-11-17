import XCTest
@testable import VinctusNative

@MainActor
final class PostReactionViewModelTests: XCTestCase {
  func testLoadsWhetherThePostIsLiked() async {
    let repo = FakeEngagementRepo()
    repo.likedPostIDs = ["p1"]
    let vm = PostReactionViewModel(postID: "p1", repo: repo)

    await vm.load()

    XCTAssertTrue(vm.isSelected)
    XCTAssertEqual(vm.displayedCount(initialCount: 4), 4)
  }

  func testLikeAndUnlikeUpdateTheCount() async {
    let repo = FakeEngagementRepo()
    let vm = PostReactionViewModel(postID: "p1", repo: repo)
    await vm.load()

    await vm.toggle(initialCount: 4)
    XCTAssertTrue(vm.isSelected)
    XCTAssertEqual(vm.displayedCount(initialCount: 4), 5)

    await vm.toggle(initialCount: 4)
    XCTAssertFalse(vm.isSelected)
    XCTAssertEqual(vm.displayedCount(initialCount: 4), 4)
    XCTAssertEqual(repo.likeWrites, [true, false])
    XCTAssertFalse(vm.isSaving)
  }

  func testAFailedLikeIsRolledBack() async {
    let repo = FakeEngagementRepo()
    repo.fails = true
    let vm = PostReactionViewModel(postID: "p1", repo: repo)
    await vm.load()

    await vm.toggle(initialCount: 4)

    XCTAssertFalse(vm.isSelected)
    XCTAssertEqual(vm.displayedCount(initialCount: 4), 4)
    XCTAssertFalse(vm.isSaving)
  }

  func testTheCountNeverGoesBelowZero() async {
    let repo = FakeEngagementRepo()
    repo.likedPostIDs = ["p1"]
    let vm = PostReactionViewModel(postID: "p1", repo: repo)
    await vm.load()

    // The post still says 0 likes because the counter trigger has not run yet.
    await vm.toggle(initialCount: 0)

    XCTAssertEqual(vm.displayedCount(initialCount: 0), 0)
  }

  func testFailedLookupDoesNotGuessFalseOrWrite() async {
    let repo = FakeEngagementRepo()
    repo.readFails = true
    repo.likedPostIDs = ["p1"]
    let vm = PostReactionViewModel(postID: "p1", repo: repo)
    await vm.load()
    await vm.toggle(initialCount: 3)
    XCTAssertFalse(vm.isLoaded)
    XCTAssertTrue(repo.likeWrites.isEmpty)
    XCTAssertNotNil(vm.errorMessage)
    repo.readFails = false
    await vm.load()
    XCTAssertTrue(vm.isSelected)
    XCTAssertTrue(vm.isLoaded)
  }

  func testLostConfirmationRetriesTheSameChoiceAndRestoresAnExactZeroCount() async {
    let repo = FakeEngagementRepo()
    repo.likedPostIDs = ["p1"]
    let vm = PostReactionViewModel(postID: "p1", repo: repo)
    await vm.load()
    repo.writeHandler = { repo.likedPostIDs.remove("p1"); throw FakeError() }
    await vm.toggle(initialCount: 0)
    XCTAssertTrue(vm.isSelected)
    XCTAssertEqual(vm.displayedCount(initialCount: 0), 0)
    XCTAssertEqual(vm.pendingValue, false)
    repo.writeHandler = nil
    await vm.toggle(initialCount: 0)
    XCTAssertEqual(repo.likeWrites, [false, false])
    XCTAssertFalse(vm.isSelected)
    XCTAssertNil(vm.pendingValue)
    XCTAssertNil(vm.errorMessage)
  }

  func testPendingWritesBlockDoubleTapAndLateRefresh() async {
    let repo = FakeEngagementRepo()
    let vm = PostReactionViewModel(postID: "p1", repo: repo)
    await vm.load()
    let started = expectation(description: "Writing like")
    var release: CheckedContinuation<Void, Never>?
    repo.writeHandler = {
      await withCheckedContinuation { release = $0; started.fulfill() }
    }
    let first = Task { await vm.toggle(initialCount: 2) }
    await fulfillment(of: [started], timeout: 2)
    await vm.toggle(initialCount: 2)
    await vm.load()
    XCTAssertEqual(repo.likeWrites, [true])
    release?.resume()
    await first.value
    XCTAssertTrue(vm.isSelected)
    XCTAssertEqual(vm.displayedCount(initialCount: 2), 3)
  }

  func testSaveRetryKeepsTheIntendedValue() async {
    let repo = FakeEngagementRepo()
    let vm = PostReactionViewModel(postID: "p1", repo: repo, kind: .save)
    await vm.load()
    repo.fails = true
    await vm.toggle(initialCount: 0)
    XCTAssertFalse(vm.isSelected)
    XCTAssertEqual(vm.pendingValue, true)
    repo.fails = false
    await vm.toggle(initialCount: 0)
    XCTAssertTrue(vm.isSelected)
    XCTAssertEqual(repo.saveWrites, [true, true])
  }

  func testNewServerCountsReconcileLocalChangesWithoutReplacingAPendingChoice() async {
    let repo = FakeEngagementRepo()
    let vm = PostReactionViewModel(postID: "p1", repo: repo)
    await vm.load()
    await vm.toggle(initialCount: 2)
    vm.syncCount(4)
    XCTAssertEqual(vm.displayedCount(initialCount: 2), 4)
    repo.fails = true
    await vm.toggle(initialCount: 4)
    vm.syncCount(3)
    XCTAssertEqual(vm.displayedCount(initialCount: 3), 4)
    XCTAssertEqual(vm.pendingValue, false)
    repo.fails = false
    await vm.toggle(initialCount: 3)
    XCTAssertEqual(vm.displayedCount(initialCount: 3), 3)
    vm.syncCount(5)
    XCTAssertEqual(vm.displayedCount(initialCount: 3), 5)
  }
}

@MainActor
final class FollowViewModelTests: XCTestCase {
  func testNothingHappensBeforeTheStatusLoads() async {
    let repo = FakeEngagementRepo()
    let vm = FollowViewModel(targetUID: "u2", repo: repo)

    await vm.toggle(isPrivate: false)

    XCTAssertNil(vm.status)
    XCTAssertEqual(repo.followCalls, 0)
  }

  func testFollowAndUnfollowAPublicAccount() async {
    let repo = FakeEngagementRepo()
    let vm = FollowViewModel(targetUID: "u2", repo: repo)
    await vm.load()
    XCTAssertEqual(vm.status, FollowStatus.none)
    XCTAssertEqual(vm.title, "Seguir")

    await vm.toggle(isPrivate: false)
    XCTAssertEqual(vm.status, .following)
    XCTAssertEqual(vm.title, "Siguiendo")

    await vm.toggle(isPrivate: false)
    XCTAssertEqual(vm.status, FollowStatus.none)
    XCTAssertEqual(repo.unfollowCalls, 1)
    XCTAssertFalse(vm.isSaving)
  }

  func testAPrivateAccountGetsARequest() async {
    let repo = FakeEngagementRepo()
    let vm = FollowViewModel(targetUID: "u2", repo: repo)
    await vm.load()

    await vm.toggle(isPrivate: true)

    XCTAssertEqual(vm.status, .requested)
    XCTAssertEqual(vm.title, "Solicitud enviada")
  }

  func testAFailedFollowShowsAMessageAndKeepsTheStatus() async {
    let repo = FakeEngagementRepo()
    let vm = FollowViewModel(targetUID: "u2", repo: repo)
    await vm.load()
    repo.fails = true

    await vm.toggle(isPrivate: false)

    XCTAssertEqual(vm.status, FollowStatus.none)
    XCTAssertEqual(vm.errorMessage, "No se pudo actualizar. Intenta de nuevo.")
    XCTAssertFalse(vm.isSaving)
  }

  func testAFailedStatusLoadMeansNotFollowing() async {
    let repo = FakeEngagementRepo()
    repo.fails = true
    let vm = FollowViewModel(targetUID: "u2", repo: repo)

    await vm.load()

    XCTAssertEqual(vm.status, FollowStatus.none)
  }
}

import XCTest
@testable import VinctusNative

@MainActor
final class LikeViewModelTests: XCTestCase {
  func testLoadsWhetherThePostIsLiked() async {
    let repo = FakeEngagementRepo()
    repo.likedPostIDs = ["p1"]
    let vm = LikeViewModel(postID: "p1", repo: repo)

    await vm.load()

    XCTAssertTrue(vm.isLiked)
    XCTAssertEqual(vm.displayedCount(initialCount: 4), 4)
  }

  func testLikeAndUnlikeUpdateTheCount() async {
    let repo = FakeEngagementRepo()
    let vm = LikeViewModel(postID: "p1", repo: repo)

    await vm.toggle(initialCount: 4)
    XCTAssertTrue(vm.isLiked)
    XCTAssertEqual(vm.displayedCount(initialCount: 4), 5)

    await vm.toggle(initialCount: 4)
    XCTAssertFalse(vm.isLiked)
    XCTAssertEqual(vm.displayedCount(initialCount: 4), 4)
    XCTAssertEqual(repo.likeWrites, [true, false])
    XCTAssertFalse(vm.isSaving)
  }

  func testAFailedLikeIsRolledBack() async {
    let repo = FakeEngagementRepo()
    repo.fails = true
    let vm = LikeViewModel(postID: "p1", repo: repo)

    await vm.toggle(initialCount: 4)

    XCTAssertFalse(vm.isLiked)
    XCTAssertEqual(vm.displayedCount(initialCount: 4), 4)
    XCTAssertFalse(vm.isSaving)
  }

  func testTheCountNeverGoesBelowZero() async {
    let repo = FakeEngagementRepo()
    repo.likedPostIDs = ["p1"]
    let vm = LikeViewModel(postID: "p1", repo: repo)
    await vm.load()

    // The post still says 0 likes because the counter trigger has not run yet.
    await vm.toggle(initialCount: 0)

    XCTAssertEqual(vm.displayedCount(initialCount: 0), 0)
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

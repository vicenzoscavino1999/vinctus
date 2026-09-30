import XCTest
@testable import VinctusNative

@MainActor
final class ReportViewModelTests: XCTestCase {
  func testSendsTheReportOnce() async {
    let repo = FakeModerationRepo()
    let vm = ReportViewModel(target: .user(userID: "u2"), repo: repo)
    vm.reason = .harassment
    vm.details = "Mensajes ofensivos"

    await vm.submit()
    await vm.submit()

    XCTAssertTrue(vm.didSubmit)
    XCTAssertEqual(repo.reports.count, 1)
    XCTAssertEqual(repo.reports.first?.reason, .harassment)
    XCTAssertEqual(repo.reports.first?.details, "Mensajes ofensivos")
    XCTAssertFalse(vm.canSubmit)
  }

  func testDetailsOverTheLimitCannotBeSent() async {
    let repo = FakeModerationRepo()
    let vm = ReportViewModel(target: .user(userID: "u2"), repo: repo)
    vm.details = String(repeating: "a", count: ReportViewModel.detailsLimit + 1)

    await vm.submit()

    XCTAssertFalse(vm.canSubmit)
    XCTAssertEqual(vm.detailsCharactersLeft, -1)
    XCTAssertTrue(repo.reports.isEmpty)
  }

  func testAFailedReportCanBeSentAgain() async {
    let repo = FakeModerationRepo()
    repo.fails = true
    let vm = ReportViewModel(target: .user(userID: "u2"), repo: repo)

    await vm.submit()

    XCTAssertFalse(vm.didSubmit)
    XCTAssertEqual(vm.errorMessage, "Falló la prueba")
    XCTAssertTrue(vm.canSubmit)
  }
}

@MainActor
final class BlockedUsersViewModelTests: XCTestCase {
  func testLoadsTheBlockedUsersAndTheirNames() async {
    let moderation = FakeModerationRepo()
    moderation.blocked = ["u1", "u2"]
    let profiles = FakeProfileRepo()
    profiles.profile = FakeProfileRepo.sample(id: "u1")
    let store = BlockedUsersStore(repo: moderation)
    let vm = BlockedUsersViewModel(profileRepo: profiles)

    await vm.reload(store)

    XCTAssertEqual(store.blockedUserIDs, ["u1", "u2"])
    XCTAssertEqual(vm.displayName(for: "u1"), "Lucía")
    XCTAssertEqual(vm.displayName(for: "sin-cargar"), "Usuario")
  }

  func testUnblock() async {
    let moderation = FakeModerationRepo()
    moderation.blocked = ["u1"]
    let store = BlockedUsersStore(repo: moderation)
    await store.refresh()
    let vm = BlockedUsersViewModel(profileRepo: FakeProfileRepo())

    await vm.unblock("u1", in: store)

    XCTAssertTrue(store.blockedUserIDs.isEmpty)
    XCTAssertNil(vm.pendingUserID)
    XCTAssertNil(vm.errorMessage)
  }

  func testAFailedUnblockShowsTheError() async {
    let moderation = FakeModerationRepo()
    moderation.blocked = ["u1"]
    let store = BlockedUsersStore(repo: moderation)
    await store.refresh()
    moderation.fails = true
    let vm = BlockedUsersViewModel(profileRepo: FakeProfileRepo())

    await vm.unblock("u1", in: store)

    XCTAssertEqual(store.blockedUserIDs, ["u1"])
    XCTAssertEqual(vm.errorMessage, "Falló la prueba")
    XCTAssertNil(vm.pendingUserID)
  }
}

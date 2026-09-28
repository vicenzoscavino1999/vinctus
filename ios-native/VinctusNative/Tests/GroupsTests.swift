import XCTest
@testable import VinctusNative

@MainActor
final class GroupMembershipTests: XCTestCase {
  func testMembershipIsLoaded() async {
    let repo = FakeGroupsRepo()
    repo.members = ["me"]
    let vm = GroupDetailViewModel(repo: repo, groupID: "g1")

    XCTAssertNil(vm.isMember)
    await vm.loadMembership(uid: "me")

    XCTAssertEqual(vm.isMember, true)
  }

  func testJoinAndLeave() async {
    let repo = FakeGroupsRepo()
    let vm = GroupDetailViewModel(repo: repo, groupID: "g1")
    await vm.loadMembership(uid: "me")
    XCTAssertEqual(vm.isMember, false)

    await vm.toggleMembership(uid: "me")
    XCTAssertEqual(vm.isMember, true)
    XCTAssertEqual(repo.joinCalls, 1)

    await vm.toggleMembership(uid: "me")
    XCTAssertEqual(vm.isMember, false)
    XCTAssertEqual(repo.leaveCalls, 1)
    XCTAssertFalse(vm.isUpdatingMembership)
  }

  func testPrivateGroupCanNotBeJoinedFromTheApp() async {
    let repo = FakeGroupsRepo()
    repo.failsToUpdate = true
    let vm = GroupDetailViewModel(repo: repo, groupID: "g1")
    await vm.loadMembership(uid: "me")

    await vm.toggleMembership(uid: "me")

    XCTAssertEqual(vm.isMember, false)
    XCTAssertEqual(vm.membershipError, "Este grupo es privado. Pide unirte desde la web.")
  }

  func testNothingHappensWithoutASignedInUserOrBeforeLoading() async {
    let repo = FakeGroupsRepo()
    let vm = GroupDetailViewModel(repo: repo, groupID: "g1")

    await vm.toggleMembership(uid: "me")
    await vm.loadMembership(uid: nil)
    await vm.toggleMembership(uid: nil)

    XCTAssertNil(vm.isMember)
    XCTAssertEqual(repo.joinCalls, 0)
  }
}

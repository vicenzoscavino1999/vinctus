import XCTest
@testable import VinctusNative

@MainActor
final class GroupMembershipTests: XCTestCase {
  private func loadedViewModel(_ repo: FakeGroupsRepo) async -> GroupDetailViewModel {
    let vm = GroupDetailViewModel(repo: repo, groupID: "g1")
    await vm.loadMembership(uid: "me")
    return vm
  }

  func testMembershipIsLoaded() async {
    let repo = FakeGroupsRepo()
    repo.members = ["me"]

    let vm = await loadedViewModel(repo)

    XCTAssertEqual(vm.membership, .member)
    XCTAssertEqual(vm.isMember, true)
  }

  func testJoinAndLeaveAPublicGroup() async {
    let repo = FakeGroupsRepo()
    let vm = await loadedViewModel(repo)
    XCTAssertEqual(vm.membership, GroupMembershipStatus.none)

    await vm.performMembershipAction(uid: "me")
    XCTAssertEqual(vm.membership, .member)
    XCTAssertEqual(repo.joinCalls, 1)

    await vm.performMembershipAction(uid: "me")
    XCTAssertEqual(vm.membership, GroupMembershipStatus.none)
    XCTAssertEqual(repo.leaveCalls, 1)
    XCTAssertFalse(vm.isUpdatingMembership)
  }

  func testAFailedJoinShowsTheError() async {
    let repo = FakeGroupsRepo()
    repo.failsToUpdate = true
    let vm = await loadedViewModel(repo)

    await vm.performMembershipAction(uid: "me")

    XCTAssertEqual(vm.membership, GroupMembershipStatus.none)
    XCTAssertEqual(vm.membershipError, GroupsRepoError.privateGroup.errorDescription)
  }

  func testNothingHappensWithoutASignedInUserOrBeforeLoading() async {
    let repo = FakeGroupsRepo()
    let vm = GroupDetailViewModel(repo: repo, groupID: "g1")

    await vm.performMembershipAction(uid: "me")
    await vm.loadMembership(uid: nil)
    await vm.performMembershipAction(uid: nil)

    XCTAssertNil(vm.membership)
    XCTAssertEqual(repo.joinCalls, 0)
  }

  func testButtonTitlesMatchTheWeb() {
    XCTAssertEqual(GroupMembershipStatus.owner.buttonTitle(isPrivate: false), "Tu grupo")
    XCTAssertEqual(GroupMembershipStatus.member.buttonTitle(isPrivate: true), "Unido")
    XCTAssertEqual(GroupMembershipStatus.pending.buttonTitle(isPrivate: true), "Pendiente")
    XCTAssertEqual(GroupMembershipStatus.none.buttonTitle(isPrivate: false), "Unirme")
    XCTAssertEqual(GroupMembershipStatus.none.buttonTitle(isPrivate: true), "Solicitar")
    XCTAssertTrue(GroupMembershipStatus.owner.isJoined)
    XCTAssertFalse(GroupMembershipStatus.pending.isJoined)
  }

  func testMemberRoles() {
    XCTAssertEqual(GroupView.roleTitle("admin"), "ADMIN")
    XCTAssertEqual(GroupView.roleTitle("moderator"), "MODERADOR")
    XCTAssertEqual(GroupView.roleTitle("member"), "MIEMBRO")
  }
}

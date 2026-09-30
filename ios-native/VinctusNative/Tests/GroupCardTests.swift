import XCTest
@testable import VinctusNative

@MainActor
final class GroupCardViewModelTests: XCTestCase {
  private func group(visibility: ProfileAccountVisibility, ownerID: String? = "owner") -> GroupSummary {
    GroupSummary(
      id: "g1", name: "Astronomía", description: "", categoryID: nil, ownerID: ownerID,
      visibility: visibility, iconURL: nil, memberCount: 3, updatedAt: Date()
    )
  }

  func testJoinsAPublicGroup() async {
    let repo = FakeGroupsRepo()
    let vm = GroupCardViewModel(group: group(visibility: .public), repo: repo)
    await vm.loadStatus(uid: "me")
    XCTAssertEqual(vm.status, GroupMembershipStatus.none)

    await vm.join(uid: "me")

    XCTAssertEqual(vm.status, .member)
    XCTAssertEqual(repo.joinCalls, 1)
    XCTAssertFalse(vm.isWorking)
  }

  func testAsksToJoinAPrivateGroup() async {
    let repo = FakeGroupsRepo()
    let vm = GroupCardViewModel(group: group(visibility: .private), repo: repo)
    await vm.loadStatus(uid: "me")

    await vm.join(uid: "me")

    XCTAssertEqual(vm.status, .pending)
    XCTAssertEqual(repo.requests, ["me"])
    XCTAssertEqual(repo.joinCalls, 0)
  }

  func testAPrivateGroupWithoutOwnerShowsAnError() async {
    let repo = FakeGroupsRepo()
    let vm = GroupCardViewModel(group: group(visibility: .private, ownerID: nil), repo: repo)
    await vm.loadStatus(uid: "me")

    await vm.join(uid: "me")

    XCTAssertEqual(vm.status, GroupMembershipStatus.none)
    XCTAssertEqual(vm.errorMessage, GroupsRepoError.privateGroup.errorDescription)
    XCTAssertTrue(repo.requests.isEmpty)
  }

  func testMembersAndSignedOutUsersCannotJoin() async {
    let repo = FakeGroupsRepo()
    repo.members = ["me"]
    let vm = GroupCardViewModel(group: group(visibility: .public), repo: repo)

    await vm.join(uid: "me")
    await vm.loadStatus(uid: "me")
    await vm.join(uid: "me")
    await vm.join(uid: nil)

    XCTAssertEqual(vm.status, .member)
    XCTAssertEqual(repo.joinCalls, 0)
  }
}

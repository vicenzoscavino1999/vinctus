import XCTest
import UIKit
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

@MainActor
final class EditGroupTests: XCTestCase {
  private let detail = GroupDetail(
    id: "g1", name: "Física", description: "Charlas", categoryID: "science", ownerID: "me",
    visibility: .public, iconURL: "https://example.com/old.jpg", memberCount: 3, postsPerWeek: 0,
    createdAt: nil, updatedAt: nil, recentPosts: [], topMembers: [], isFromCache: false
  )

  func testValidationTrimsAndEnforcesTheRuleLimits() {
    let update = GroupUpdate(name: "  Física  ", description: " Charlas ", categoryID: "",
                             visibility: .private, iconURL: nil)
    XCTAssertEqual(update.validated()?.name, "Física")
    XCTAssertEqual(update.validated()?.description, "Charlas")
    XCTAssertNil(update.validated()?.categoryID)

    var empty = update
    empty.name = "   "
    XCTAssertNil(empty.validated())

    var tooLong = update
    tooLong.description = String(repeating: "a", count: GroupUpdate.descriptionLimit + 1)
    XCTAssertNil(tooLong.validated())
  }

  func testSavingKeepsTheCurrentIconWhenNoneWasPicked() async {
    let repo = FakeGroupsRepo()
    let vm = EditGroupViewModel(detail: detail, repo: repo)
    vm.name = "Física cuántica"
    vm.visibility = .private

    let saved = await vm.save(ownerID: "me")

    XCTAssertTrue(saved)
    XCTAssertEqual(repo.uploadedIcons, 0)
    XCTAssertEqual(repo.updates.first?.name, "Física cuántica")
    XCTAssertEqual(repo.updates.first?.visibility, .private)
    XCTAssertEqual(repo.updates.first?.iconURL, "https://example.com/old.jpg")
  }

  func testANewIconIsUploadedBeforeSaving() async {
    let repo = FakeGroupsRepo()
    let vm = EditGroupViewModel(detail: detail, repo: repo)
    vm.newIcon = UIGraphicsImageRenderer(size: CGSize(width: 4, height: 4)).image { context in
      UIColor.red.setFill()
      context.fill(CGRect(x: 0, y: 0, width: 4, height: 4))
    }

    _ = await vm.save(ownerID: "me")

    XCTAssertEqual(repo.uploadedIcons, 1)
    XCTAssertEqual(repo.updates.first?.iconURL, "https://example.com/groups/me/g1/icon.jpg")
  }

  func testAFailedSaveShowsAnError() async {
    let repo = FakeGroupsRepo()
    repo.failsToUpdate = true
    let vm = EditGroupViewModel(detail: detail, repo: repo)

    let saved = await vm.save(ownerID: "me")

    XCTAssertFalse(saved)
    XCTAssertEqual(vm.errorMessage, "No se pudo actualizar el grupo.")
    XCTAssertFalse(vm.isSaving)
  }
}

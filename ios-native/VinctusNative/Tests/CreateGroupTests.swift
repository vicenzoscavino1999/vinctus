import UIKit
import XCTest
@testable import VinctusNative

@MainActor
final class CreateGroupTests: XCTestCase {
  private func person(_ id: String, _ name: String) -> ProfileUserSummary {
    ProfileUserSummary(id: id, name: name, photoURL: nil, username: nil)
  }

  private func makeVM(repo: FakeGroupsRepo = FakeGroupsRepo(), content: FakeProfileContentRepo = FakeProfileContentRepo()) -> CreateGroupViewModel {
    let vm = CreateGroupViewModel(repo: repo, contentRepo: content)
    vm.name = "  Astronomía urbana "
    vm.description = "Miramos el cielo desde la ciudad."
    vm.categoryID = "science"
    vm.visibility = .private
    return vm
  }

  func testNeedsANameAndADescription() {
    let vm = CreateGroupViewModel(repo: FakeGroupsRepo(), contentRepo: FakeProfileContentRepo())
    XCTAssertFalse(vm.canCreate)
    vm.name = "Grupo"
    XCTAssertFalse(vm.canCreate)
    vm.description = "De qué trata"
    XCTAssertTrue(vm.canCreate)
  }

  func testCreatesTheGroupTrimmedAndAddsTheChosenPeople() async {
    let repo = FakeGroupsRepo()
    let vm = makeVM(repo: repo)
    vm.toggle(person("ana", "Ana"))
    vm.toggle(person("bob", "Bob"))
    vm.toggle(person("bob", "Bob")) // unselected again
    vm.toggle(person("me", "Yo")) // the owner is never added twice

    let created = await vm.create(ownerID: "me")

    XCTAssertEqual(created?.groupID, "created-1")
    XCTAssertNil(created?.warning)
    XCTAssertEqual(repo.createdGroups.first?.ownerID, "me")
    XCTAssertEqual(repo.createdGroups.first?.draft.name, "Astronomía urbana")
    XCTAssertEqual(repo.createdGroups.first?.draft.visibility, .private)
    XCTAssertEqual(repo.createdGroups.first?.draft.categoryID, "science")
    XCTAssertEqual(repo.addedMembers.map(\.uid), ["ana"])
    XCTAssertEqual(repo.uploadedIcons, 0)
  }

  func testUploadsTheIconAfterCreatingTheGroup() async {
    let repo = FakeGroupsRepo()
    let vm = makeVM(repo: repo)
    vm.newIcon = UIGraphicsImageRenderer(size: CGSize(width: 8, height: 8)).image { context in
      UIColor.orange.setFill()
      context.fill(CGRect(x: 0, y: 0, width: 8, height: 8))
    }

    let created = await vm.create(ownerID: "me")

    XCTAssertNil(created?.warning)
    XCTAssertEqual(repo.uploadedIcons, 1)
    XCTAssertEqual(repo.updates.first?.iconURL, "https://example.com/groups/me/created-1/icon.jpg")
  }

  func testAFailedIconOrMemberIsAWarningNotAFailure() async {
    let repo = FakeGroupsRepo()
    repo.failsToUploadIcon = true
    repo.failingMemberUIDs = ["blocked"]
    let vm = makeVM(repo: repo)
    vm.newIcon = UIGraphicsImageRenderer(size: CGSize(width: 8, height: 8)).image { _ in }
    vm.toggle(person("blocked", "Bloqueado"))
    vm.toggle(person("ana", "Ana"))

    let created = await vm.create(ownerID: "me")

    XCTAssertEqual(created?.groupID, "created-1")
    XCTAssertEqual(
      created?.warning,
      "Grupo creado, pero no se pudo subir el ícono y algunos miembros no se pudieron agregar."
    )
    XCTAssertEqual(repo.addedMembers.map(\.uid), ["ana"])
  }

  func testAFailedCreationKeepsTheSheetOpenWithAnError() async {
    let repo = FakeGroupsRepo()
    repo.failsToCreate = true
    let vm = makeVM(repo: repo)

    let created = await vm.create(ownerID: "me")

    XCTAssertNil(created)
    XCTAssertEqual(vm.errorMessage, "No se pudo crear el grupo.")
  }

  func testSignedOutCannotCreate() async {
    let vm = makeVM()
    let created = await vm.create(ownerID: nil)
    XCTAssertNil(created)
    XCTAssertEqual(vm.errorMessage, "Debes iniciar sesión para crear un grupo.")
  }

  func testPeopleToAddAreTheOnesYouFollow() async {
    let content = FakeProfileContentRepo()
    content.followLists = [.following: [person("ana", "Ana")], .followers: [person("zoe", "Zoe")]]
    let vm = makeVM(content: content)

    await vm.loadFollowing(uid: "me")
    await vm.loadFollowing(uid: "me") // asked once

    XCTAssertEqual(vm.following.map(\.id), ["ana"])
    XCTAssertEqual(content.fetchFollowListCalls, 1)
  }
}

@MainActor
final class MyGroupsTests: XCTestCase {
  private let group = GroupSummary(
    id: "g1", name: "Jazz y café", description: "Discos", categoryID: nil, ownerID: "u1",
    visibility: .public, iconURL: nil, memberCount: 3, updatedAt: Date()
  )

  func testLoadsYourGroups() async {
    let repo = FakeGroupsRepo()
    repo.myGroups = [group]
    let vm = MyGroupsViewModel()

    await vm.load(uid: "me", repo: repo)

    XCTAssertEqual(vm.groups.map(\.id), ["g1"])
    XCTAssertNil(vm.errorMessage)
  }

  func testSaysWhenYourGroupsFailToLoad() async {
    let repo = FakeGroupsRepo()
    repo.failsToListMine = true
    let vm = MyGroupsViewModel()

    await vm.load(uid: "me", repo: repo)

    XCTAssertEqual(vm.errorMessage, "No se pudieron cargar tus grupos.")
  }

  func testOpensTheGroupChat() async {
    let chat = FakeChatRepo()
    let vm = MyGroupsViewModel()

    let conversation = await vm.openChat(for: group, chatRepo: chat)

    XCTAssertEqual(conversation?.id, "grp_g1")
    XCTAssertEqual(conversation?.title, "Jazz y café")
    XCTAssertEqual(conversation?.isGroup, true)
    XCTAssertNil(vm.openingGroupID)
  }
}

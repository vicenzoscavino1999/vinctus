import XCTest
@testable import VinctusNative

@MainActor
final class GroupSuggestionsViewModelTests: XCTestCase {
  private func group(_ id: String, name: String, description: String = "", categoryID: String? = nil) -> GroupSummary {
    GroupSummary(
      id: id, name: name, description: description, categoryID: categoryID,
      visibility: .public, iconURL: nil, memberCount: 1, updatedAt: Date()
    )
  }

  func testLoadsTheRequestedNumberOfGroups() async {
    let repo = FakeGroupsRepo()
    repo.listedGroups = [group("g1", name: "Astronomía")]
    let vm = GroupSuggestionsViewModel(repo: repo, limit: 12)

    await vm.refresh()

    XCTAssertEqual(vm.groups.map(\.id), ["g1"])
    XCTAssertEqual(repo.requestedLimits, [12])
    XCTAssertFalse(vm.isLoading)
    XCTAssertNil(vm.errorMessage)
  }

  func testAFailedRefreshKeepsTheGroupsShown() async {
    let repo = FakeGroupsRepo()
    repo.listedGroups = [group("g1", name: "Astronomía")]
    let vm = GroupSuggestionsViewModel(repo: repo, limit: 20)
    await vm.refresh()

    repo.failsToList = true
    await vm.refresh()

    XCTAssertEqual(vm.groups.map(\.id), ["g1"])
    XCTAssertEqual(vm.errorMessage, "Falló la prueba")
  }

  func testFiltersByNameDescriptionOrCategory() async {
    let repo = FakeGroupsRepo()
    repo.listedGroups = [
      group("g1", name: "Astronomía", description: "Telescopios y cielo"),
      group("g2", name: "Jazz", categoryID: "music"),
      group("g3", name: "Club de lectura", description: "Novelas"),
    ]
    let vm = GroupSuggestionsViewModel(repo: repo, limit: 12)
    await vm.refresh()

    XCTAssertEqual(vm.filtered(by: "  ").count, 3)
    XCTAssertEqual(vm.filtered(by: "ASTRO").map(\.id), ["g1"])
    XCTAssertEqual(vm.filtered(by: "telescopios").map(\.id), ["g1"])
    XCTAssertEqual(vm.filtered(by: " music ").map(\.id), ["g2"])
    XCTAssertTrue(vm.filtered(by: "física").isEmpty)
  }
}

@MainActor
final class GroupChatViewModelTests: XCTestCase {
  func testOpensTheGroupConversation() async {
    let vm = GroupChatViewModel(groupID: "g1", chatRepo: FakeChatRepo())

    await vm.open()

    XCTAssertEqual(vm.openedConversationID, "grp_g1")
    XCTAssertFalse(vm.isOpening)
    XCTAssertNil(vm.errorMessage)
  }

  func testAFailedOpenShowsTheError() async {
    let chat = FakeChatRepo()
    chat.failsToOpen = true
    let vm = GroupChatViewModel(groupID: "g1", chatRepo: chat)

    await vm.open()

    XCTAssertNil(vm.openedConversationID)
    XCTAssertEqual(vm.errorMessage, "Falló la prueba")
  }
}

@MainActor
final class AIConsentViewModelTests: XCTestCase {
  func testWaitsForTheSignedInUser() async {
    let vm = AIConsentViewModel(source: .aiChat, repo: FakeAIConsentRepo())

    await vm.load(uid: nil)

    XCTAssertTrue(vm.isLoading)
    XCTAssertFalse(vm.isGranted)
  }

  func testGrantingSavesTheSource() async {
    let repo = FakeAIConsentRepo()
    let vm = AIConsentViewModel(source: .arena, repo: repo)
    await vm.load(uid: "me")
    XCTAssertFalse(vm.isLoading)
    XCTAssertFalse(vm.isGranted)

    await vm.grant(uid: "me")

    XCTAssertTrue(vm.isGranted)
    XCTAssertEqual(repo.savedSources, [.arena])
    XCTAssertFalse(vm.isSaving)
  }

  func testAFailedLoadAsksAgain() async {
    let repo = FakeAIConsentRepo()
    repo.failsToLoad = true
    let vm = AIConsentViewModel(source: .aiChat, repo: repo)

    await vm.load(uid: "me")

    XCTAssertFalse(vm.isLoading)
    XCTAssertFalse(vm.isGranted)
    XCTAssertEqual(vm.errorMessage, "No se pudo cargar tu consentimiento de IA.")
  }

  func testAFailedGrantKeepsAsking() async {
    let repo = FakeAIConsentRepo()
    repo.failsToSave = true
    let vm = AIConsentViewModel(source: .aiChat, repo: repo)
    await vm.load(uid: "me")

    await vm.grant(uid: "me")

    XCTAssertFalse(vm.isGranted)
    XCTAssertEqual(vm.errorMessage, "No se pudo guardar tu consentimiento. Intenta de nuevo.")
  }
}

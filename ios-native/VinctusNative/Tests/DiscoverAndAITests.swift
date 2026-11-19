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
    XCTAssertEqual(vm.filtered(by: "astronomia").map(\.id), ["g1"])
    XCTAssertEqual(vm.filtered(by: "telescopios").map(\.id), ["g1"])
    XCTAssertEqual(vm.filtered(by: " music ").map(\.id), ["g2"])
    XCTAssertEqual(vm.filtered(by: "acustica").map(\.id), ["g2"])
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

@MainActor
final class DiscoverViewModelTests: XCTestCase {
  func testRefreshesSuggestedUsersExcludesSelfAndRecoversFromError() async {
    let repo = FakeDiscoverRepo()
    repo.recentUsers = [
      FakeDiscoverRepo.user("me", name: "Yo"),
      FakeDiscoverRepo.user("u1", name: "Ana"),
    ]
    let vm = DiscoverViewModel(repo: repo)
    vm.currentUserID = "me"

    repo.failsRecentUsers = true
    await vm.refreshSuggestedUsers()
    XCTAssertEqual(vm.errorMessage, "Falló la prueba")
    XCTAssertTrue(vm.suggestedUsers.isEmpty)

    repo.failsRecentUsers = false
    await vm.refreshSuggestedUsers()
    XCTAssertNil(vm.errorMessage)
    XCTAssertEqual(vm.suggestedUsers.map(\.uid), ["u1"])
    XCTAssertEqual(vm.displayedUsers.map(\.uid), ["u1"])
  }

  func testRefreshSearchNowIgnoresStaleOlderResponse() async {
    let repo = FakeDiscoverRepo()
    var slowContinuation: CheckedContinuation<[DiscoverUser], Error>?
    let slowStarted = expectation(description: "slow search started")

    repo.searchHandler = { query in
      if query == "an" {
        return try await withCheckedThrowingContinuation { continuation in
          slowContinuation = continuation
          slowStarted.fulfill()
        }
      }
      return [FakeDiscoverRepo.user("u2", name: "Bruno")]
    }

    let vm = DiscoverViewModel(repo: repo)
    vm.searchText = "an"
    let firstSearch = Task { await vm.refreshSearchNow() }
    await fulfillment(of: [slowStarted], timeout: 1.0)

    vm.searchText = "br"
    await vm.refreshSearchNow()
    XCTAssertEqual(vm.results.map(\.uid), ["u2"])

    slowContinuation?.resume(returning: [FakeDiscoverRepo.user("u1", name: "Ana")])
    await firstSearch.value

    XCTAssertEqual(vm.results.map(\.uid), ["u2"])
    XCTAssertFalse(vm.isSearching)
  }

  func testResetClearsStateAndIgnoresInFlightSearch() async {
    let repo = FakeDiscoverRepo()
    var inFlight: CheckedContinuation<[DiscoverUser], Error>?
    let started = expectation(description: "search started")

    repo.searchHandler = { _ in
      try await withCheckedThrowingContinuation { continuation in
        inFlight = continuation
        started.fulfill()
      }
    }

    let vm = DiscoverViewModel(repo: repo)
    vm.searchText = "an"
    let task = Task { await vm.refreshSearchNow() }
    await fulfillment(of: [started], timeout: 1.0)

    vm.reset()
    inFlight?.resume(returning: [FakeDiscoverRepo.user("u1", name: "Ana")])
    await task.value

    XCTAssertEqual(vm.searchText, "")
    XCTAssertTrue(vm.results.isEmpty)
    XCTAssertTrue(vm.suggestedUsers.isEmpty)
    XCTAssertFalse(vm.isSearching)
    XCTAssertNil(vm.errorMessage)
  }

  func testShortQueryClearsActiveSearch() async {
    let repo = FakeDiscoverRepo()
    repo.searchResultsByQuery["an"] = [FakeDiscoverRepo.user("u1", name: "Ana")]
    let vm = DiscoverViewModel(repo: repo)
    vm.searchText = "an"
    await vm.refreshSearchNow()
    XCTAssertEqual(vm.results.map(\.uid), ["u1"])

    vm.handleSearchTextChange("a")
    XCTAssertFalse(vm.isSearchActive)
    XCTAssertTrue(vm.results.isEmpty)
    XCTAssertFalse(vm.isSearching)
  }
}

final class DiscoverLiveDecodingTests: XCTestCase {
  func testDecodesAllSixSourcesAndRejectsUnsafeLinks() throws {
    let cases: [(source: String, json: String, expectedTitle: String, expectedLink: String?, expectedImage: String?)] = [
      (
        "arxiv",
        #"{"data":[{"id":"a1","type":"Paper","title":"Quantum Optics","authors":"Ada","summary":"Summary","published":"2026-01-01","link":"https://arxiv.org/abs/1"}]}"#,
        "Quantum Optics",
        "https://arxiv.org/abs/1",
        nil
      ),
      (
        "wikipedia",
        #"{"data":[{"id":"w1","type":"Artículo","title":"Roma","summary":"Historia","link":"javascript:alert(1)","thumbnail":"https://upload.wikimedia.org/roma.jpg"}]}"#,
        "Roma",
        nil,
        "https://upload.wikimedia.org/roma.jpg"
      ),
      (
        "hackernews",
        #"{"data":[{"id":42,"type":"Noticia","title":"Swift 6","score":120,"comments":30,"time":"2h","url":"https://swift.org"}]}"#,
        "Swift 6",
        "https://swift.org",
        nil
      ),
      (
        "openlibrary",
        #"{"data":[{"id":"ol1","type":"Libro","title":"Ficciones","authors":"Borges","firstPublished":1944,"link":"https://openlibrary.org/works/OL1W","cover":null}]}"#,
        "Ficciones",
        "https://openlibrary.org/works/OL1W",
        nil
      ),
      (
        "inaturalist",
        #"{"data":[{"id":7,"type":"Observación","species":"Quetzal","scientificName":"Pharomachrus","location":"Costa Rica","observer":"Ana","link":"https://www.inaturalist.org/observations/7","photo":"https://static.inaturalist.org/7.jpg"}]}"#,
        "Quetzal",
        "https://www.inaturalist.org/observations/7",
        "https://static.inaturalist.org/7.jpg"
      ),
      (
        "lastfm",
        #"{"data":[{"id":"m1","type":"Música","title":"Kind of Blue","artist":"Miles Davis","link":"https://en.wikipedia.org/wiki/Kind_of_Blue"}]}"#,
        "Kind of Blue",
        "https://en.wikipedia.org/wiki/Kind_of_Blue",
        nil
      ),
    ]

    for testCase in cases {
      let data = Data(testCase.json.utf8)
      let items = try FirebaseDiscoverRepo.decodeLiveItems(from: data, source: testCase.source)
      XCTAssertEqual(items.count, 1, "source=\(testCase.source)")
      XCTAssertEqual(items.first?.title, testCase.expectedTitle, "source=\(testCase.source)")
      XCTAssertEqual(items.first?.linkURL?.absoluteString, testCase.expectedLink, "source=\(testCase.source)")
      XCTAssertEqual(items.first?.imageURL?.absoluteString, testCase.expectedImage, "source=\(testCase.source)")
    }

    XCTAssertThrowsError(try FirebaseDiscoverRepo.decodeLiveItems(from: Data(#"{"bad":true}"#.utf8), source: "arxiv"))
  }

  func testCategoryMatchesDiacriticInsensitiveQueries() {
    let science = DiscoverCategory.all.first { $0.id == "science" }
    let tech = DiscoverCategory.all.first { $0.id == "technology" }
    let lit = DiscoverCategory.all.first { $0.id == "literature" }
    let nature = DiscoverCategory.all.first { $0.id == "nature" }

    XCTAssertEqual(science?.matches(query: "fisica"), true)
    XCTAssertEqual(science?.matches(query: "cuantica"), true)
    XCTAssertEqual(tech?.matches(query: "codigo"), true)
    XCTAssertEqual(lit?.matches(query: "poesia"), true)
    XCTAssertEqual(nature?.matches(query: "ornitologia"), true)
    XCTAssertEqual(nature?.matches(query: "quantum"), false)
  }
}

@MainActor
final class DiscoverCategoryViewModelTests: XCTestCase {
  func testLoadsAllSectionsSelectsSubgroupAndTogglesFollow() async {
    let science = DiscoverCategory.all.first { $0.id == "science" }!
    let repo = FakeDiscoverRepo()
    repo.liveItemsByQuery["quant-ph"] = [FakeDiscoverRepo.liveItem("q1", title: "Entanglement")]
    repo.liveItemsByQuery["astro-ph.CO"] = [FakeDiscoverRepo.liveItem("c1", title: "Dark Matter")]
    repo.categoryGroups = [
      GroupSummary(
        id: "g1", name: "Física", description: "Debates", categoryID: "science",
        visibility: .public, iconURL: nil, memberCount: 5, updatedAt: Date()
      ),
    ]
    repo.categoryLibrary = [
      DiscoverLibraryItem(
        id: "lib1", userID: "u1", type: .paper, title: "Paper 1", description: nil,
        authorName: "Ana", linkURL: URL(string: "https://arxiv.org/abs/1"),
        fileURL: nil, fileName: nil, createdAt: Date()
      ),
    ]
    let profileRepo = FakeProfileContentRepo()
    profileRepo.followedCategories = ["science"]

    let vm = DiscoverCategoryViewModel(category: science, repo: repo, profileContentRepo: profileRepo)
    await vm.loadAll()

    XCTAssertEqual(vm.liveItems.map(\.id), ["q1"])
    XCTAssertEqual(vm.groups.map(\.id), ["g1"])
    XCTAssertEqual(vm.libraryItems.map(\.id), ["lib1"])
    XCTAssertTrue(vm.isFollowed)

    await vm.selectSubgroup("cosmology")
    XCTAssertEqual(vm.activeQuery, "astro-ph.CO")
    XCTAssertEqual(vm.liveItems.map(\.id), ["c1"])

    await vm.toggleFollow()
    XCTAssertFalse(vm.isFollowed)
    XCTAssertEqual(profileRepo.categoryWrites.last?.followed, false)
    XCTAssertEqual(profileRepo.categoryWrites.last?.categoryID, "science")
  }

  func testSurfacesErrorsIndependentlyAndHandlesFollowFailure() async {
    let science = DiscoverCategory.all.first { $0.id == "science" }!
    let repo = FakeDiscoverRepo()
    repo.failsLive = true
    repo.failsCategoryGroups = true
    repo.failsCategoryLibrary = true
    let profileRepo = FakeProfileContentRepo()
    profileRepo.failsToWrite = true

    let vm = DiscoverCategoryViewModel(category: science, repo: repo, profileContentRepo: profileRepo)
    await vm.loadAll()

    XCTAssertNotNil(vm.liveError)
    XCTAssertNotNil(vm.groupsError)
    XCTAssertNotNil(vm.libraryError)

    await vm.toggleFollow()
    XCTAssertFalse(vm.isFollowed)
    XCTAssertNotNil(vm.followError)

    repo.failsLive = false
    repo.liveItemsByQuery["quant-ph"] = [FakeDiscoverRepo.liveItem("q2", title: "Recovered")]
    await vm.loadLive()
    XCTAssertNil(vm.liveError)
    XCTAssertEqual(vm.liveItems.map(\.id), ["q2"])
  }
}

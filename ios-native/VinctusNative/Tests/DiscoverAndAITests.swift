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

  func testResetClearsLoadedGroupsAndError() async {
    let repo = FakeGroupsRepo()
    repo.listedGroups = [group("g1", name: "Astronomía")]
    let vm = GroupSuggestionsViewModel(repo: repo, limit: 12)
    await vm.refresh()
    repo.failsToList = true
    await vm.refresh()
    XCTAssertEqual(vm.groups.count, 1)
    XCTAssertNotNil(vm.errorMessage)

    vm.reset()

    XCTAssertTrue(vm.groups.isEmpty)
    XCTAssertNil(vm.errorMessage)
    XCTAssertFalse(vm.isShowingCachedData)
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

  func testSwitchingUsersResetsPriorConsentAndIgnoresStaleResponse() async {
    let repo = FakeAIConsentRepo()
    var slowContinuation: CheckedContinuation<AIConsentState, Error>?
    let slowStarted = expectation(description: "slow consent load started")

    repo.getHandler = { uid in
      if uid == "alice" {
        return try await withCheckedThrowingContinuation { continuation in
          slowContinuation = continuation
          slowStarted.fulfill()
        }
      }
      return AIConsentState(granted: false, recorded: true, source: .settings, updatedAt: Date())
    }

    let vm = AIConsentViewModel(source: .aiChat, repo: repo)
    let aliceTask = Task { await vm.load(uid: "alice") }
    await fulfillment(of: [slowStarted], timeout: 1.0)

    await vm.load(uid: "bob")
    XCTAssertFalse(vm.isGranted)
    XCTAssertFalse(vm.isLoading)

    slowContinuation?.resume(
      returning: AIConsentState(granted: true, recorded: true, source: .aiChat, updatedAt: Date())
    )
    await aliceTask.value

    XCTAssertFalse(vm.isGranted)
  }

  func testSigningOutResetsGrantedConsent() async {
    let repo = FakeAIConsentRepo()
    repo.stateByUID["alice"] = AIConsentState(granted: true, recorded: true, source: .aiChat, updatedAt: Date())
    let vm = AIConsentViewModel(source: .aiChat, repo: repo)

    await vm.load(uid: "alice")
    XCTAssertTrue(vm.isGranted)

    await vm.load(uid: nil)
    XCTAssertFalse(vm.isGranted)
    XCTAssertTrue(vm.isLoading)
  }
}

@MainActor
final class SettingsAIConsentViewModelTests: XCTestCase {
  func testSwitchingUserResetsConsentBeforeLoadAndIgnoresStaleFailure() async {
    let repo = FakeAIConsentRepo()
    repo.stateByUID["alice"] = AIConsentState(granted: true, recorded: true, source: .aiChat, updatedAt: Date())
    let vm = SettingsViewModel(repo: repo)

    await vm.refreshConsent(userID: "alice")
    XCTAssertTrue(vm.aiConsent.granted)

    repo.failsToLoad = true
    await vm.refreshConsent(userID: "bob")
    XCTAssertFalse(vm.aiConsent.granted)
    XCTAssertNotNil(vm.errorMessage)
  }

  func testToggleUpdatesConsentWithSettingsSource() async {
    let repo = FakeAIConsentRepo()
    let vm = SettingsViewModel(repo: repo)

    await vm.refreshConsent(userID: "alice")
    XCTAssertFalse(vm.aiConsent.granted)

    await vm.toggleAIConsent(userID: "alice")
    XCTAssertTrue(vm.aiConsent.granted)
    XCTAssertEqual(repo.savedSources, [.settings])

    await vm.toggleAIConsent(userID: "alice")
    XCTAssertFalse(vm.aiConsent.granted)
    XCTAssertEqual(repo.savedSources, [.settings, .settings])
  }
}

final class AIChatResponseDecodingTests: XCTestCase {
  func testDecodesCreateGroupActionAndAttachesGroupIDToLastModelMessage() throws {
    let json = """
    {
      "response": "Grupo creado",
      "history": [
        { "role": "user", "parts": [{ "text": "Crea un grupo" }] },
        { "role": "model", "parts": [{ "text": "Grupo creado" }] }
      ],
      "action": { "type": "createGroup", "groupId": "grp_42" }
    }
    """
    let messages = try FirebaseAIRepo.decodeChatResponse(from: Data(json.utf8), status: 200)

    XCTAssertEqual(messages.count, 2)
    XCTAssertNil(messages[0].groupID)
    XCTAssertEqual(messages[1].groupID, "grp_42")
  }

  func testEncodesHistoryWithoutGroupID() throws {
    let message = AIChatMessage(role: "model", parts: [.init(text: "Listo")], groupID: "grp_42")
    let data = try JSONEncoder().encode(message)
    let raw = try XCTUnwrap(String(data: data, encoding: .utf8))

    XCTAssertFalse(raw.contains("groupID"))
    XCTAssertFalse(raw.contains("grp_42"))
    XCTAssertTrue(raw.contains("Listo"))
  }

  func testMapsErrorStatusesToSpanishMessages() {
    let emptyData = Data("{}".utf8)
    XCTAssertThrowsError(try FirebaseAIRepo.decodeChatResponse(from: emptyData, status: 401)) { error in
      XCTAssertTrue(error.localizedDescription.contains("sesión"))
    }
    XCTAssertThrowsError(try FirebaseAIRepo.decodeChatResponse(from: emptyData, status: 429)) { error in
      XCTAssertTrue(error.localizedDescription.contains("límite"))
    }
    XCTAssertThrowsError(try FirebaseAIRepo.decodeChatResponse(from: emptyData, status: 504)) { error in
      XCTAssertTrue(error.localizedDescription.contains("tardó"))
    }
  }
}

@MainActor
final class AIChatViewModelTests: XCTestCase {
  func testSendAppendsAndUpdatesHistoryWithGroupID() async {
    let repo = FakeAIRepo()
    repo.chatReplyText = "Grupo creado"
    repo.chatReplyGroupID = "grp_9"
    let vm = AIChatViewModel(repo: repo)

    vm.draft = "  Crea un grupo  "
    XCTAssertTrue(vm.canSend)
    await vm.sendNow()

    XCTAssertEqual(vm.draft, "")
    XCTAssertFalse(vm.isSending)
    XCTAssertNil(vm.errorMessage)
    XCTAssertEqual(vm.messages.count, 2)
    XCTAssertEqual(vm.messages.last?.groupID, "grp_9")
  }

  func testFailedSendPreservesNewDraftTyping() async {
    let repo = FakeAIRepo()
    var continuation: CheckedContinuation<[AIChatMessage], Error>?
    let started = expectation(description: "chat send started")

    repo.chatHandler = { _, _ in
      try await withCheckedThrowingContinuation { cont in
        continuation = cont
        started.fulfill()
      }
    }

    let vm = AIChatViewModel(repo: repo)
    vm.draft = "Primer intento"
    let sendTask = Task { await vm.sendNow() }
    await fulfillment(of: [started], timeout: 1.0)

    vm.draft = "Nuevo mensaje mientras falla"
    continuation?.resume(throwing: FakeError())
    await sendTask.value

    XCTAssertEqual(vm.draft, "Nuevo mensaje mientras falla")
    XCTAssertTrue(vm.messages.isEmpty)
    XCTAssertEqual(vm.errorMessage, "Falló la prueba")
  }

  func testResetClearsStateAndIgnoresInFlightReply() async {
    let repo = FakeAIRepo()
    var continuation: CheckedContinuation<[AIChatMessage], Error>?
    let started = expectation(description: "chat send started")

    repo.chatHandler = { _, _ in
      try await withCheckedThrowingContinuation { cont in
        continuation = cont
        started.fulfill()
      }
    }

    let vm = AIChatViewModel(repo: repo)
    vm.draft = "Hola"
    let sendTask = Task { await vm.sendNow() }
    await fulfillment(of: [started], timeout: 1.0)

    vm.reset()
    continuation?.resume(returning: [
      AIChatMessage(role: "user", parts: [.init(text: "Hola")]),
      AIChatMessage(role: "model", parts: [.init(text: "Respuesta vieja")]),
    ])
    await sendTask.value

    XCTAssertTrue(vm.messages.isEmpty)
    XCTAssertFalse(vm.isSending)
    XCTAssertNil(vm.errorMessage)
  }

  func testRejectsEmptyOrOversizedDraft() {
    let vm = AIChatViewModel(repo: FakeAIRepo())
    vm.draft = "   "
    XCTAssertFalse(vm.canSend)

    vm.draft = String(repeating: "a", count: FirebaseAIRepo.maxMessageLength + 1)
    XCTAssertTrue(vm.isDraftTooLong)
    XCTAssertFalse(vm.canSend)
  }
}

@MainActor
final class ArenaViewModelTests: XCTestCase {
  func testValidatesMinAndMaxTopicLengthAndDistinctPersonas() async {
    let vm = ArenaViewModel(repo: FakeAIRepo())
    await vm.load()

    vm.topic = "1234"
    XCTAssertFalse(vm.canCreate)

    vm.topic = "12345"
    XCTAssertTrue(vm.canCreate)

    vm.personaB = vm.personaA
    XCTAssertFalse(vm.canCreate)

    vm.personaB = "philosopher"
    vm.topic = String(repeating: "a", count: ArenaViewModel.maxTopicLength + 1)
    XCTAssertFalse(vm.canCreate)
  }

  func testCreateCapturesSelectedPersonasAndSavesResult() async {
    let aiRepo = FakeAIRepo()
    var continuation: CheckedContinuation<ArenaDebateResult, Error>?
    let started = expectation(description: "debate create started")

    aiRepo.createHandler = { _, _, _ in
      try await withCheckedThrowingContinuation { cont in
        continuation = cont
        started.fulfill()
      }
    }

    let vm = ArenaViewModel(repo: aiRepo)
    await vm.load()
    vm.topic = "¿Debe regularse la IA abierta?"
    vm.personaA = "scientist"
    vm.personaB = "philosopher"

    let createTask = Task { await vm.createNow() }
    await fulfillment(of: [started], timeout: 1.0)

    // Mutating picker selections mid-flight must not corrupt resultNames or saved metadata.
    vm.personaA = "skeptic"
    continuation?.resume(returning: ArenaDebateResult(
      debateID: "deb_99",
      summary: "Resumen",
      winner: "A",
      verdictReason: "Datos sólidos",
      remaining: 3,
      turns: [ArenaTurn(id: "t0", index: 0, speaker: "A", text: "Turno 1")]
    ))
    await createTask.value

    XCTAssertEqual(vm.resultNames["A"], "Científico")
    XCTAssertEqual(vm.resultNames["B"], "Filósofo")
    XCTAssertEqual(vm.resultDebate?.personaA, "scientist")
    XCTAssertEqual(vm.usage?.remaining, 3)

    let profileRepo = FakeProfileContentRepo()
    await vm.saveResultNow(repo: profileRepo)
    XCTAssertTrue(vm.isResultSaved)
    XCTAssertEqual(profileRepo.savedDebates.map(\.id), ["deb_99"])
  }

  func testDebateTurnsViewModelClearsErrorOnRetry() async {
    let repo = FakeAIRepo()
    repo.failsTurns = true
    let vm = DebateTurnsViewModel(debateID: "deb_1", repo: repo)

    await vm.load()
    XCTAssertNotNil(vm.errorMessage)
    XCTAssertFalse(vm.isLoading)

    repo.failsTurns = false
    repo.turns = [ArenaTurn(id: "t0", index: 0, speaker: "A", text: "Argumento")]
    await vm.load()

    XCTAssertNil(vm.errorMessage)
    XCTAssertEqual(vm.turns.map(\.id), ["t0"])
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

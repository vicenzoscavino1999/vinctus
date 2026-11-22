import XCTest
@testable import VinctusNative

/// Stories must match the web (`src/shared/lib/firestore/stories.ts`).
final class StoriesTests: XCTestCase {
  private func story(_ id: String, owner: String, minutesAgo: Double) -> Story {
    let created = Date().addingTimeInterval(-minutesAgo * 60)
    return Story(
      id: id, ownerID: owner, ownerName: owner.uppercased(), ownerPhotoURL: nil, mediaType: .image,
      mediaURL: "https://example.com/\(id).jpg", mediaPath: "stories/\(owner)/\(id)/original/x.jpg",
      createdAt: created, expiresAt: created.addingTimeInterval(FirebaseStoriesRepo.storyDuration)
    )
  }

  func testGroupsPutMineFirstThenTheMostRecent() {
    let groups = StoryGroup.make(
      from: [
        story("a1", owner: "ana", minutesAgo: 90),
        story("b1", owner: "beto", minutesAgo: 10),
        story("me1", owner: "me", minutesAgo: 300),
        story("a2", owner: "ana", minutesAgo: 30),
      ],
      currentUID: "me"
    )

    XCTAssertEqual(groups.map(\.ownerID), ["me", "beto", "ana"])
    // Inside a group, stories play oldest first.
    XCTAssertEqual(groups.last?.stories.map(\.id), ["a1", "a2"])
  }

  func testStoryFromDocumentData() {
    let parsed = FirebaseStoriesRepo.story(id: "s1", data: [
      "ownerId": "u1",
      "ownerSnapshot": ["displayName": "Lucía", "photoURL": NSNull()],
      "mediaType": "video",
      "mediaUrl": "https://example.com/v.mp4",
      "mediaPath": "stories/u1/s1/original/v.mp4",
      "thumbPath": "stories/u1/s1/thumb/v.jpg",
    ])

    XCTAssertEqual(parsed?.ownerName, "Lucía")
    XCTAssertNil(parsed?.ownerPhotoURL)
    XCTAssertEqual(parsed?.mediaType, .video)
    // Deleting the story removes the thumbnail too.
    XCTAssertEqual(parsed?.thumbPath, "stories/u1/s1/thumb/v.jpg")
    XCTAssertNil(FirebaseStoriesRepo.story(id: "s2", data: ["ownerId": "u1"]))
  }

  func testStoriesLastADay() {
    XCTAssertEqual(FirebaseStoriesRepo.storyDuration, 24 * 60 * 60)
  }

  /// The moderation panel removes a reported story from `story_<id>`
  /// (parseReportedStoryTarget in functions/src/moderation.ts).
  func testStoryReport() {
    let fields = ReportFields(target: .story(storyID: "s1", ownerID: "u1"), details: " ofensiva ")

    XCTAssertEqual(fields.reportedUID, "u1")
    XCTAssertEqual(fields.conversationID, "story_s1")
    XCTAssertEqual(fields.details, "[Historia s1] ofensiva")
    XCTAssertEqual(ReportFields(target: .story(storyID: "s1", ownerID: "u1"), details: nil).details, "[Historia s1]")
  }

  func testEmptyYouTubeEmbedIDProducesBlankPage() {
    let html = YouTubeEmbedView.html(videoID: "!!!")
    XCTAssertFalse(html.contains("<iframe"))
  }

  @MainActor
  func testStoriesViewModelDeleteResetAndExcludeOwner() async {
    let repo = FakeStoriesRepo()
    let s1 = story("s1", owner: "me", minutesAgo: 5)
    let s2 = story("s2", owner: "me", minutesAgo: 2)
    let other = story("s3", owner: "other", minutesAgo: 1)
    repo.stored = [s1, s2, other]

    let vm = StoriesViewModel(repo: repo)
    await vm.load()
    XCTAssertEqual(vm.groups.count, 2)
    XCTAssertFalse(vm.isSeen(StoryGroup(ownerID: "empty", ownerName: "Empty", ownerPhotoURL: nil, stories: [])))

    vm.markSeen(s1)
    XCTAssertFalse(vm.isSeen(vm.groups[0]))
    vm.markSeen(s2)
    XCTAssertTrue(vm.isSeen(vm.groups[0]))

    repo.failsOnDelete = true
    let failedDelete = await vm.delete(s1)
    XCTAssertFalse(failedDelete)
    XCTAssertEqual(vm.errorMessage, "No se pudo eliminar la historia.")

    repo.failsOnDelete = false
    let succeededDelete = await vm.delete(s1)
    XCTAssertTrue(succeededDelete)
    XCTAssertNil(vm.errorMessage)
    XCTAssertEqual(vm.groups.first?.stories.map(\.id), ["s2"])

    vm.excludeOwner("other")
    XCTAssertEqual(vm.groups.map(\.ownerID), ["me"])

    vm.reset()
    XCTAssertTrue(vm.groups.isEmpty)
    XCTAssertTrue(vm.seenStoryIDs.isEmpty)
    XCTAssertNil(vm.errorMessage)
  }
}

private final class FakeStoriesRepo: StoriesRepo {
  var stored: [Story] = []
  var failsOnDelete = false

  func fetchStoryGroups() async throws -> [StoryGroup] {
    StoryGroup.make(from: stored, currentUID: "me")
  }

  func publishImageStory(jpegData: Data) async throws {}

  func deleteStory(_ story: Story) async throws {
    if failsOnDelete { throw FakeError() }
    stored.removeAll { $0.id == story.id }
  }
}

/// Collections must pass `isValidCollectionCreate` / `isValidCollectionItemCreate`.
final class CollectionsTests: XCTestCase {
  func testIconsMatchTheWeb() {
    XCTAssertEqual(CollectionIcon.allCases.map(\.rawValue), ["folder", "book", "music", "idea", "notes"])
    XCTAssertEqual(CollectionIcon.from(nil), .folder)
    XCTAssertEqual(CollectionIcon.from("desconocido"), .folder)
  }

  func testCollectionNames() throws {
    XCTAssertEqual(try FirebaseCollectionsRepo.validatedName("  Libros "), "Libros")
    XCTAssertThrowsError(try FirebaseCollectionsRepo.validatedName("   "))
    XCTAssertThrowsError(try FirebaseCollectionsRepo.validatedName(String(repeating: "a", count: 81)))
  }

  func testLinkItem() throws {
    var item = NewCollectionItem()
    item.title = " Cosmos "
    item.url = " https://example.com/cosmos "

    let fields = try item.validatedFields()

    XCTAssertEqual(fields.type, .link)
    XCTAssertEqual(fields.title, "Cosmos")
    XCTAssertEqual(fields.url, "https://example.com/cosmos")
    XCTAssertNil(fields.text)
    XCTAssertNil(fields.file)

    item.url = "ftp://example.com"
    XCTAssertThrowsError(try item.validatedFields())
    item.url = "javascript:alert(1)"
    XCTAssertThrowsError(try item.validatedFields())
    item.url = "https://"
    XCTAssertThrowsError(try item.validatedFields())
  }

  func testSafeHTTPURL() {
    XCTAssertNotNil(NewCollectionItem.safeHTTPURL("https://example.com/path"))
    XCTAssertNotNil(NewCollectionItem.safeHTTPURL(" http://127.0.0.1:9199/file.pdf "))
    XCTAssertNil(NewCollectionItem.safeHTTPURL("javascript:alert(1)"))
    XCTAssertNil(NewCollectionItem.safeHTTPURL("ftp://example.com"))
    XCTAssertNil(NewCollectionItem.safeHTTPURL("https://"))
    XCTAssertNil(NewCollectionItem.safeHTTPURL("   "))
    XCTAssertNil(NewCollectionItem.safeHTTPURL(nil))
  }

  func testFileItemValidation() throws {
    var item = NewCollectionItem()
    item.kind = .file
    item.title = "Guía"
    XCTAssertThrowsError(try item.validatedFields())

    let emptyFile = CollectionUploadFile(data: Data(), fileName: "vacio.pdf", contentType: "application/pdf")
    XCTAssertThrowsError(try emptyFile.validated())

    let badMime = CollectionUploadFile(data: Data("<html>".utf8), fileName: "page.html", contentType: "text/html")
    XCTAssertThrowsError(try badMime.validated())

    let validFile = CollectionUploadFile(
      data: Data("%PDF-1.4\n".utf8),
      fileName: " guía (final)/2026.pdf ",
      contentType: "APPLICATION/PDF; charset=utf-8"
    )
    let meta = try validFile.validated()
    XCTAssertEqual(meta.contentType, "application/pdf")
    XCTAssertFalse(meta.storageFileName.contains("/"))
    XCTAssertFalse(meta.storageFileName.contains(" "))

    item.file = validFile
    let fields = try item.validatedFields()
    XCTAssertEqual(fields.type, .file)
    XCTAssertEqual(fields.title, "Guía")
    XCTAssertNil(fields.url)
    XCTAssertNil(fields.text)
    XCTAssertEqual(fields.file, validFile)
  }

  func testNoteItem() throws {
    var item = NewCollectionItem()
    item.kind = .note
    item.title = "Idea"
    item.url = "https://ignorado.com"
    item.text = "  Leer más  "

    let fields = try item.validatedFields()

    XCTAssertEqual(fields.type, .note)
    XCTAssertNil(fields.url)
    XCTAssertEqual(fields.text, "Leer más")

    item.text = String(repeating: "a", count: 2001)
    XCTAssertThrowsError(try item.validatedFields())
  }

  @MainActor
  func testSearchFiltersByNameIgnoringDiacriticsAndResetClearsState() async {
    let vm = CollectionsViewModel(repo: FakeCollectionsRepo())
    await vm.load()

    vm.searchText = "JAZZ"
    XCTAssertEqual(vm.visibleCollections.map(\.name), ["Música de jazz"])
    vm.searchText = "musica"
    XCTAssertEqual(vm.visibleCollections.map(\.name), ["Música de jazz"])
    vm.searchText = " "
    XCTAssertEqual(vm.visibleCollections.count, 2)

    vm.reset()
    XCTAssertTrue(vm.collections.isEmpty)
    XCTAssertEqual(vm.searchText, "")
    XCTAssertNil(vm.errorMessage)
    XCTAssertFalse(vm.isLoading)
  }
}

private struct FakeCollectionsRepo: CollectionsRepo {
  func fetchCollections() async throws -> [UserCollection] {
    [
      UserCollection(id: "c1", name: "Libros por leer", icon: .book, itemCount: 1, updatedAt: Date()),
      UserCollection(id: "c2", name: "Música de jazz", icon: .music, itemCount: 2, updatedAt: Date()),
    ]
  }

  func createCollection(name: String, icon: CollectionIcon) async throws {}
  func updateCollection(id: String, name: String, icon: CollectionIcon) async throws {}
  func deleteCollection(id: String) async throws {}
  func fetchItems(collectionID: String) async throws -> [CollectionItem] { [] }
  func addItem(_ item: NewCollectionItem, to collection: UserCollection) async throws {}
  func deleteItem(id: String, from collectionID: String) async throws {}
}

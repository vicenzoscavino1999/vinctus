import XCTest
@testable import VinctusNative

@MainActor
final class CollectionRecentsTests: XCTestCase {
  private let now = Date(timeIntervalSince1970: 1_795_800_000)

  private final class Repo: CollectionsRepo {
    var folders: [UserCollection] = []
    var itemsByFolder: [String: [CollectionItem]] = [:]
    var failingFolder: String?

    func fetchCollections() async throws -> [UserCollection] { folders }
    func createCollection(name: String, icon: CollectionIcon) async throws {}
    func updateCollection(id: String, name: String, icon: CollectionIcon) async throws {}
    func deleteCollection(id: String) async throws {}
    func fetchItems(collectionID: String) async throws -> [CollectionItem] {
      if collectionID == failingFolder { throw FakeError() }
      return itemsByFolder[collectionID] ?? []
    }
    func addItem(_ item: NewCollectionItem, to collection: UserCollection) async throws {}
    func deleteItem(id: String, from collectionID: String) async throws {}
  }

  private func item(_ id: String, _ title: String, minutesAgo: Double) -> CollectionItem {
    CollectionItem(id: id, type: .note, title: title, url: nil, text: "texto", fileName: nil,
                   createdAt: now.addingTimeInterval(-minutesAgo * 60))
  }

  private func makeRepo() -> Repo {
    let repo = Repo()
    repo.folders = [
      UserCollection(id: "books", name: "Libros por leer", icon: .book, itemCount: 2, updatedAt: now),
      UserCollection(id: "jazz", name: "Música de jazz", icon: .music, itemCount: 1, updatedAt: now.addingTimeInterval(-60)),
    ]
    repo.itemsByFolder = [
      "books": [item("b1", "Cosmos", minutesAgo: 30), item("b2", "Sapiens", minutesAgo: 5)],
      "jazz": [item("j1", "Kind of Blue", minutesAgo: 10)],
    ]
    return repo
  }

  func testRecentsAreTheNewestItemsAcrossFolders() async {
    let vm = CollectionsViewModel(repo: makeRepo())
    await vm.load()

    XCTAssertEqual(vm.recents.map(\.item.title), ["Sapiens", "Kind of Blue", "Cosmos"])
    XCTAssertEqual(vm.recents.first?.collectionName, "Libros por leer")
  }

  func testSearchMatchesTheTitleOrTheFolderIgnoringAccents() async {
    let vm = CollectionsViewModel(repo: makeRepo())
    await vm.load()

    vm.searchText = "musica"
    XCTAssertEqual(vm.visibleRecents.map(\.item.title), ["Kind of Blue"], "By folder name")
    vm.searchText = "SAPIENS"
    XCTAssertEqual(vm.visibleRecents.map(\.item.title), ["Sapiens"], "By title")
  }

  func testAFolderThatFailsIsSkippedAndDeletingAFolderDropsItsRecents() async {
    let repo = makeRepo()
    repo.failingFolder = "jazz"
    let vm = CollectionsViewModel(repo: repo)
    await vm.load()
    XCTAssertEqual(vm.recents.map(\.item.title), ["Sapiens", "Cosmos"])
    XCTAssertEqual(vm.collections.count, 2, "The folders still load")

    await vm.delete(vm.collections[0])
    XCTAssertTrue(vm.recents.isEmpty)
  }
}

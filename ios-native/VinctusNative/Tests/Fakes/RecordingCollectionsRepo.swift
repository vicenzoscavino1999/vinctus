import Foundation
@testable import VinctusNative

/// Named apart from the private FakeCollectionsRepo in StoriesCollectionsTests.swift.
final class RecordingCollectionsRepo: CollectionsRepo {
  var items: [CollectionItem] = []
  var created: [(name: String, icon: CollectionIcon)] = []
  var updated: [(id: String, name: String, icon: CollectionIcon)] = []
  var added: [NewCollectionItem] = []
  var deletedItemIDs: [String] = []
  var fails = false

  func fetchCollections() async throws -> [UserCollection] { [] }

  func createCollection(name: String, icon: CollectionIcon) async throws {
    if fails { throw FakeError() }
    created.append((name: name, icon: icon))
  }

  func updateCollection(id: String, name: String, icon: CollectionIcon) async throws {
    if fails { throw FakeError() }
    updated.append((id: id, name: name, icon: icon))
  }

  func deleteCollection(id: String) async throws {}

  func fetchItems(collectionID: String) async throws -> [CollectionItem] {
    if fails { throw FakeError() }
    return items
  }

  func addItem(_ item: NewCollectionItem, to collection: UserCollection) async throws {
    if fails { throw FakeError() }
    added.append(item)
  }

  func deleteItem(id: String, from collectionID: String) async throws {
    deletedItemIDs.append(id)
    if fails { throw FakeError() }
    items.removeAll { $0.id == id }
  }

  static let collection = UserCollection(id: "c1", name: "Libros", icon: .book, itemCount: 2, updatedAt: Date())

  static func item(_ id: String) -> CollectionItem {
    CollectionItem(id: id, type: .link, title: "Enlace \(id)", url: "https://example.com/\(id)", text: nil, fileName: nil, createdAt: Date())
  }
}

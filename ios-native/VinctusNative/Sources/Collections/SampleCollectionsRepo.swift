import Foundation

// Screenshot builds only (see App/DemoData.swift).

#if SCREENSHOTS
struct SampleCollectionsRepo: CollectionsRepo {
  func fetchCollections() async throws -> [UserCollection] {
    [
      UserCollection(id: "c1", name: "Libros por leer", icon: .book, itemCount: 6, updatedAt: Date()),
      UserCollection(id: "c2", name: "Discos de jazz", icon: .music, itemCount: 12, updatedAt: Date()),
      UserCollection(id: "c3", name: "Ideas para proyectos", icon: .idea, itemCount: 3, updatedAt: Date()),
    ]
  }

  func createCollection(name: String, icon: CollectionIcon) async throws {}
  func updateCollection(id: String, name: String, icon: CollectionIcon) async throws {}
  func deleteCollection(id: String) async throws {}

  func fetchItems(collectionID: String) async throws -> [CollectionItem] {
    [
      CollectionItem(id: "i1", type: .link, title: "Cosmos, de Carl Sagan", url: "https://example.com/cosmos", text: nil, fileName: nil, createdAt: Date()),
      CollectionItem(id: "i2", type: .note, title: "Para el club", url: nil, text: "Proponer un libro de divulgación al mes.", fileName: nil, createdAt: Date()),
    ]
  }

  func addItem(_ item: NewCollectionItem, to collection: UserCollection) async throws {}
  func deleteItem(id: String, from collectionID: String) async throws {}
}
#endif

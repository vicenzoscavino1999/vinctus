import Foundation

/// Your collections, with the same search as the web's CollectionsPanel.
@MainActor
final class CollectionsViewModel: ObservableObject {
  @Published private(set) var collections: [UserCollection] = []
  @Published private(set) var isLoading = true
  @Published var errorMessage: String?
  @Published var searchText = ""

  let repo: CollectionsRepo

  init(repo: CollectionsRepo) {
    self.repo = repo
  }

  /// Same search as the web's CollectionsPanel: by name, ignoring case.
  var visibleCollections: [UserCollection] {
    let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !query.isEmpty else { return collections }
    return collections.filter { $0.name.localizedCaseInsensitiveContains(query) }
  }

  func load() async {
    do {
      collections = try await repo.fetchCollections()
      errorMessage = nil
    } catch {
      errorMessage = "No se pudieron cargar tus colecciones."
    }
    isLoading = false
  }

  func delete(_ collection: UserCollection) async {
    let previous = collections
    collections.removeAll { $0.id == collection.id }
    do {
      try await repo.deleteCollection(id: collection.id)
    } catch {
      collections = previous
      errorMessage = "No se pudo eliminar la colección."
    }
  }
}

/// Creating a collection or renaming one and changing its icon.
@MainActor
final class CollectionEditorViewModel: ObservableObject {
  @Published var name: String
  @Published var icon: CollectionIcon
  @Published private(set) var isSaving = false
  @Published private(set) var errorMessage: String?

  let target: CollectionEditorTarget
  private let repo: CollectionsRepo

  init(target: CollectionEditorTarget, repo: CollectionsRepo) {
    self.target = target
    self.repo = repo
    switch target {
    case .new:
      name = ""
      icon = .folder
    case let .existing(collection):
      name = collection.name
      icon = collection.icon
    }
  }

  var title: String {
    if case .new = target { return "Nueva colección" }
    return "Editar colección"
  }

  var canSave: Bool {
    !isSaving && !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
  }

  /// Returns true when the collection was saved.
  func save() async -> Bool {
    guard canSave else { return false }
    isSaving = true
    errorMessage = nil
    defer { isSaving = false }
    do {
      switch target {
      case .new:
        try await repo.createCollection(name: name, icon: icon)
      case let .existing(collection):
        try await repo.updateCollection(id: collection.id, name: name, icon: icon)
      }
      return true
    } catch {
      errorMessage = (error as? LocalizedError)?.errorDescription ?? "No se pudo guardar."
      return false
    }
  }
}

/// The links and notes saved in one collection.
@MainActor
final class CollectionDetailViewModel: ObservableObject {
  @Published private(set) var items: [CollectionItem] = []
  @Published private(set) var isLoading = true
  @Published private(set) var errorMessage: String?

  let collection: UserCollection
  private let repo: CollectionsRepo

  init(collection: UserCollection, repo: CollectionsRepo) {
    self.collection = collection
    self.repo = repo
  }

  func load() async {
    do {
      items = try await repo.fetchItems(collectionID: collection.id)
      errorMessage = nil
    } catch {
      errorMessage = "No se pudo cargar la colección."
    }
    isLoading = false
  }

  /// Removes right away and puts the item back if the delete fails. Returns true when deleted.
  func delete(_ item: CollectionItem) async -> Bool {
    let previous = items
    items.removeAll { $0.id == item.id }
    do {
      try await repo.deleteItem(id: item.id, from: collection.id)
      return true
    } catch {
      items = previous
      errorMessage = "No se pudo eliminar."
      return false
    }
  }
}

/// Adding a link or a note to a collection.
@MainActor
final class NewCollectionItemViewModel: ObservableObject {
  @Published var draft = NewCollectionItem()
  @Published private(set) var isSaving = false
  @Published private(set) var errorMessage: String?

  let collection: UserCollection
  private let repo: CollectionsRepo

  init(collection: UserCollection, repo: CollectionsRepo) {
    self.collection = collection
    self.repo = repo
  }

  /// Returns true when the item was added.
  func save() async -> Bool {
    guard !isSaving else { return false }
    isSaving = true
    errorMessage = nil
    defer { isSaving = false }
    do {
      try await repo.addItem(draft, to: collection)
      return true
    } catch {
      errorMessage = (error as? LocalizedError)?.errorDescription ?? "No se pudo guardar."
      return false
    }
  }
}

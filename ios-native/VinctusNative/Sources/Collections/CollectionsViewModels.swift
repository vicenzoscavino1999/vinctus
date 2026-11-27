import Foundation

/// Your collections, with the same search as the web's CollectionsPanel.
@MainActor
final class CollectionsViewModel: ObservableObject {
  @Published private(set) var collections: [UserCollection] = []
  @Published private(set) var isLoading = true
  @Published var errorMessage: String?
  @Published var searchText = ""
  @Published private(set) var deletingIDs: Set<String> = []
  /// "Recientes": the newest saved items across folders, like the web.
  @Published private(set) var recents: [RecentCollectionItem] = []

  static let recentsLimit = 6

  let repo: CollectionsRepo
  private var loadGeneration = 0

  init(repo: CollectionsRepo) {
    self.repo = repo
  }

  /// Same search as the web's CollectionsPanel: by name, ignoring case and diacritics.
  var visibleCollections: [UserCollection] {
    let query = DiscoverCategory.normalizedSearch(searchText)
    guard !query.isEmpty else { return collections }
    return collections.filter { DiscoverCategory.normalizedSearch($0.name).contains(query) }
  }

  /// Recents whose title or folder matches the search, like the web.
  var visibleRecents: [RecentCollectionItem] {
    let query = DiscoverCategory.normalizedSearch(searchText)
    guard !query.isEmpty else { return recents }
    return recents.filter {
      DiscoverCategory.normalizedSearch($0.item.title).contains(query)
        || DiscoverCategory.normalizedSearch($0.collectionName).contains(query)
    }
  }

  func reset() {
    loadGeneration += 1
    collections = []
    recents = []
    searchText = ""
    errorMessage = nil
    deletingIDs = []
    isLoading = false
  }

  func load() async {
    loadGeneration += 1
    let gen = loadGeneration
    if collections.isEmpty {
      isLoading = true
    }
    async let recentItems = try? repo.fetchRecentItems(limit: Self.recentsLimit)
    do {
      let fetched = try await repo.fetchCollections()
      guard !Task.isCancelled, gen == loadGeneration else { return }
      collections = fetched
      errorMessage = nil
    } catch {
      guard !Task.isCancelled, gen == loadGeneration else { return }
      errorMessage = "No se pudieron cargar tus colecciones."
    }
    // Recents are extra: if they fail, the folders still show.
    let loadedRecents = await recentItems
    if !Task.isCancelled, gen == loadGeneration, let loadedRecents {
      recents = loadedRecents
    }
    isLoading = false
  }

  func delete(_ collection: UserCollection) async {
    guard !deletingIDs.contains(collection.id) else { return }
    let gen = loadGeneration
    deletingIDs.insert(collection.id)
    defer { deletingIDs.remove(collection.id) }

    let originalIndex = collections.firstIndex(where: { $0.id == collection.id })
    let originalRecents = recents
    collections.removeAll { $0.id == collection.id }
    recents.removeAll { $0.collectionID == collection.id }
    errorMessage = nil
    do {
      try await repo.deleteCollection(id: collection.id)
    } catch {
      guard gen == loadGeneration else { return }
      if !collections.contains(where: { $0.id == collection.id }) {
        let index = min(originalIndex ?? collections.count, collections.count)
        collections.insert(collection, at: index)
      }
      recents = originalRecents
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
    let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
    return !isSaving && !trimmed.isEmpty && trimmed.count <= Limits.Collections.nameMaxLength
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

/// The links, notes and files saved in one collection.
@MainActor
final class CollectionDetailViewModel: ObservableObject {
  @Published private(set) var items: [CollectionItem] = []
  @Published private(set) var isLoading = true
  @Published private(set) var errorMessage: String?
  @Published private(set) var deletingIDs: Set<String> = []

  let collection: UserCollection
  private let repo: CollectionsRepo
  private var loadGeneration = 0

  init(collection: UserCollection, repo: CollectionsRepo) {
    self.collection = collection
    self.repo = repo
  }

  func load() async {
    loadGeneration += 1
    let gen = loadGeneration
    if items.isEmpty {
      isLoading = true
    }
    do {
      let fetched = try await repo.fetchItems(collectionID: collection.id)
      guard !Task.isCancelled, gen == loadGeneration else { return }
      items = fetched
      errorMessage = nil
    } catch {
      guard !Task.isCancelled, gen == loadGeneration else { return }
      errorMessage = "No se pudo cargar la colección."
    }
    isLoading = false
  }

  /// Removes right away and puts the item back if the delete fails. Returns true when deleted.
  func delete(_ item: CollectionItem) async -> Bool {
    guard !deletingIDs.contains(item.id) else { return false }
    let gen = loadGeneration
    deletingIDs.insert(item.id)
    defer { deletingIDs.remove(item.id) }

    let originalIndex = items.firstIndex(where: { $0.id == item.id })
    items.removeAll { $0.id == item.id }
    errorMessage = nil
    do {
      try await repo.deleteItem(id: item.id, from: collection.id)
      return true
    } catch {
      if gen == loadGeneration && !items.contains(where: { $0.id == item.id }) {
        let index = min(originalIndex ?? items.count, items.count)
        items.insert(item, at: index)
      }
      errorMessage = "No se pudo eliminar."
      return false
    }
  }
}

/// Adding a link, note or file to a collection.
@MainActor
final class NewCollectionItemViewModel: ObservableObject {
  @Published var draft = NewCollectionItem()
  @Published private(set) var isSaving = false
  @Published private(set) var isImportingFile = false
  @Published var errorMessage: String?

  let collection: UserCollection
  private let repo: CollectionsRepo

  init(collection: UserCollection, repo: CollectionsRepo) {
    self.collection = collection
    self.repo = repo
  }

  func importFile(from url: URL) async {
    guard !isSaving, !isImportingFile else { return }
    isImportingFile = true
    errorMessage = nil
    defer { isImportingFile = false }
    do {
      let upload = try await Task.detached {
        try CollectionUploadFile.load(from: url)
      }.value
      draft.file = upload
      if draft.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
        draft.title = String(upload.fileName.prefix(Limits.CollectionItems.titleMaxLength))
      }
    } catch {
      errorMessage = (error as? LocalizedError)?.errorDescription ?? "No se pudo abrir el archivo."
    }
  }

  func clearFile() {
    guard !isSaving else { return }
    draft.file = nil
  }

  /// Returns true when the item was added.
  func save() async -> Bool {
    guard !isSaving, !isImportingFile else { return false }
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

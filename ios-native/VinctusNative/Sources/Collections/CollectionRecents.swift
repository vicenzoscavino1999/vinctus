import FirebaseFirestore
import Foundation

/// A saved item with the folder it is in, for "Recientes" (the web's `getRecentCollectionItems`).
struct RecentCollectionItem: Identifiable, Hashable {
  let item: CollectionItem
  let collectionID: String
  let collectionName: String

  var id: String { "\(collectionID)_\(item.id)" }
}

extension CollectionsRepo {
  /// Default for repos without a cheaper query: the newest items of the most recently updated
  /// folders.
  func fetchRecentItems(limit: Int) async throws -> [RecentCollectionItem] {
    let folders = try await fetchCollections()
      .sorted { $0.updatedAt > $1.updatedAt }
      .prefix(6)
    var recents: [RecentCollectionItem] = []
    for folder in folders {
      guard let items = try? await fetchItems(collectionID: folder.id) else { continue }
      recents += items.prefix(limit).map {
        RecentCollectionItem(item: $0, collectionID: folder.id, collectionName: folder.name)
      }
    }
    return Array(recents.sorted { $0.item.createdAt > $1.item.createdAt }.prefix(limit))
  }
}

extension FirebaseCollectionsRepo {
  /// Like the web's `getRecentCollectionItems`: the most recently updated folders (up to 24), the
  /// newest items of each, merged by date. A folder that fails to load is skipped.
  func fetchRecentItems(limit: Int) async throws -> [RecentCollectionItem] {
    let safeLimit = max(1, min(limit, 12))
    let folders = try await recentFolders(limit: min(max(safeLimit * 2, 12), 24))
    // The folders are asked at the same time; one that fails is skipped (like Promise.allSettled).
    let recents = await withTaskGroup(of: [RecentCollectionItem].self) { group in
      for folder in folders {
        group.addTask {
          let items = (try? await self.newestItems(collectionID: folder.id, limit: safeLimit)) ?? []
          return items.map { RecentCollectionItem(item: $0, collectionID: folder.id, collectionName: folder.name) }
        }
      }
      var all: [RecentCollectionItem] = []
      for await batch in group { all += batch }
      return all
    }
    return Array(recents.sorted { $0.item.createdAt > $1.item.createdAt }.prefix(safeLimit))
  }
}

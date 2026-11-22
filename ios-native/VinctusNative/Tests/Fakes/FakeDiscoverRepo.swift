import Foundation
@testable import VinctusNative

final class FakeDiscoverRepo: DiscoverRepo {
  var recentUsers: [DiscoverUser] = []
  var searchResultsByQuery: [String: [DiscoverUser]] = [:]
  var liveItemsByQuery: [String: [DiscoverLiveItem]] = [:]
  var categoryGroups: [GroupSummary] = []
  var categoryLibrary: [DiscoverLibraryItem] = []

  var failsRecentUsers = false
  var failsSearch = false
  var failsLive = false
  var failsCategoryGroups = false
  var failsCategoryLibrary = false

  var recordedSearchQueries: [String] = []
  var recordedLiveRequests: [(source: String, query: String, limit: Int)] = []

  var searchHandler: ((String) async throws -> [DiscoverUser])?
  var liveHandler: ((String, String) async throws -> [DiscoverLiveItem])?

  func fetchRecentUsers(limit: Int, excluding uid: String?) async throws -> [DiscoverUser] {
    if failsRecentUsers { throw FakeError() }
    return Array(recentUsers.filter { $0.uid != uid }.prefix(limit))
  }

  func searchUsers(prefix: String, limit: Int, excluding uid: String?) async throws -> [DiscoverUser] {
    recordedSearchQueries.append(prefix)
    if let searchHandler {
      return try await searchHandler(prefix)
    }
    if failsSearch { throw FakeError() }
    let matches = searchResultsByQuery[prefix.lowercased()] ?? []
    return Array(matches.filter { $0.uid != uid }.prefix(limit))
  }

  func fetchLiveContent(source: String, query: String, limit: Int) async throws -> [DiscoverLiveItem] {
    recordedLiveRequests.append((source: source, query: query, limit: limit))
    if let liveHandler {
      return try await liveHandler(source, query)
    }
    if failsLive { throw FakeError() }
    return Array((liveItemsByQuery[query] ?? []).prefix(limit))
  }

  func fetchCategoryGroups(categoryID: String, limit: Int) async throws -> [GroupSummary] {
    if failsCategoryGroups { throw FakeError() }
    return Array(categoryGroups.filter { $0.categoryID == categoryID }.prefix(limit))
  }

  func fetchCategoryLibrary(categoryID: String, limit: Int) async throws -> [DiscoverLibraryItem] {
    if failsCategoryLibrary { throw FakeError() }
    return Array(categoryLibrary.prefix(limit))
  }

  static func user(_ uid: String, name: String) -> DiscoverUser {
    DiscoverUser(uid: uid, displayName: name, photoURL: nil, accountVisibility: .public)
  }

  static func liveItem(_ id: String, title: String) -> DiscoverLiveItem {
    DiscoverLiveItem(
      id: id,
      badge: "En vivo",
      title: title,
      subtitle: "Resumen \(id)",
      meta: "Fuente",
      linkURL: URL(string: "https://example.com/\(id)"),
      imageURL: nil
    )
  }
}

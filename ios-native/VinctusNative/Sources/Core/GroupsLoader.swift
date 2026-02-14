import Foundation

enum GroupsLoadState {
  case success(items: [GroupSummary], isFromCache: Bool)
  case failure(message: String)
}

enum GroupsLoader {
  static func fetchPage(repo: any GroupsRepo, limit: Int = 12) async throws -> GroupsPage {
    try await repo.fetchGroups(limit: limit)
  }

  static func fetchPageResult(repo: any GroupsRepo, limit: Int = 12) async -> Result<GroupsPage, Error> {
    do {
      let page = try await fetchPage(repo: repo, limit: limit)
      return .success(page)
    } catch {
      return .failure(error)
    }
  }

  @MainActor
  static func loadState(repo: any GroupsRepo, limit: Int = 12) async -> GroupsLoadState {
    switch await fetchPageResult(repo: repo, limit: limit) {
    case .success(let page):
      return .success(items: page.items, isFromCache: page.isFromCache)
    case .failure(let error):
      return .failure(message: error.localizedDescription)
    }
  }

  @MainActor
  static func applyLoadState(
    _ state: GroupsLoadState,
    groups: inout [GroupSummary],
    errorMessage: inout String?,
    isShowingCached: inout Bool
  ) {
    switch state {
    case let .success(items, isFromCache):
      groups = items
      isShowingCached = isFromCache
      errorMessage = nil
    case let .failure(message):
      errorMessage = message
      isShowingCached = false
    }
  }

  static func filteredGroups(query: String, groups: [GroupSummary]) -> [GroupSummary] {
    guard !query.isEmpty else { return groups }
    return groups.filter { group in
      group.name.lowercased().contains(query)
        || group.description.lowercased().contains(query)
        || (group.categoryID?.lowercased().contains(query) ?? false)
    }
  }
}

import Foundation

@MainActor
final class DiscoverViewModel: ObservableObject {
  @Published var searchText = ""
  @Published private(set) var suggestedUsers: [DiscoverUser] = []
  @Published private(set) var results: [DiscoverUser] = []
  @Published private(set) var isInitialLoading = false
  @Published private(set) var isSearching = false
  @Published private(set) var errorMessage: String?

  private let repo: DiscoverRepo
  private var searchTask: Task<Void, Never>?
  var currentUserID: String?

  init(repo: DiscoverRepo) {
    self.repo = repo
  }

  deinit {
    searchTask?.cancel()
  }

  var displayedUsers: [DiscoverUser] {
    if isSearchActive {
      return results
    }
    return suggestedUsers
  }

  var isSearchActive: Bool {
    searchText.trimmingCharacters(in: .whitespacesAndNewlines).count >= 2
  }

  func refreshSuggestedUsers() async {
    isInitialLoading = true
    errorMessage = nil
    defer { isInitialLoading = false }

    do {
      suggestedUsers = try await repo.fetchRecentUsers(limit: 15, excluding: currentUserID)
      if !isSearchActive {
        results = []
      }
      let count = suggestedUsers.count
      AppLog.discover.info("discover.recent.success count=\(count, privacy: .public)")
    } catch {
      AppLog.discover.error("discover.recent.failed errorType=\(AppLog.errorType(error), privacy: .public)")
      errorMessage = error.localizedDescription
      suggestedUsers = []
    }
  }

  func handleSearchTextChange(_ value: String) {
    searchText = value
    errorMessage = nil
    searchTask?.cancel()

    let query = value.trimmingCharacters(in: .whitespacesAndNewlines)
    guard query.count >= 2 else {
      isSearching = false
      results = []
      return
    }

    searchTask = Task { [weak self] in
      try? await Task.sleep(nanoseconds: 300_000_000)
      guard !Task.isCancelled else { return }
      await self?.runSearch(query: query)
    }
  }

  func retryCurrentState() {
    if isSearchActive {
      let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
      Task {
        await runSearch(query: query)
      }
    } else {
      Task {
        await refreshSuggestedUsers()
      }
    }
  }

  private func runSearch(query: String) async {
    isSearching = true
    errorMessage = nil
    defer { isSearching = false }

    do {
      results = try await repo.searchUsers(prefix: query, limit: 20, excluding: currentUserID)
      let count = results.count
      AppLog.discover.info("discover.search.success count=\(count, privacy: .public)")
    } catch {
      AppLog.discover.error("discover.search.failed errorType=\(AppLog.errorType(error), privacy: .public)")
      errorMessage = error.localizedDescription
      results = []
    }
  }
}

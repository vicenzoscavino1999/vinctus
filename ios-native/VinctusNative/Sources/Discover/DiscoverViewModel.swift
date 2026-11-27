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
  private var sessionGeneration = 0
  private var searchGeneration = 0
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

  func reset() {
    sessionGeneration += 1
    searchGeneration += 1
    searchTask?.cancel()
    searchTask = nil
    searchText = ""
    suggestedUsers = []
    results = []
    isInitialLoading = false
    isSearching = false
    errorMessage = nil
  }

  func refreshSuggestedUsers() async {
    let generation = sessionGeneration
    isInitialLoading = true
    errorMessage = nil
    defer {
      if sessionGeneration == generation {
        isInitialLoading = false
      }
    }

    do {
      let fetched = try await repo.fetchRecentUsers(limit: 20, excluding: currentUserID)
      guard sessionGeneration == generation else { return }
      suggestedUsers = fetched
      if !isSearchActive {
        results = []
      }
      let count = suggestedUsers.count
      AppLog.discover.info("discover.recent.success count=\(count, privacy: .public)")
    } catch {
      guard sessionGeneration == generation else { return }
      AppLog.discover.error("discover.recent.failed errorType=\(AppLog.errorType(error), privacy: .public)")
      errorMessage = error.localizedDescription
      suggestedUsers = []
    }
  }

  func handleSearchTextChange(_ value: String) {
    searchText = value
    errorMessage = nil
    searchTask?.cancel()
    searchGeneration += 1

    let query = value.trimmingCharacters(in: .whitespacesAndNewlines)
    guard query.count >= 2 else {
      isSearching = false
      results = []
      return
    }

    let expectedSearchGeneration = searchGeneration
    let expectedSessionGeneration = sessionGeneration
    searchTask = Task { [weak self] in
      try? await Task.sleep(nanoseconds: 300_000_000)
      guard !Task.isCancelled else { return }
      await self?.runSearch(
        query: query,
        searchGeneration: expectedSearchGeneration,
        sessionGeneration: expectedSessionGeneration
      )
    }
  }

  func refreshSearchNow() async {
    searchTask?.cancel()
    searchGeneration += 1
    let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
    guard query.count >= 2 else {
      isSearching = false
      results = []
      return
    }
    await runSearch(
      query: query,
      searchGeneration: searchGeneration,
      sessionGeneration: sessionGeneration
    )
  }

  func retryCurrentState() {
    if isSearchActive {
      searchTask?.cancel()
      searchGeneration += 1
      let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
      let expectedSearch = searchGeneration
      let expectedSession = sessionGeneration
      searchTask = Task { [weak self] in
        await self?.runSearch(
          query: query,
          searchGeneration: expectedSearch,
          sessionGeneration: expectedSession
        )
      }
    } else {
      Task {
        await refreshSuggestedUsers()
      }
    }
  }

  private func runSearch(
    query: String,
    searchGeneration expectedSearch: Int,
    sessionGeneration expectedSession: Int
  ) async {
    isSearching = true
    errorMessage = nil
    defer {
      if self.searchGeneration == expectedSearch && self.sessionGeneration == expectedSession {
        isSearching = false
      }
    }

    do {
      let fetched = try await repo.searchUsers(prefix: query, limit: 20, excluding: currentUserID)
      guard !Task.isCancelled,
            self.searchGeneration == expectedSearch,
            self.sessionGeneration == expectedSession
      else { return }
      results = fetched
      let count = results.count
      AppLog.discover.info("discover.search.success count=\(count, privacy: .public)")
    } catch {
      guard !Task.isCancelled,
            self.searchGeneration == expectedSearch,
            self.sessionGeneration == expectedSession
      else { return }
      AppLog.discover.error("discover.search.failed errorType=\(AppLog.errorType(error), privacy: .public)")
      errorMessage = error.localizedDescription
      results = []
    }
  }
}

@MainActor
final class DiscoverCategoryViewModel: ObservableObject {
  enum Tab: String, CaseIterable, Identifiable {
    case live
    case groups
    case library

    var id: String { rawValue }
    var title: String {
      switch self {
      case .live: return "En vivo"
      case .groups: return "Comunidades"
      case .library: return "Biblioteca"
      }
    }
  }

  let category: DiscoverCategory

  @Published var selectedTab: Tab = .live
  @Published var selectedSubgroupID: String
  @Published private(set) var liveItems: [DiscoverLiveItem] = []
  @Published private(set) var isLoadingLive = false
  @Published private(set) var liveError: String?

  @Published private(set) var groups: [GroupSummary] = []
  @Published private(set) var isLoadingGroups = false
  @Published private(set) var groupsError: String?

  @Published private(set) var libraryItems: [DiscoverLibraryItem] = []
  @Published private(set) var isLoadingLibrary = false
  @Published private(set) var libraryError: String?

  @Published private(set) var isFollowed = false
  @Published private(set) var isUpdatingFollow = false
  @Published private(set) var followError: String?

  private let repo: DiscoverRepo
  private let profileContentRepo: ProfileContentRepo
  private var liveGeneration = 0

  init(
    category: DiscoverCategory,
    repo: DiscoverRepo,
    profileContentRepo: ProfileContentRepo
  ) {
    self.category = category
    self.repo = repo
    self.profileContentRepo = profileContentRepo
    self.selectedSubgroupID = category.subgroups.first?.id ?? category.id
  }

  var activeQuery: String {
    category.subgroups.first { $0.id == selectedSubgroupID }?.apiQuery ?? category.defaultQuery
  }

  /// Communities and library load the first time their tab opens (like the web), not on every
  /// visit.
  private(set) var hasLoadedGroups = false
  private(set) var hasLoadedLibrary = false

  /// What the category shows first: the live content and whether it is followed.
  func load() async {
    async let live: Void = loadLive()
    async let follow: Void = loadFollowState()
    _ = await (live, follow)
  }

  /// The communities or the library, the first time their tab is selected.
  func loadSelectedTabIfNeeded() async {
    switch selectedTab {
    case .live:
      return
    case .groups:
      if !hasLoadedGroups { await loadGroups() }
    case .library:
      if !hasLoadedLibrary { await loadLibrary() }
    }
  }

  /// Pull to refresh: what is shown first, plus the tabs already opened.
  func refresh() async {
    await load()
    if hasLoadedGroups { await loadGroups() }
    if hasLoadedLibrary { await loadLibrary() }
  }

  /// Everything at once.
  func loadAll() async {
    async let live: Void = loadLive()
    async let categoryGroups: Void = loadGroups()
    async let library: Void = loadLibrary()
    async let follow: Void = loadFollowState()
    _ = await (live, categoryGroups, library, follow)
  }

  func selectSubgroup(_ subgroupID: String) async {
    guard subgroupID != selectedSubgroupID else { return }
    selectedSubgroupID = subgroupID
    await loadLive()
  }

  func loadLive() async {
    liveGeneration += 1
    let generation = liveGeneration
    isLoadingLive = true
    liveError = nil
    defer {
      if liveGeneration == generation {
        isLoadingLive = false
      }
    }

    do {
      let fetched = try await repo.fetchLiveContent(
        source: category.apiSource,
        query: activeQuery,
        limit: 8
      )
      guard liveGeneration == generation else { return }
      liveItems = fetched
    } catch {
      guard liveGeneration == generation else { return }
      liveItems = []
      liveError = "No se pudo cargar el contenido en vivo. Revisa tu conexión e intenta de nuevo."
    }
  }

  func loadGroups() async {
    hasLoadedGroups = true
    isLoadingGroups = true
    groupsError = nil
    defer { isLoadingGroups = false }
    do {
      groups = try await repo.fetchCategoryGroups(categoryID: category.id, limit: 50)
    } catch {
      groups = []
      groupsError = "No se pudieron cargar las comunidades."
    }
  }

  func loadLibrary() async {
    hasLoadedLibrary = true
    isLoadingLibrary = true
    libraryError = nil
    defer { isLoadingLibrary = false }
    do {
      libraryItems = try await repo.fetchCategoryLibrary(categoryID: category.id, limit: 16)
    } catch {
      libraryItems = []
      libraryError = "No se pudo cargar la biblioteca."
    }
  }

  func loadFollowState() async {
    if let followed = try? await profileContentRepo.fetchFollowedCategories() {
      isFollowed = followed.contains(category.id)
    }
  }

  func toggleFollow() async {
    guard !isUpdatingFollow else { return }
    let next = !isFollowed
    isUpdatingFollow = true
    followError = nil
    defer { isUpdatingFollow = false }
    do {
      try await profileContentRepo.setCategoryFollowed(next, categoryID: category.id)
      isFollowed = next
    } catch {
      followError = "No se pudo actualizar el seguimiento de la categoría."
    }
  }
}

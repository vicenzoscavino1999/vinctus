import Foundation

@MainActor
final class GroupsListViewModel: ObservableObject {
  @Published private(set) var groups: [GroupSummary] = []
  @Published private(set) var isLoading = false
  @Published private(set) var errorMessage: String?
  @Published private(set) var isShowingCachedData = false

  private let repo: GroupsRepo

  init(repo: GroupsRepo) {
    self.repo = repo
  }

  func refresh() async {
    isLoading = true
    errorMessage = nil
    defer { isLoading = false }

    do {
      let page = try await repo.fetchGroups(limit: 50)
      groups = page.items
      isShowingCachedData = page.isFromCache
      let count = groups.count
      AppLog.groups.info("groups.list.success count=\(count, privacy: .public) cache=\(page.isFromCache, privacy: .public)")
    } catch {
      AppLog.groups.error("groups.list.failed errorType=\(AppLog.errorType(error), privacy: .public)")
      errorMessage = error.localizedDescription
      groups = []
      isShowingCachedData = false
    }
  }
}

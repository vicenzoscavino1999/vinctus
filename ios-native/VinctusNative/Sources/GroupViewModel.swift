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

@MainActor
final class GroupDetailViewModel: ObservableObject {
  @Published private(set) var detail: GroupDetail?
  @Published private(set) var isLoading = false
  @Published private(set) var errorMessage: String?
  @Published private(set) var isShowingCachedData = false
  @Published private(set) var isOnline = true

  private let repo: GroupsRepo
  private let groupID: String

  init(repo: GroupsRepo, groupID: String) {
    self.repo = repo
    self.groupID = groupID
  }

  func refresh() async {
    let normalizedGroupID = groupID.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !normalizedGroupID.isEmpty else {
      detail = nil
      errorMessage = "Grupo invalido."
      return
    }

    isLoading = true
    errorMessage = nil
    defer { isLoading = false }

    do {
      let loadedDetail = try await repo.fetchGroupDetail(
        groupID: normalizedGroupID,
        recentPostLimit: 5,
        topMemberLimit: 5
      )

      guard let loadedDetail else {
        detail = nil
        isShowingCachedData = false
        errorMessage = "Grupo no encontrado."
        return
      }

      detail = loadedDetail
      isShowingCachedData = loadedDetail.isFromCache
      AppLog.groups.info("groups.detail.success groupID=\(normalizedGroupID, privacy: .private) cache=\(loadedDetail.isFromCache, privacy: .public)")
    } catch {
      AppLog.groups.error("groups.detail.failed groupID=\(normalizedGroupID, privacy: .private) errorType=\(AppLog.errorType(error), privacy: .public)")
      errorMessage = error.localizedDescription
    }
  }

  func handleConnectivityChange(_ online: Bool) {
    let wasOnline = isOnline
    isOnline = online

    if !wasOnline && online && (isShowingCachedData || detail == nil) {
      Task {
        await refresh()
      }
    }
  }
}

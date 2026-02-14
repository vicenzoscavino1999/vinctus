import Foundation
import OSLog

@MainActor
final class FeedViewModel: ObservableObject {
  @Published private(set) var items: [FeedItem] = []
  @Published var errorMessage: String?
  @Published var loadMoreErrorMessage: String?
  @Published private(set) var isInitialLoading = false
  @Published private(set) var isRefreshing = false
  @Published private(set) var isLoadingMore = false
  @Published private(set) var isShowingCachedData = false
  @Published private(set) var canLoadMore = false

  private let repo: FeedRepo
  private let pageSize = 15
  private var nextCursor: FeedCursor?
  private var hasLoadedOnce = false
  private var loadMoreTask: Task<Void, Never>?

  init(repo: FeedRepo) {
    self.repo = repo
  }

  func refresh() async {
    guard !isInitialLoading, !isRefreshing else { return }

    loadMoreTask?.cancel()
    loadMoreTask = nil
    isLoadingMore = false

    if hasLoadedOnce {
      isRefreshing = true
    } else {
      isInitialLoading = true
    }

    errorMessage = nil
    loadMoreErrorMessage = nil
    defer {
      isInitialLoading = false
      isRefreshing = false
    }

    do {
      AppLog.ui.info("feed.refresh.start")
      let page = try await repo.fetchFeedPage(limit: pageSize, after: nil)
      items = page.items
      nextCursor = page.nextCursor
      canLoadMore = page.hasMore
      isShowingCachedData = page.isFromCache
      hasLoadedOnce = true
      AppLog.ui.info(
        "feed.refresh.success count=\(page.items.count, privacy: .public) hasMore=\(page.hasMore, privacy: .public) cache=\(page.isFromCache, privacy: .public)"
      )
    } catch {
      AppLog.ui.error("feed.refresh.failed errorType=\(AppLog.errorType(error), privacy: .public)")
      if items.isEmpty {
        errorMessage = error.localizedDescription
      } else {
        errorMessage = "No se pudo actualizar el feed. Mostrando el contenido anterior."
        isShowingCachedData = true
      }
    }
  }

  func loadMoreIfNeeded(currentItem: FeedItem) {
    guard canLoadMore else { return }
    guard !isInitialLoading, !isRefreshing, !isLoadingMore else { return }
    guard currentItem.id == items.last?.id else { return }
    loadMore()
  }

  func retryLoadMore() {
    loadMore()
  }

  func triggerLoadMoreFromFooter() {
    loadMore()
  }

  func updateCommentCount(postID: String, newCount: Int) {
    guard newCount >= 0 else { return }
    guard let index = items.firstIndex(where: { $0.id == postID }) else { return }
    guard items[index].commentCount != newCount else { return }

    // Re-assign the array to ensure @Published emits and List rows refresh.
    var updatedItems = items
    updatedItems[index].commentCount = newCount
    items = updatedItems
  }

  private func loadMore() {
    guard canLoadMore else { return }
    guard !isInitialLoading, !isRefreshing, !isLoadingMore else { return }

    isLoadingMore = true
    loadMoreErrorMessage = nil

    loadMoreTask?.cancel()
    loadMoreTask = Task {
      defer { isLoadingMore = false }
      defer { loadMoreTask = nil }
      do {
        try Task.checkCancellation()
        AppLog.ui.info("feed.loadMore.start")
        let page = try await repo.fetchFeedPage(limit: pageSize, after: nextCursor)
        try Task.checkCancellation()
        appendDeduped(page.items)
        nextCursor = page.nextCursor
        canLoadMore = page.hasMore
        AppLog.ui.info(
          "feed.loadMore.success added=\(page.items.count, privacy: .public) hasMore=\(page.hasMore, privacy: .public)"
        )
      } catch is CancellationError {
        AppLog.ui.info("feed.loadMore.cancelled")
      } catch {
        AppLog.ui.error(
          "feed.loadMore.failed errorType=\(AppLog.errorType(error), privacy: .public)"
        )
        loadMoreErrorMessage = "No se pudieron cargar mas publicaciones."
      }
    }
  }

  private func appendDeduped(_ incoming: [FeedItem]) {
    guard !incoming.isEmpty else { return }
    var existingIDs = Set(items.map(\.id))
    for item in incoming where !existingIDs.contains(item.id) {
      items.append(item)
      existingIDs.insert(item.id)
    }
  }
}

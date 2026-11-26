import Foundation

extension Notification.Name {
  /// Activity was read or deleted, or a request answered: the bell asks for its count again.
  static let vinctusNotificationsChanged = Notification.Name("vinctus.notificationsChanged")
}

/// The Notifications screen: activity (grouped like the web) and pending requests. Marking as
/// read, deleting and answering show at once and are undone when the server refuses.
@MainActor
final class NotificationsViewModel: ObservableObject {
  enum LoadState: Equatable { case loading, ready, failed }

  @Published private(set) var activity: [ActivityNotification] = []
  @Published private(set) var activityState: LoadState = .loading
  @Published private(set) var hasMoreActivity = false
  @Published private(set) var isLoadingMore = false
  @Published private(set) var requestsByKind: [IncomingRequest.Kind: [IncomingRequest]] = [:]
  @Published private(set) var loadingKinds: Set<IncomingRequest.Kind> = Set(IncomingRequest.Kind.allCases)
  @Published private(set) var failedKinds: Set<IncomingRequest.Kind> = []
  @Published private(set) var busyIDs: Set<String> = []
  @Published private(set) var isMarkingAll = false
  @Published var filter: ActivityFilter = .all
  /// A short message after an action failed (shown as a banner).
  @Published var message: String?

  /// Accounts the signed-in person blocked; their activity and requests are hidden.
  var blocked: Set<String> = []

  static let pageSize = 20
  /// Pages made only of blocked senders are skipped, up to this many, so the list is not empty.
  static let maxBlockedSkipPages = 2

  private let repo: NotificationsRepo
  private var cursor: NotificationsCursor?
  private var generation = 0

  init(repo: NotificationsRepo) {
    self.repo = repo
  }

  // MARK: Derived

  var sections: [ActivitySection] {
    NotificationsFeed.group(activity.filter { filter.matches($0) })
  }

  /// Rows with something unread: repeated notifications count once, as they are shown.
  var unreadRows: Int {
    NotificationsFeed.group(activity.filter { !$0.read }).reduce(0) { $0 + $1.groups.count }
  }

  var requests: [IncomingRequest] {
    IncomingRequest.Kind.allCases
      .flatMap { requestsByKind[$0] ?? [] }
      .sorted { $0.createdAt > $1.createdAt }
  }

  var isLoadingRequests: Bool { !loadingKinds.isEmpty }

  func count(_ kind: IncomingRequest.Kind) -> Int { requestsByKind[kind]?.count ?? 0 }

  // MARK: Loading

  func refresh() async {
    async let activityLoad: Void = loadActivity()
    async let requestsLoad: Void = loadRequests(Set(IncomingRequest.Kind.allCases))
    _ = await (activityLoad, requestsLoad)
  }

  func reset() {
    generation += 1
    activity = []
    activityState = .loading
    hasMoreActivity = false
    cursor = nil
    requestsByKind = [:]
    loadingKinds = Set(IncomingRequest.Kind.allCases)
    failedKinds = []
    busyIDs = []
    message = nil
  }

  func loadActivity() async {
    let current = generation
    do {
      let (items, nextCursor, hasMore) = try await fetchVisiblePages(after: nil)
      guard current == generation else { return }
      activity = items
      cursor = nextCursor
      hasMoreActivity = hasMore
      activityState = .ready
    } catch {
      guard current == generation else { return }
      if activityState != .ready { activityState = .failed }
    }
  }

  func loadMore() async {
    guard hasMoreActivity, !isLoadingMore, let cursor else { return }
    let current = generation
    isLoadingMore = true
    defer { isLoadingMore = false }
    do {
      let (items, nextCursor, hasMore) = try await fetchVisiblePages(after: cursor)
      guard current == generation else { return }
      let known = Set(activity.map(\.id))
      activity += items.filter { !known.contains($0.id) }
      self.cursor = nextCursor
      hasMoreActivity = hasMore
    } catch {
      message = "No se pudieron cargar más notificaciones."
    }
  }

  private func fetchVisiblePages(
    after start: NotificationsCursor?
  ) async throws -> ([ActivityNotification], NotificationsCursor?, Bool) {
    var next = start
    var collected: [ActivityNotification] = []
    var hasMore = false
    var attempts = 0
    repeat {
      let page = try await repo.fetchActivity(limit: Self.pageSize, after: next)
      let known = Set(collected.map(\.id))
      collected += page.items.filter { !blocked.contains($0.fromUID) && !known.contains($0.id) }
      next = page.cursor
      hasMore = page.hasMore && page.cursor != nil
      attempts += 1
    } while collected.isEmpty && hasMore && attempts <= Self.maxBlockedSkipPages
    return (collected, next, hasMore)
  }

  func loadRequests(_ kinds: Set<IncomingRequest.Kind>) async {
    let current = generation
    loadingKinds.formUnion(kinds)
    await withTaskGroup(of: (IncomingRequest.Kind, [IncomingRequest]?).self) { group in
      for kind in kinds {
        let repo = self.repo
        group.addTask { (kind, try? await repo.fetchRequests(kind)) }
      }
      for await (kind, requests) in group {
        guard current == generation else { continue }
        loadingKinds.remove(kind)
        if let requests {
          requestsByKind[kind] = requests.filter { !blocked.contains($0.fromUID) }
          failedKinds.remove(kind)
        } else {
          failedKinds.insert(kind)
        }
      }
    }
  }

  func retryFailedRequests() async {
    await loadRequests(failedKinds)
  }

  // MARK: Activity actions

  func markRead(_ group: ActivityGroup) async {
    let ids = Set(group.unreadIDs)
    guard !ids.isEmpty, !busyIDs.contains(group.id) else { return }
    busyIDs.insert(group.id)
    defer { busyIDs.remove(group.id) }
    setRead(true, ids: ids)
    do {
      try await repo.markRead(ids: Array(ids))
      NotificationCenter.default.post(name: .vinctusNotificationsChanged, object: nil)
    } catch {
      setRead(false, ids: ids)
      message = "No se pudo marcar como leída."
    }
  }

  func markAllRead() async {
    let ids = Set(activity.filter { !$0.read }.map(\.id))
    guard !ids.isEmpty, !isMarkingAll else { return }
    isMarkingAll = true
    defer { isMarkingAll = false }
    setRead(true, ids: ids)
    do {
      try await repo.markRead(ids: Array(ids))
      NotificationCenter.default.post(name: .vinctusNotificationsChanged, object: nil)
    } catch {
      setRead(false, ids: ids)
      message = "No se pudieron marcar todas como leídas."
    }
  }

  func delete(_ group: ActivityGroup) async {
    guard !busyIDs.contains(group.id) else { return }
    busyIDs.insert(group.id)
    defer { busyIDs.remove(group.id) }
    let removed = group.items
    let ids = Set(removed.map(\.id))
    activity.removeAll { ids.contains($0.id) }
    var failed: [ActivityNotification] = []
    for item in removed {
      do {
        try await repo.delete(id: item.id)
      } catch {
        failed.append(item)
      }
    }
    if failed.isEmpty {
      NotificationCenter.default.post(name: .vinctusNotificationsChanged, object: nil)
    } else {
      activity = (activity + failed).sorted { $0.createdAt > $1.createdAt }
      message = "No se pudo eliminar la notificación."
    }
  }

  private func setRead(_ read: Bool, ids: Set<String>) {
    activity = activity.map { item in
      guard ids.contains(item.id) else { return item }
      var updated = item
      updated.read = read
      return updated
    }
  }

  // MARK: Requests

  func accept(_ request: IncomingRequest) async {
    await answer(request) {
      try await self.repo.accept(request)
    }
  }

  func reject(_ request: IncomingRequest) async {
    await answer(request) {
      try await self.repo.reject(request)
    }
  }

  private func answer(_ request: IncomingRequest, action: () async throws -> Void) async {
    guard !busyIDs.contains(request.id) else { return }
    busyIDs.insert(request.id)
    defer { busyIDs.remove(request.id) }
    do {
      try await action()
      requestsByKind[request.kind]?.removeAll { $0.requestID == request.requestID }
      NotificationCenter.default.post(name: .vinctusNotificationsChanged, object: nil)
    } catch NotificationsRepoError.groupNotFound {
      message = NotificationsRepoError.groupNotFound.errorDescription
      requestsByKind[request.kind]?.removeAll { $0.requestID == request.requestID }
    } catch {
      message = "No se pudo responder la solicitud. Puede que ya no esté vigente."
      await loadRequests([request.kind])
    }
  }

  // MARK: Opening

  func post(id: String) async -> FeedItem? {
    try? await repo.fetchPost(id: id)
  }
}

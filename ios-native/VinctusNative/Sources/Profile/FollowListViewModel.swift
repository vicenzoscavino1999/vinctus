import Foundation

/// Followers and following lists of a profile, plus the follow requests on your own profile.
@MainActor
final class FollowListViewModel: ObservableObject {
  /// The list on screen; the view reloads when it changes.
  @Published var kind: FollowListKind
  @Published private(set) var users: [ProfileUserSummary] = []
  @Published private(set) var hasMore = false
  @Published private(set) var isLoading = true
  @Published private(set) var isLoadingMore = false
  @Published private(set) var errorMessage: String?
  @Published private(set) var requests: [IncomingFollowRequest] = []
  @Published private(set) var requestsError: String?
  @Published private(set) var actionError: String?

  static let pageSize = 30

  let showsRequests: Bool
  private let repo: ProfileContentRepo
  private let userID: String
  private var nextPage: ProfileListCursor?
  private var delayedReloadTask: Task<Void, Never>?

  init(repo: ProfileContentRepo, userID: String, initialKind: FollowListKind, showsRequests: Bool) {
    self.repo = repo
    self.userID = userID
    self.kind = initialKind
    self.showsRequests = showsRequests
  }

  deinit {
    delayedReloadTask?.cancel()
  }

  func load() async {
    let listKind = kind
    isLoading = true
    do {
      let page = try await repo.fetchFollowList(uid: userID, kind: listKind, limit: Self.pageSize, after: nil)
      // The user may have switched lists while this page was loading; that load fills the list.
      guard listKind == kind else { return }
      users = Self.deduplicated(page.items)
      setNextPage(page.next)
      errorMessage = nil
    } catch {
      guard listKind == kind else { return }
      errorMessage = FirestoreValue.isPermissionDenied(error)
        ? "Esta lista de conexiones es privada."
        : "No se pudo cargar la lista."
    }
    isLoading = false
  }

  func loadMore() async {
    guard let cursor = nextPage, !isLoadingMore else { return }
    let listKind = kind
    isLoadingMore = true
    defer { isLoadingMore = false }
    do {
      let page = try await repo.fetchFollowList(uid: userID, kind: listKind, limit: Self.pageSize, after: cursor)
      guard listKind == kind else { return }
      let known = Set(users.map(\.id))
      users += page.items.filter { !known.contains($0.id) }
      setNextPage(page.next)
    } catch {
      errorMessage = "No se pudo cargar más."
    }
  }

  func loadRequests() async {
    guard showsRequests else { return }
    requestsError = nil
    do {
      requests = try await repo.fetchIncomingFollowRequests()
    } catch {
      requestsError = "No se pudieron cargar las solicitudes."
    }
  }

  /// Accepting adds a follower via Cloud Function; optimistically keeps the user visible and reconciles.
  func answer(_ request: IncomingFollowRequest, accept: Bool) async {
    actionError = nil
    let originalIndex = requests.firstIndex(where: { $0.id == request.id })
    requests.removeAll { $0.id == request.id }

    do {
      try await repo.answerFollowRequest(from: request.from.id, accept: accept)
    } catch {
      if let originalIndex, !requests.contains(where: { $0.id == request.id }) {
        requests.insert(request, at: min(originalIndex, requests.count))
      }
      actionError = "No se pudo responder la solicitud."
      return
    }

    if accept, kind == .followers {
      if !users.contains(where: { $0.id == request.from.id }) {
        users.insert(request.from, at: 0)
      }
      await load()
      if !users.contains(where: { $0.id == request.from.id }) {
        users.insert(request.from, at: 0)
        delayedReloadTask?.cancel()
        delayedReloadTask = Task {
          try? await Task.sleep(nanoseconds: 1_200_000_000)
          guard !Task.isCancelled else { return }
          await load()
        }
      }
    }
  }

  private static func deduplicated(_ items: [ProfileUserSummary]) -> [ProfileUserSummary] {
    var seen = Set<String>()
    return items.filter { seen.insert($0.id).inserted }
  }

  private func setNextPage(_ cursor: ProfileListCursor?) {
    nextPage = cursor
    hasMore = cursor != nil
  }
}

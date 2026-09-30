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

  static let pageSize = 30

  let showsRequests: Bool
  private let repo: ProfileContentRepo
  private let userID: String
  private var nextPage: ProfileListCursor?

  init(repo: ProfileContentRepo, userID: String, initialKind: FollowListKind, showsRequests: Bool) {
    self.repo = repo
    self.userID = userID
    self.kind = initialKind
    self.showsRequests = showsRequests
  }

  func load() async {
    let listKind = kind
    isLoading = true
    do {
      let page = try await repo.fetchFollowList(uid: userID, kind: listKind, limit: Self.pageSize, after: nil)
      // The user may have switched lists while this page was loading; that load fills the list.
      guard listKind == kind else { return }
      users = page.items
      setNextPage(page.next)
      errorMessage = nil
    } catch {
      guard listKind == kind else { return }
      errorMessage = "No se pudo cargar la lista."
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
    requests = (try? await repo.fetchIncomingFollowRequests()) ?? []
  }

  /// Accepting adds a follower, so the followers list reloads.
  func answer(_ request: IncomingFollowRequest, accept: Bool) async {
    requests.removeAll { $0.id == request.id }
    try? await repo.answerFollowRequest(from: request.from.id, accept: accept)
    if accept, kind == .followers {
      await load()
    }
  }

  private func setNextPage(_ cursor: ProfileListCursor?) {
    nextPage = cursor
    hasMore = cursor != nil
  }
}

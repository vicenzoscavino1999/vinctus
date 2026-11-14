import FirebaseAuth
import FirebaseCore
import FirebaseFirestore
import Foundation

struct SavedPostsCursor {
  let token: String
}

struct SavedPostsPage {
  let items: [FeedItem]
  let next: SavedPostsCursor?
}

protocol SavedPostsRepo {
  func fetchSavedPosts(limit: Int, after cursor: SavedPostsCursor?) async throws -> SavedPostsPage
}

final class FirebaseSavedPostsRepo: SavedPostsRepo {
  func fetchSavedPosts(limit: Int, after cursor: SavedPostsCursor?) async throws -> SavedPostsPage {
    guard FirebaseApp.app() != nil else { throw EngagementRepoError.firebaseNotConfigured }
    guard Auth.auth().currentUser != nil else { throw EngagementRepoError.userNotAuthenticated }
    let result = try await PostReadClient.read(view: "saved", limit: max(1, min(30, limit)), cursor: cursor?.token)
    return SavedPostsPage(
      items: result.items.map { FirebaseFeedRepo.feedItem(id: $0.id, data: $0.fields) },
      next: result.cursor.map { SavedPostsCursor(token: $0) }
    )
  }
}

struct SampleSavedPostsRepo: SavedPostsRepo {
  func fetchSavedPosts(limit: Int, after cursor: SavedPostsCursor?) async throws -> SavedPostsPage {
    SavedPostsPage(items: [], next: nil)
  }
}

@MainActor
final class SavedPostsViewModel: ObservableObject {
  @Published private(set) var items: [FeedItem] = []
  @Published private(set) var isLoading = false
  @Published private(set) var isLoadingMore = false
  @Published private(set) var canLoadMore = false
  @Published private(set) var errorMessage: String?
  @Published private(set) var refreshFailed = false
  private let repo: any SavedPostsRepo
  private var cursor: SavedPostsCursor?
  private var generation = 0

  init(repo: any SavedPostsRepo) { self.repo = repo }

  func load() async {
    generation += 1
    let request = generation
    isLoading = true
    isLoadingMore = false
    errorMessage = nil
    refreshFailed = false
    do {
      let page = try await repo.fetchSavedPosts(limit: 20, after: nil)
      guard request == generation else { return }
      items = page.items
      cursor = page.next
      canLoadMore = cursor != nil
    } catch {
      guard request == generation else { return }
      errorMessage = "No se pudieron cargar los guardados. Reintenta."
      refreshFailed = true
    }
    guard request == generation else { return }
    isLoading = false
  }

  func loadMore() async {
    guard !isLoading, !isLoadingMore, let cursor else { return }
    let request = generation
    isLoadingMore = true
    errorMessage = nil
    do {
      let page = try await repo.fetchSavedPosts(limit: 20, after: cursor)
      guard request == generation else { return }
      var seen = Set(items.map(\.id))
      items.append(contentsOf: page.items.filter { seen.insert($0.id).inserted })
      self.cursor = page.next
      canLoadMore = page.next != nil
    } catch {
      guard request == generation else { return }
      errorMessage = "No se pudieron cargar más guardados. Reintenta."
    }
    guard request == generation else { return }
    isLoadingMore = false
  }
}

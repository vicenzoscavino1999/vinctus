import FirebaseAuth
import FirebaseCore
import FirebaseFirestore
import Foundation

struct SavedPostsCursor {
  let createdAt: Timestamp
  let postID: String
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
    guard let uid = Auth.auth().currentUser?.uid else { throw EngagementRepoError.userNotAuthenticated }
    let db = Firestore.firestore()
    let pageSize = max(1, min(30, limit))
    var query = db.collection(FirestoreCollections.users).document(uid)
      .collection(FirestoreSubcollections.savedPosts)
      .order(by: "createdAt", descending: true)
      .order(by: FieldPath.documentID(), descending: true)
      .limit(to: pageSize + 1)
    if let cursor { query = query.start(after: [cursor.createdAt, cursor.postID]) }
    let snapshot = try await query.getDocuments(source: .server)
    let documents = Array(snapshot.documents.prefix(pageSize))
    var items: [FeedItem] = []
    // Advance over the saved index, even when the referenced post was removed.
    for saved in documents {
      let post = try await db.collection(FirestoreCollections.posts).document(saved.documentID)
        .getDocument(source: .server)
      if FirebaseFeedRepo.isPublished(post) { items.append(FirebaseFeedRepo.feedItem(from: post)) }
    }
    let next: SavedPostsCursor? = snapshot.documents.count > pageSize ? documents.last.flatMap {
      guard let date = $0.data()["createdAt"] as? Timestamp else { return nil }
      return SavedPostsCursor(createdAt: date, postID: $0.documentID)
    } : nil
    return SavedPostsPage(items: items, next: next)
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

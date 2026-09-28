import FirebaseCore
import FirebaseFirestore
import Foundation

struct FeedItem: Identifiable, Hashable {
  let id: String
  let authorID: String?
  let authorName: String
  let text: String
  let createdAt: Date?
  var likeCount: Int
  var commentCount: Int
}

struct FeedCursor {
  fileprivate let lastDocument: QueryDocumentSnapshot
}

struct FeedPage {
  let items: [FeedItem]
  let nextCursor: FeedCursor?
  let hasMore: Bool
  let isFromCache: Bool
}

protocol FeedRepo {
  func fetchFeedPage(limit: Int, after cursor: FeedCursor?) async throws -> FeedPage
}

enum FeedRepoError: LocalizedError {
  case firebaseNotConfigured
  case missingSnapshot

  var errorDescription: String? {
    switch self {
    case .firebaseNotConfigured:
      return "Firebase no está configurado."
    case .missingSnapshot:
      return "No se pudo cargar el feed."
    }
  }
}

final class FirebaseFeedRepo: FeedRepo {
  private let db: Firestore?

  init(db: Firestore? = nil) {
    self.db = db
  }

  func fetchFeedPage(limit: Int, after cursor: FeedCursor?) async throws -> FeedPage {
    guard FirebaseApp.app() != nil else { throw FeedRepoError.firebaseNotConfigured }

    let db = self.db ?? Firestore.firestore()
    let pageSize = max(1, min(30, limit))

    var query = db.collection("posts")
      .order(by: "createdAt", descending: true)
      .limit(to: pageSize + 1)

    if let cursor {
      query = query.start(afterDocument: cursor.lastDocument)
    }

    do {
      let snapshot = try await getDocuments(query)
      return buildPage(snapshot: snapshot, pageSize: pageSize)
    } catch {
      // Only first page tries cache fallback. Paginated requests should fail fast.
      guard cursor == nil else { throw error }
      let cacheSnapshot = try await getDocuments(query, source: .cache)
      return buildPage(snapshot: cacheSnapshot, pageSize: pageSize)
    }
  }

  private func buildPage(snapshot: QuerySnapshot, pageSize: Int) -> FeedPage {
    let docs = snapshot.documents
    let pageDocs = Array(docs.prefix(pageSize))
    let hasMore = docs.count > pageSize

    let items = pageDocs.map(Self.feedItem(from:))

    let nextCursor: FeedCursor?
    if hasMore, let lastVisible = pageDocs.last {
      nextCursor = FeedCursor(lastDocument: lastVisible)
    } else {
      nextCursor = nil
    }

    return FeedPage(
      items: items,
      nextCursor: nextCursor,
      hasMore: hasMore,
      isFromCache: snapshot.metadata.isFromCache
    )
  }

  /// A post document as a feed item. Also used for a user's posts on their profile.
  static func feedItem(from doc: QueryDocumentSnapshot) -> FeedItem {
    let data = doc.data()

    func nonEmpty(_ value: Any?) -> String? {
      guard let string = (value as? String)?.trimmingCharacters(in: .whitespacesAndNewlines), !string.isEmpty else {
        return nil
      }
      return string
    }

    func int(_ value: Any?) -> Int? {
      if let intValue = value as? Int { return intValue }
      if let number = value as? NSNumber { return number.intValue }
      if let string = value as? String, let parsed = Int(string) { return parsed }
      return nil
    }

    let authorSnapshot = data["authorSnapshot"] as? [String: Any]
    let authorName = nonEmpty(authorSnapshot?["displayName"])
      ?? nonEmpty(data["authorName"])
      ?? nonEmpty(data["authorId"])
      ?? "Usuario"
    let text = (data["text"] as? String).flatMap { $0.isEmpty ? nil : $0 }
      ?? (data["content"] as? String)
      ?? ""

    return FeedItem(
      id: doc.documentID,
      authorID: nonEmpty(data["authorId"]) ?? nonEmpty(data["authorID"]),
      authorName: authorName,
      text: text,
      createdAt: (data["createdAt"] as? Timestamp)?.dateValue(),
      likeCount: max(0, int(data["likeCount"]) ?? int(data["likesCount"]) ?? 0),
      commentCount: max(0, int(data["commentCount"]) ?? int(data["commentsCount"]) ?? 0)
    )
  }

  private func getDocuments(_ query: Query, source: FirestoreSource = .default) async throws -> QuerySnapshot {
    try await withCheckedThrowingContinuation { continuation in
      query.getDocuments(source: source) { snapshot, error in
        if let error = error {
          continuation.resume(throwing: error)
          return
        }
        guard let snapshot = snapshot else {
          continuation.resume(throwing: FeedRepoError.missingSnapshot)
          return
        }
        continuation.resume(returning: snapshot)
      }
    }
  }
}

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
      return "Firebase not configured."
    case .missingSnapshot:
      return "Failed to load feed."
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

    let items = pageDocs.map { doc in
      let data = doc.data()

      let authorName: String = {
        if
          let authorSnapshot = data["authorSnapshot"] as? [String: Any],
          let displayName = authorSnapshot["displayName"] as? String,
          !displayName.isEmpty
        {
          return displayName
        }

        if let authorName = data["authorName"] as? String, !authorName.isEmpty { return authorName }
        if let authorId = data["authorId"] as? String, !authorId.isEmpty { return authorId }
        return "Usuario"
      }()

      let text: String = {
        if let text = data["text"] as? String, !text.isEmpty { return text }
        if let content = data["content"] as? String, !content.isEmpty { return content }
        return ""
      }()

      let createdAt = (data["createdAt"] as? Timestamp)?.dateValue()
      let authorID = nonEmptyString(data["authorId"]) ?? nonEmptyString(data["authorID"])

      let likeCount = intValue(data["likeCount"]) ?? intValue(data["likesCount"]) ?? 0
      let commentCount = intValue(data["commentCount"]) ?? intValue(data["commentsCount"]) ?? 0

      return FeedItem(
        id: doc.documentID,
        authorID: authorID,
        authorName: authorName,
        text: text,
        createdAt: createdAt,
        likeCount: max(0, likeCount),
        commentCount: max(0, commentCount)
      )
    }

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

  private func intValue(_ value: Any?) -> Int? {
    if let intValue = value as? Int { return intValue }
    if let number = value as? NSNumber { return number.intValue }
    if let string = value as? String, let parsed = Int(string) { return parsed }
    return nil
  }

  private func nonEmptyString(_ value: Any?) -> String? {
    guard let stringValue = value as? String else { return nil }
    let trimmed = stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
    return trimmed.isEmpty ? nil : trimmed
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

import FirebaseCore
import FirebaseFirestore
import Foundation

struct FeedItem: Identifiable, Hashable {
  let id: String
  let authorID: String?
  let authorName: String
  let text: String
  let createdAt: Date?
  let primaryMediaURL: URL?
  let primaryMediaType: String?
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
    guard FirebaseBootstrap.isConfigured else { throw FeedRepoError.firebaseNotConfigured }

    let db = self.db ?? Firestore.firestore()
    let pageSize = max(1, min(30, limit))

    var query = db.collection("posts")
      .order(by: "createdAt", descending: true)
      .limit(to: pageSize + 1)

    if let cursor {
      query = query.start(afterDocument: cursor.lastDocument)
    }

    do {
      let snapshot = try await FirestoreAsyncBridge.getDocuments(query)
      return buildPage(snapshot: snapshot, pageSize: pageSize)
    } catch {
      // Only first page tries cache fallback. Paginated requests should fail fast.
      guard cursor == nil else { throw error }
      let cacheSnapshot = try await FirestoreAsyncBridge.getDocuments(query, source: .cache)
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
          !displayName.isEmpty {
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

      let createdAt = FirestoreHelpers.dateValue(data["createdAt"]) ?? FirestoreHelpers.dateValue(data["updatedAt"])
      let authorID = FirestoreHelpers.nonEmptyString(data["authorId"]) ?? FirestoreHelpers.nonEmptyString(data["authorID"])

      let likeCount = intValue(data["likeCount"]) ?? intValue(data["likesCount"]) ?? 0
      let commentCount = intValue(data["commentCount"]) ?? intValue(data["commentsCount"]) ?? 0
      let mediaSelection = resolvePrimaryMedia(from: data["media"])

      return FeedItem(
        id: doc.documentID,
        authorID: authorID,
        authorName: authorName,
        text: text,
        createdAt: createdAt,
        primaryMediaURL: mediaSelection.url,
        primaryMediaType: mediaSelection.type,
        likeCount: max(0, likeCount),
        commentCount: max(0, commentCount)
      )
    }

    let sortedItems = items.sorted(by: isNewerItem)

    let nextCursor: FeedCursor?
    if hasMore, let lastVisible = pageDocs.last {
      nextCursor = FeedCursor(lastDocument: lastVisible)
    } else {
      nextCursor = nil
    }

    return FeedPage(
      items: sortedItems,
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

  private func isNewerItem(_ lhs: FeedItem, _ rhs: FeedItem) -> Bool {
    switch (lhs.createdAt, rhs.createdAt) {
    case let (left?, right?):
      if left != right { return left > right }
      return lhs.id > rhs.id
    case (_?, nil):
      return true
    case (nil, _?):
      return false
    default:
      return lhs.id > rhs.id
    }
  }

  private func resolvePrimaryMedia(from rawMedia: Any?) -> (url: URL?, type: String?) {
    guard let mediaItems = rawMedia as? [[String: Any]], !mediaItems.isEmpty else {
      return (nil, nil)
    }

    func parsedEntry(_ item: [String: Any]) -> (url: URL?, type: String?) {
      let urlString = FirestoreHelpers.nonEmptyString(item["url"])
      let url = urlString.flatMap(URL.init(string:))
      let type = FirestoreHelpers.nonEmptyString(item["type"])?.lowercased()
      return (url, type)
    }

    if let preferredImage = mediaItems.first(where: {
      let parsed = parsedEntry($0)
      return parsed.url != nil && parsed.type == "image"
    }) {
      return parsedEntry(preferredImage)
    }

    if let firstValid = mediaItems.first(where: { parsedEntry($0).url != nil }) {
      return parsedEntry(firstValid)
    }

    return (nil, nil)
  }

}

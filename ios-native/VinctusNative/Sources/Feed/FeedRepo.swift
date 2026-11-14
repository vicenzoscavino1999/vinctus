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
  /// First photo of the post, if any.
  var imageURL: String? = nil
  /// The post has a video; `videoThumbnailURL` is set for YouTube videos.
  var hasVideo = false
  var videoThumbnailURL: String? = nil
  /// Name of the first attached file, when the post only has files.
  var fileName: String? = nil
  var title: String? = nil
  var media: [PostMediaItem] = []

  /// What the posts grid shows: the photo, or else the video's thumbnail.
  var previewImageURL: String? { imageURL ?? videoThumbnailURL }

  /// Reads the `media` array of a post (`PostMedia` in `src/shared/lib/firestore/posts.ts`).
  mutating func applyMedia(_ value: Any?) {
    guard let items = value as? [[String: Any]] else { return }
    media = items.compactMap(PostMediaItem.init(fields:))
    for item in items {
      guard let url = FirestoreValue.string(item["url"]) else { continue }
      switch item["type"] as? String {
      case "image":
        if imageURL == nil { imageURL = url }
      case "video":
        hasVideo = true
        if videoThumbnailURL == nil { videoThumbnailURL = YouTubeLink.thumbnailURL(from: url) }
      case "file":
        if fileName == nil { fileName = FirestoreValue.string(item["fileName"]) ?? url }
      default:
        continue
      }
    }
  }
}

struct FeedCursor {
  let token: String
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
  func fetchFeedPage(limit: Int, after cursor: FeedCursor?) async throws -> FeedPage {
    let result = try await PostReadClient.read(view: "feed", limit: max(1, min(30, limit)), cursor: cursor?.token)
    return FeedPage(
      items: result.items.map { Self.feedItem(id: $0.id, data: $0.fields) },
      nextCursor: result.cursor.map { FeedCursor(token: $0) },
      hasMore: result.hasMore,
      isFromCache: false
    )
  }

  /// A post document as a feed item. Also used for a user's posts on their profile.
  static func isPublished(_ doc: DocumentSnapshot) -> Bool {
    let status = doc.data()?["status"] as? String
    return doc.exists && (status == nil || status == "ready")
  }

  static func feedItem(from doc: DocumentSnapshot) -> FeedItem {
    feedItem(id: doc.documentID, data: doc.data() ?? [:])
  }

  static func feedItem(id: String, data: [String: Any]) -> FeedItem {
    let authorSnapshot = data["authorSnapshot"] as? [String: Any]
    let authorName = FirestoreValue.string(authorSnapshot?["displayName"])
      ?? FirestoreValue.string(data["authorName"])
      ?? FirestoreValue.string(data["authorId"])
      ?? "Usuario"
    let text = (data["text"] as? String).flatMap { $0.isEmpty ? nil : $0 }
      ?? (data["content"] as? String)
      ?? ""

    var item = FeedItem(
      id: id,
      authorID: FirestoreValue.string(data["authorId"]) ?? FirestoreValue.string(data["authorID"]),
      authorName: authorName,
      text: text,
      createdAt: (data["createdAt"] as? Timestamp)?.dateValue(),
      likeCount: max(0, FirestoreValue.int(data["likeCount"]) ?? FirestoreValue.int(data["likesCount"]) ?? 0),
      commentCount: max(0, FirestoreValue.int(data["commentCount"]) ?? FirestoreValue.int(data["commentsCount"]) ?? 0)
    )
    item.applyMedia(data["media"])
    item.title = FirestoreValue.string(data["title"])
    return item
  }
}

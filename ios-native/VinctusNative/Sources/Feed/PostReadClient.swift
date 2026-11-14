import FirebaseAuth
import FirebaseCore
import FirebaseFirestore
import FirebaseFunctions
import Foundation

enum PostReadError: LocalizedError {
  case invalidResponse
  case sessionChanged

  var errorDescription: String? {
    switch self {
    case .invalidResponse: return "No se pudo cargar la publicación. Reintenta."
    case .sessionChanged: return "La sesión cambió. Actualiza la lista."
    }
  }
}

struct PostReadRecord {
  let id: String
  let fields: [String: Any]
}

struct PostReadPage {
  let items: [PostReadRecord]
  let cursor: String?
  let hasMore: Bool
  let weeklyPosts: Int
}

enum PostReadClient {
  static func read(view: String, id: String? = nil, ids: [String]? = nil, limit: Int = 12, cursor: String? = nil) async throws -> PostReadPage {
    guard FirebaseApp.app() != nil else { throw FeedRepoError.firebaseNotConfigured }
    guard let user = Auth.auth().currentUser, !user.isAnonymous else { throw EngagementRepoError.userNotAuthenticated }
    let uid = user.uid
    var request: [String: Any] = ["view": view, "limit": max(1, min(50, limit))]
    if let id { request["id"] = id }
    if let ids { request["ids"] = ids }
    if let cursor { request["cursor"] = cursor }
    let callable = Functions.functions().httpsCallable("readPosts")
    callable.timeoutInterval = 20
    let result = try await callable.call(request)
    guard Auth.auth().currentUser?.uid == uid else { throw PostReadError.sessionChanged }
    return try decode(result.data)
  }

  static func decode(_ value: Any) throws -> PostReadPage {
    guard let data = value as? [String: Any], let rows = data["items"] as? [[String: Any]],
      let hasMore = data["hasMore"] as? Bool else { throw PostReadError.invalidResponse }
    let cursor = data["cursor"] as? String
    guard (data["cursor"] is NSNull || cursor != nil),
      cursor == nil || cursor!.range(of: "^[a-f0-9]{32}$", options: .regularExpression) != nil,
      hasMore == (cursor != nil) else { throw PostReadError.invalidResponse }
    let items = try rows.map { original -> PostReadRecord in
      guard let id = original["id"] as? String, !id.isEmpty else { throw PostReadError.invalidResponse }
      var row = original
      for key in ["createdAt", "updatedAt"] {
        if let wire = original[key] as? [String: Any], let seconds = wire["seconds"] as? NSNumber,
          let nanos = wire["nanoseconds"] as? NSNumber, nanos.int64Value >= 0, nanos.int64Value < 1_000_000_000 {
          row[key] = Timestamp(seconds: seconds.int64Value, nanoseconds: nanos.int32Value)
        }
      }
      return PostReadRecord(id: id, fields: row)
    }
    return PostReadPage(items: items, cursor: cursor, hasMore: hasMore, weeklyPosts: FirestoreValue.int(data["weeklyPosts"]) ?? 0)
  }

  static func mediaEndpoint(path: String) throws -> URL {
    let parts = path.split(separator: "/", omittingEmptySubsequences: false)
    guard parts.count == 5, parts[0] == "posts", !parts[1].isEmpty, !parts[2].isEmpty, !parts[4].isEmpty,
      ["images", "videos", "files"].contains(String(parts[3])), path.count <= 300,
      let project = FirebaseApp.app()?.options.projectID else { throw PostReadError.invalidResponse }
    let settings = Firestore.firestore().settings
    let base = settings.isSSLEnabled
      ? "https://us-central1-\(project).cloudfunctions.net"
      : "http://\(settings.host.replacingOccurrences(of: ":8080", with: ":5001"))/\(project)/us-central1"
    guard var url = URLComponents(string: base + "/readPostMedia") else { throw PostReadError.invalidResponse }
    url.queryItems = [URLQueryItem(name: "postId", value: String(parts[2])), URLQueryItem(name: "path", value: path)]
    guard let endpoint = url.url else { throw PostReadError.invalidResponse }
    return endpoint
  }
}

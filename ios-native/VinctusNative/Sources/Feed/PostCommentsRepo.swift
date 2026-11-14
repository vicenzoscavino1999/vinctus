import FirebaseAuth
import FirebaseCore
import FirebaseFirestore
import Foundation

struct PostComment: Identifiable, Hashable {
  let id: String
  let authorID: String?
  let authorName: String
  let text: String
  let createdAt: Date?
}

struct PostCommentsCursor {
  let token: String
}

struct PostCommentsPage {
  let items: [PostComment]
  let isFromCache: Bool
  var nextCursor: PostCommentsCursor? = nil
  var hasMore = false
}

protocol PostCommentsRepo {
  func fetchComments(postID: String, limit: Int, after cursor: PostCommentsCursor?) async throws -> PostCommentsPage
  func addComment(postID: String, text: String, commentID: String) async throws
}

extension PostCommentsRepo {
  func fetchComments(postID: String, limit: Int) async throws -> PostCommentsPage {
    try await fetchComments(postID: postID, limit: limit, after: nil)
  }

  func addComment(postID: String, text: String) async throws {
    try await addComment(postID: postID, text: text, commentID: UUID().uuidString)
  }
}

enum PostCommentsRepoError: LocalizedError {
  case firebaseNotConfigured
  case userNotAuthenticated
  case invalidPostID
  case emptyComment
  case commentTooLong(limit: Int)
  case missingSnapshot
  case invalidCommentID
  case draftMismatchForRetry

  var errorDescription: String? {
    switch self {
    case .firebaseNotConfigured:
      return "Firebase no está configurado."
    case .userNotAuthenticated:
      return "Debes iniciar sesión para comentar."
    case .invalidPostID:
      return "No se pudo resolver el post."
    case .emptyComment:
      return "Escribe un comentario antes de enviar."
    case .commentTooLong(let limit):
      return "El comentario supera el límite de \(limit) caracteres."
    case .missingSnapshot:
      return "No se pudo cargar comentarios."
    case .invalidCommentID:
      return "No se pudo identificar el comentario."
    case .draftMismatchForRetry:
      return "El comentario pendiente no coincide con este borrador."
    }
  }
}

final class FirebasePostCommentsRepo: PostCommentsRepo {
  private let commentLimit = Limits.Comments.textMaxLength
  private let db: Firestore?
  private let auth: Auth?

  init(db: Firestore? = nil, auth: Auth? = nil) {
    self.db = db
    self.auth = auth
  }

  func fetchComments(postID: String, limit: Int, after cursor: PostCommentsCursor?) async throws -> PostCommentsPage {
    guard FirebaseApp.app() != nil else { throw PostCommentsRepoError.firebaseNotConfigured }

    let normalizedPostID = postID.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !normalizedPostID.isEmpty else { throw PostCommentsRepoError.invalidPostID }

    let result = try await PostReadClient.read(view: "comments", id: normalizedPostID, limit: max(1, min(50, limit)), cursor: cursor?.token)
    let items = result.items.map { row -> PostComment in
      let data = row.fields
      let snapshot = data["authorSnapshot"] as? [String: Any]
      return PostComment(
        id: row.id, authorID: FirestoreValue.string(data["authorId"]),
        authorName: FirestoreValue.string(snapshot?["displayName"]) ?? "Usuario",
        text: data["text"] as? String ?? "", createdAt: FirestoreValue.date(data["createdAt"])
      )
    }
    return PostCommentsPage(items: items, isFromCache: false,
      nextCursor: result.cursor.map { PostCommentsCursor(token: $0) }, hasMore: result.hasMore)
  }

  func addComment(postID: String, text: String, commentID: String) async throws {
    guard FirebaseApp.app() != nil else { throw PostCommentsRepoError.firebaseNotConfigured }

    let normalizedPostID = postID.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !normalizedPostID.isEmpty else { throw PostCommentsRepoError.invalidPostID }
    guard !commentID.isEmpty, !commentID.contains("/") else { throw PostCommentsRepoError.invalidCommentID }

    let normalizedText = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !normalizedText.isEmpty else { throw PostCommentsRepoError.emptyComment }
    guard normalizedText.count <= commentLimit else {
      throw PostCommentsRepoError.commentTooLong(limit: commentLimit)
    }

    let auth = self.auth ?? Auth.auth()
    guard let currentUser = auth.currentUser else { throw PostCommentsRepoError.userNotAuthenticated }

    let db = self.db ?? Firestore.firestore()
    let authorSnapshot = try await resolveAuthorSnapshot(uid: currentUser.uid, fallbackUser: currentUser, db: db)
    let commentRef = db.collection(FirestoreCollections.posts)
      .document(normalizedPostID)
      .collection(FirestoreSubcollections.comments)
      .document(commentID)

    let authorSnapshotPayload: [String: Any] = [
      "displayName": authorSnapshot.displayName,
      "photoURL": authorSnapshot.photoURL ?? NSNull(),
    ]

    let payload: [String: Any] = [
      "postId": normalizedPostID,
      "authorId": currentUser.uid,
      "authorSnapshot": authorSnapshotPayload,
      "text": normalizedText,
      "createdAt": FieldValue.serverTimestamp(),
    ]

    let uid = currentUser.uid
    _ = try await db.runTransaction { transaction, errorPointer in
      do {
        let existing = try transaction.getDocument(commentRef)
        if let data = existing.data() {
          guard data["authorId"] as? String == uid,
            data["postId"] as? String == normalizedPostID,
            data["text"] as? String == normalizedText
          else { throw PostCommentsRepoError.draftMismatchForRetry }
        } else {
          transaction.setData(payload, forDocument: commentRef)
        }
      } catch { errorPointer?.pointee = error as NSError }
      return nil
    }
  }

  private func resolveAuthorSnapshot(
    uid: String,
    fallbackUser: User,
    db: Firestore
  ) async throws -> (displayName: String, photoURL: String?) {
    let publicRef = db.collection(FirestoreCollections.usersPublic).document(uid)
    let snapshot = try await publicRef.getDocument()
    let data = snapshot.data() ?? [:]

    let displayName = FirestoreValue.string(data["displayName"])
      ?? FirestoreValue.string(fallbackUser.displayName)
      ?? fallbackDisplayName(for: fallbackUser)
      ?? "Usuario"
    let photoURL = FirestoreValue.string(data["photoURL"]) ?? fallbackUser.photoURL?.absoluteString
    return (displayName, photoURL)
  }

  private func fallbackDisplayName(for user: User) -> String? {
    if let email = user.email {
      let localPart = email.split(separator: "@").first.map(String.init)
      if let localPart {
        let trimmed = localPart.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmed.isEmpty { return trimmed }
      }
    }
    return nil
  }

}

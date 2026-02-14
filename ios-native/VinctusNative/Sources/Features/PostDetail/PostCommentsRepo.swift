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

struct PostCommentsPage {
  let items: [PostComment]
  let isFromCache: Bool
}

protocol PostCommentsRepo {
  func fetchComments(postID: String, limit: Int) async throws -> PostCommentsPage
  func addComment(postID: String, text: String) async throws
}

enum PostCommentsRepoError: LocalizedError {
  case firebaseNotConfigured
  case userNotAuthenticated
  case invalidPostID
  case emptyComment
  case commentTooLong(limit: Int)
  case missingSnapshot

  var errorDescription: String? {
    switch self {
    case .firebaseNotConfigured:
      return "Firebase no esta configurado."
    case .userNotAuthenticated:
      return "Debes iniciar sesion para comentar."
    case .invalidPostID:
      return "No se pudo resolver el post."
    case .emptyComment:
      return "Escribe un comentario antes de enviar."
    case .commentTooLong(let limit):
      return "El comentario supera el limite de \(limit) caracteres."
    case .missingSnapshot:
      return "No se pudo cargar comentarios."
    }
  }
}

final class FirebasePostCommentsRepo: PostCommentsRepo {
  private let commentLimit = 1000
  private let db: Firestore?
  private let auth: Auth?

  init(db: Firestore? = nil, auth: Auth? = nil) {
    self.db = db
    self.auth = auth
  }

  func fetchComments(postID: String, limit: Int) async throws -> PostCommentsPage {
    guard FirebaseBootstrap.isConfigured else { throw PostCommentsRepoError.firebaseNotConfigured }

    let normalizedPostID = postID.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !normalizedPostID.isEmpty else { throw PostCommentsRepoError.invalidPostID }

    let db = self.db ?? Firestore.firestore()
    let pageSize = max(1, min(120, limit))

    let query = db.collection("posts")
      .document(normalizedPostID)
      .collection("comments")
      .order(by: "createdAt", descending: false)
      .limit(to: pageSize)

    let (snapshot, isFromCache) = try await FirestoreAsyncBridge.getDocumentsWithFallback(query)
    let items = snapshot.documents.map { doc in
      let data = doc.data()
      let authorSnapshot = data["authorSnapshot"] as? [String: Any]
      let authorName = FirestoreHelpers.nonEmptyString(authorSnapshot?["displayName"])
        ?? FirestoreHelpers.nonEmptyString(data["authorName"])
        ?? FirestoreHelpers.nonEmptyString(data["authorId"])
        ?? "Usuario"
      let text = FirestoreHelpers.nonEmptyString(data["text"]) ?? ""

      return PostComment(
        id: doc.documentID,
        authorID: FirestoreHelpers.nonEmptyString(data["authorId"]),
        authorName: authorName,
        text: text,
        createdAt: FirestoreHelpers.dateValue(data["createdAt"])
      )
    }

    return PostCommentsPage(items: items, isFromCache: isFromCache || snapshot.metadata.isFromCache)
  }

  func addComment(postID: String, text: String) async throws {
    guard FirebaseBootstrap.isConfigured else { throw PostCommentsRepoError.firebaseNotConfigured }

    let normalizedPostID = postID.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !normalizedPostID.isEmpty else { throw PostCommentsRepoError.invalidPostID }

    let normalizedText = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !normalizedText.isEmpty else { throw PostCommentsRepoError.emptyComment }
    guard normalizedText.count <= commentLimit else {
      throw PostCommentsRepoError.commentTooLong(limit: commentLimit)
    }

    let auth = self.auth ?? Auth.auth()
    guard let currentUser = auth.currentUser else { throw PostCommentsRepoError.userNotAuthenticated }

    let db = self.db ?? Firestore.firestore()
    let postRef = db.collection("posts").document(normalizedPostID)
    let authorSnapshot = try await resolveAuthorSnapshot(uid: currentUser.uid, fallbackUser: currentUser, db: db)
    let commentRef = db.collection("posts")
      .document(normalizedPostID)
      .collection("comments")
      .document()

    let authorSnapshotPayload: [String: Any] = [
      "displayName": authorSnapshot.displayName,
      "photoURL": authorSnapshot.photoURL ?? NSNull()
    ]

    let payload: [String: Any] = [
      "postId": normalizedPostID,
      "authorId": currentUser.uid,
      "authorSnapshot": authorSnapshotPayload,
      "text": normalizedText,
      "createdAt": FieldValue.serverTimestamp()
    ]

    try await commitComment(commentRef: commentRef, postRef: postRef, payload: payload, db: db)
  }

  private func resolveAuthorSnapshot(
    uid: String,
    fallbackUser: User,
    db: Firestore
  ) async throws -> (displayName: String, photoURL: String?) {
    let publicRef = db.collection("users_public").document(uid)
    let snapshot = try await FirestoreAsyncBridge.getDocument(publicRef)
    let data = snapshot.data() ?? [:]

    let displayName = FirestoreHelpers.nonEmptyString(data["displayName"])
      ?? FirestoreHelpers.nonEmptyString(fallbackUser.displayName)
      ?? fallbackDisplayName(for: fallbackUser)
      ?? "Usuario"
    let photoURL = FirestoreHelpers.nonEmptyString(data["photoURL"]) ?? fallbackUser.photoURL?.absoluteString
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

  private func commitComment(
    commentRef: DocumentReference,
    postRef: DocumentReference,
    payload: [String: Any],
    db: Firestore
  ) async throws {
    let batch = db.batch()
    batch.setData(payload, forDocument: commentRef)
    batch.setData(
      [
        "commentCount": FieldValue.increment(Int64(1)),
        "updatedAt": FieldValue.serverTimestamp()
      ],
      forDocument: postRef,
      merge: true
    )

    try await FirestoreAsyncBridge.commit(batch)
  }

}

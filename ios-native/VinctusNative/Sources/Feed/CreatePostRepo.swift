import FirebaseAuth
import FirebaseCore
import FirebaseFirestore
import Foundation

private struct CreatePostAuthorSnapshot {
  let displayName: String
  let photoURL: String?
}

protocol CreatePostRepo {
  func makePostID() throws -> String
  /// `groupID` publishes the post inside that group (the web's `groupId`).
  func publishTextPost(text: String, postID: String, groupID: String?) async throws
}

enum CreatePostRepoError: LocalizedError {
  case firebaseNotConfigured
  case userNotAuthenticated
  case invalidPostID
  case emptyText
  case textTooLong(limit: Int)
  case postOwnedByAnotherUser
  case draftMismatchForRetry
  case missingSnapshot

  var errorDescription: String? {
    switch self {
    case .firebaseNotConfigured:
      return "Firebase no está configurado."
    case .userNotAuthenticated:
      return "Debes iniciar sesión para publicar."
    case .invalidPostID:
      return "No se pudo generar un identificador válido para el post."
    case .emptyText:
      return "Escribe algo antes de publicar."
    case .textTooLong(let limit):
      return "El texto supera el límite de \(limit) caracteres."
    case .postOwnedByAnotherUser:
      return "No puedes reutilizar un post que pertenece a otro usuario."
    case .draftMismatchForRetry:
      return "El borrador cambió. Intenta publicar de nuevo."
    case .missingSnapshot:
      return "No se pudo leer el estado del post."
    }
  }
}

final class FirebaseCreatePostRepo: CreatePostRepo {
  private let textLimit = 5000
  private let db: Firestore?
  private let auth: Auth?

  init(db: Firestore? = nil, auth: Auth? = nil) {
    self.db = db
    self.auth = auth
  }

  func makePostID() throws -> String {
    guard FirebaseApp.app() != nil else { throw CreatePostRepoError.firebaseNotConfigured }
    let db = self.db ?? Firestore.firestore()
    let postID = db.collection("posts").document().documentID.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !postID.isEmpty else { throw CreatePostRepoError.invalidPostID }
    return postID
  }

  func publishTextPost(text: String, postID: String, groupID: String?) async throws {
    guard FirebaseApp.app() != nil else { throw CreatePostRepoError.firebaseNotConfigured }

    let normalizedPostID = postID.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !normalizedPostID.isEmpty else { throw CreatePostRepoError.invalidPostID }

    let normalizedText = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !normalizedText.isEmpty else { throw CreatePostRepoError.emptyText }
    guard normalizedText.count <= textLimit else { throw CreatePostRepoError.textTooLong(limit: textLimit) }

    let auth = self.auth ?? Auth.auth()
    guard let currentUser = auth.currentUser else { throw CreatePostRepoError.userNotAuthenticated }

    let db = self.db ?? Firestore.firestore()
    let postRef = db.collection("posts").document(normalizedPostID)
    let authorSnapshot = try await resolveAuthorSnapshot(uid: currentUser.uid, fallbackUser: currentUser, db: db)

    let existingDoc = try await postRef.getDocument()
    if let existingData = existingDoc.data() {
      let ownerID = FirestoreValue.string(existingData["authorId"])
      guard ownerID == currentUser.uid else { throw CreatePostRepoError.postOwnedByAnotherUser }

      if let existingText = FirestoreValue.string(existingData["text"]), existingText != normalizedText {
        throw CreatePostRepoError.draftMismatchForRetry
      }

      if let existingStatus = FirestoreValue.string(existingData["status"]), existingStatus == "ready" {
        return
      }
    } else {
      let authorSnapshotPayload: [String: Any] = [
        "displayName": authorSnapshot.displayName,
        "photoURL": authorSnapshot.photoURL ?? NSNull(),
      ]

      let createPayload: [String: Any] = [
        "postId": normalizedPostID,
        "authorId": currentUser.uid,
        "authorSnapshot": authorSnapshotPayload,
        "title": NSNull(),
        "text": normalizedText,
        "content": normalizedText,
        "status": "uploading",
        "media": [],
        "groupId": groupID ?? NSNull(),
        "categoryId": NSNull(),
        "likeCount": 0,
        "commentCount": 0,
        "createdAt": FieldValue.serverTimestamp(),
        "updatedAt": NSNull(),
      ]
      try await postRef.setData(createPayload)
    }

    try await postRef.updateData([
      "status": "ready",
      "media": [],
      "updatedAt": FieldValue.serverTimestamp(),
    ])
  }

  private func resolveAuthorSnapshot(
    uid: String,
    fallbackUser: User,
    db: Firestore
  ) async throws -> CreatePostAuthorSnapshot {
    let publicRef = db.collection("users_public").document(uid)
    let publicDoc = try await publicRef.getDocument()
    let publicData = publicDoc.data() ?? [:]

    let displayName = FirestoreValue.string(publicData["displayName"])
      ?? FirestoreValue.string(fallbackUser.displayName)
      ?? fallbackDisplayName(for: fallbackUser)
      ?? "Usuario"
    let photoURL = FirestoreValue.string(publicData["photoURL"]) ?? fallbackUser.photoURL?.absoluteString

    return CreatePostAuthorSnapshot(displayName: displayName, photoURL: photoURL)
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

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
  func publishTextPost(text: String, postID: String) async throws
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
      return "Firebase no esta configurado."
    case .userNotAuthenticated:
      return "Debes iniciar sesion para publicar."
    case .invalidPostID:
      return "No se pudo generar un identificador valido para el post."
    case .emptyText:
      return "Escribe algo antes de publicar."
    case .textTooLong(let limit):
      return "El texto supera el limite de \(limit) caracteres."
    case .postOwnedByAnotherUser:
      return "No puedes reutilizar un post que pertenece a otro usuario."
    case .draftMismatchForRetry:
      return "El borrador cambio. Intenta publicar de nuevo."
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

  func publishTextPost(text: String, postID: String) async throws {
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

    let existingDoc = try await getDocument(postRef)
    if let existingData = existingDoc.data() {
      let ownerID = nonEmptyString(existingData["authorId"])
      guard ownerID == currentUser.uid else { throw CreatePostRepoError.postOwnedByAnotherUser }

      if let existingText = nonEmptyString(existingData["text"]), existingText != normalizedText {
        throw CreatePostRepoError.draftMismatchForRetry
      }

      if let existingStatus = nonEmptyString(existingData["status"]), existingStatus == "ready" {
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
        "groupId": NSNull(),
        "categoryId": NSNull(),
        "likeCount": 0,
        "commentCount": 0,
        "createdAt": FieldValue.serverTimestamp(),
        "updatedAt": NSNull(),
      ]
      try await setData(postRef, data: createPayload)
    }

    try await updateData(
      postRef,
      data: [
        "status": "ready",
        "media": [],
        "updatedAt": FieldValue.serverTimestamp(),
      ]
    )
  }

  private func resolveAuthorSnapshot(
    uid: String,
    fallbackUser: User,
    db: Firestore
  ) async throws -> CreatePostAuthorSnapshot {
    let publicRef = db.collection("users_public").document(uid)
    let publicDoc = try await getDocument(publicRef)
    let publicData = publicDoc.data() ?? [:]

    let displayName = nonEmptyString(publicData["displayName"])
      ?? nonEmptyString(fallbackUser.displayName)
      ?? fallbackDisplayName(for: fallbackUser)
      ?? "Usuario"
    let photoURL = nonEmptyString(publicData["photoURL"]) ?? fallbackUser.photoURL?.absoluteString

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

  private func getDocument(_ ref: DocumentReference) async throws -> DocumentSnapshot {
    try await withCheckedThrowingContinuation { continuation in
      ref.getDocument { snapshot, error in
        if let error {
          continuation.resume(throwing: error)
          return
        }
        guard let snapshot else {
          continuation.resume(throwing: CreatePostRepoError.missingSnapshot)
          return
        }
        continuation.resume(returning: snapshot)
      }
    }
  }

  private func setData(_ ref: DocumentReference, data: [String: Any]) async throws {
    try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
      ref.setData(data) { error in
        if let error {
          continuation.resume(throwing: error)
          return
        }
        continuation.resume(returning: ())
      }
    }
  }

  private func updateData(_ ref: DocumentReference, data: [String: Any]) async throws {
    try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
      ref.updateData(data) { error in
        if let error {
          continuation.resume(throwing: error)
          return
        }
        continuation.resume(returning: ())
      }
    }
  }

  private func nonEmptyString(_ value: Any?) -> String? {
    guard let stringValue = value as? String else { return nil }
    let trimmed = stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
    return trimmed.isEmpty ? nil : trimmed
  }
}

import FirebaseAuth
import FirebaseCore
import FirebaseFirestore
import FirebaseStorage
import Foundation

private struct CreatePostAuthorSnapshot {
  let displayName: String
  let photoURL: String?
}

enum CreatePostMediaKind: String {
  case image
  case video
  case file
}

struct CreatePostMediaUpload {
  let data: Data
  let kind: CreatePostMediaKind
  let contentType: String
  let fileName: String
  let width: Int?
  let height: Int?
}

private struct CreatePostMediaRecord {
  let url: String
  let path: String
  let type: String
  let contentType: String
  let fileName: String?
  let size: Int
  let width: Int?
  let height: Int?

  var firestorePayload: [String: Any] {
    var payload: [String: Any] = [
      "url": url,
      "path": path,
      "type": type,
      "contentType": contentType,
      "size": size
    ]
    if let fileName {
      payload["fileName"] = fileName
    }
    if let width {
      payload["width"] = width
    }
    if let height {
      payload["height"] = height
    }
    return payload
  }
}

protocol CreatePostRepo {
  func makePostID() throws -> String
  func publishTextPost(
    text: String,
    postID: String,
    media: [CreatePostMediaUpload],
    onProgress: ((Double) -> Void)?
  ) async throws
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
  case missingDownloadURL
  case mediaCountExceeded(limit: Int)
  case invalidMedia(index: Int)
  case mediaTooLarge(index: Int, limitMB: Int)

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
    case .missingDownloadURL:
      return "No se pudo obtener la URL del archivo subido."
    case .mediaCountExceeded(let limit):
      return "Solo puedes adjuntar hasta \(limit) archivos."
    case .invalidMedia(let index):
      return "El archivo \(index + 1) no es valido."
    case .mediaTooLarge(let index, let limitMB):
      return "El archivo \(index + 1) supera el limite de \(limitMB) MB."
    }
  }
}

final class FirebaseCreatePostRepo: CreatePostRepo {
  private let textLimit = 5000
  private let maxMediaItems = 10
  private let maxImageBytes = 10 * 1024 * 1024
  private let maxVideoBytes = 100 * 1024 * 1024
  private let maxFileBytes = 25 * 1024 * 1024

  private let db: Firestore?
  private let auth: Auth?
  private let storage: Storage?

  init(db: Firestore? = nil, auth: Auth? = nil, storage: Storage? = nil) {
    self.db = db
    self.auth = auth
    self.storage = storage
  }

  func makePostID() throws -> String {
    guard FirebaseBootstrap.isConfigured else { throw CreatePostRepoError.firebaseNotConfigured }
    let db = self.db ?? Firestore.firestore()
    let postID = db.collection("posts").document().documentID.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !postID.isEmpty else { throw CreatePostRepoError.invalidPostID }
    return postID
  }

  func publishTextPost(
    text: String,
    postID: String,
    media: [CreatePostMediaUpload],
    onProgress: ((Double) -> Void)?
  ) async throws {
    guard FirebaseBootstrap.isConfigured else { throw CreatePostRepoError.firebaseNotConfigured }

    let normalizedPostID = postID.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !normalizedPostID.isEmpty else { throw CreatePostRepoError.invalidPostID }

    let normalizedText = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !normalizedText.isEmpty else { throw CreatePostRepoError.emptyText }
    guard normalizedText.count <= textLimit else { throw CreatePostRepoError.textTooLong(limit: textLimit) }
    try CreatePostMediaRules.validate(
      media: media,
      maxMediaItems: maxMediaItems,
      maxImageBytes: maxImageBytes,
      maxVideoBytes: maxVideoBytes,
      maxFileBytes: maxFileBytes
    )

    let auth = self.auth ?? Auth.auth()
    guard let currentUser = auth.currentUser else { throw CreatePostRepoError.userNotAuthenticated }

    let db = self.db ?? Firestore.firestore()
    let postRef = db.collection("posts").document(normalizedPostID)
    let authorSnapshot = try await resolveAuthorSnapshot(uid: currentUser.uid, fallbackUser: currentUser, db: db)

    let existingDoc = try await FirestoreAsyncBridge.getDocument(postRef)
    if let existingData = existingDoc.data() {
      let ownerID = FirestoreHelpers.nonEmptyString(existingData["authorId"])
      guard ownerID == currentUser.uid else { throw CreatePostRepoError.postOwnedByAnotherUser }

      if let existingText = FirestoreHelpers.nonEmptyString(existingData["text"]), existingText != normalizedText {
        throw CreatePostRepoError.draftMismatchForRetry
      }

      if let existingStatus = FirestoreHelpers.nonEmptyString(existingData["status"]), existingStatus == "ready" {
        return
      }
    } else {
      let authorSnapshotPayload: [String: Any] = [
        "displayName": authorSnapshot.displayName,
        "photoURL": authorSnapshot.photoURL ?? NSNull()
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
        "updatedAt": NSNull()
      ]
      try await FirestoreAsyncBridge.setData(postRef, data: createPayload)
    }

    var uploadedMedia: [CreatePostMediaRecord] = []
    var uploadedPaths = Set<String>()
    do {
      if media.isEmpty {
        onProgress?(1)
      } else {
        for (index, item) in media.enumerated() {
          try Task.checkCancellation()
          let storagePath = CreatePostMediaRules.storagePath(
            for: item,
            authorID: currentUser.uid,
            postID: normalizedPostID
          )
          uploadedPaths.insert(storagePath)
          let record = try await uploadMediaItem(
            item,
            storagePath: storagePath,
            onProgress: { fraction in
              let safeFraction = min(max(fraction, 0), 1)
              let overall = (Double(index) + safeFraction) / Double(media.count)
              onProgress?(overall)
            }
          )
          uploadedMedia.append(record)
        }
        onProgress?(1)
      }

      try await FirestoreAsyncBridge.updateData(
        postRef,
        data: [
          "status": "ready",
          "media": uploadedMedia.map(\.firestorePayload),
          "updatedAt": FieldValue.serverTimestamp()
        ]
      )
    } catch {
      if !uploadedPaths.isEmpty {
        await deleteMediaFiles(paths: Array(uploadedPaths))
      }

      try? await FirestoreAsyncBridge.updateData(
        postRef,
        data: [
          "status": "failed",
          "media": [],
          "updatedAt": FieldValue.serverTimestamp()
        ]
      )
      throw error
    }
  }

  private func resolveAuthorSnapshot(
    uid: String,
    fallbackUser: User,
    db: Firestore
  ) async throws -> CreatePostAuthorSnapshot {
    let publicRef = db.collection("users_public").document(uid)
    let publicDoc = try await FirestoreAsyncBridge.getDocument(publicRef)
    let publicData = publicDoc.data() ?? [:]

    let displayName = FirestoreHelpers.nonEmptyString(publicData["displayName"])
      ?? FirestoreHelpers.nonEmptyString(fallbackUser.displayName)
      ?? fallbackDisplayName(for: fallbackUser)
      ?? "Usuario"
    let photoURL = FirestoreHelpers.nonEmptyString(publicData["photoURL"]) ?? fallbackUser.photoURL?.absoluteString

    return CreatePostAuthorSnapshot(displayName: displayName, photoURL: photoURL)
  }

  private func uploadMediaItem(
    _ item: CreatePostMediaUpload,
    storagePath: String,
    onProgress: @escaping (Double) -> Void
  ) async throws -> CreatePostMediaRecord {
    let storage = self.storage ?? Storage.storage()
    let storageRef = storage.reference(withPath: storagePath)

    let metadata = StorageMetadata()
    metadata.contentType = item.contentType

    final class UploadTaskBox {
      var task: StorageUploadTask?
    }
    let taskBox = UploadTaskBox()

    return try await withTaskCancellationHandler {
      try await withCheckedThrowingContinuation { continuation in
        let uploadTask = storageRef.putData(item.data, metadata: metadata) { _, error in
          if let error {
            continuation.resume(throwing: error)
            return
          }

          storageRef.downloadURL { url, error in
            if let error {
              continuation.resume(throwing: error)
              return
            }

            guard let url else {
              continuation.resume(throwing: CreatePostRepoError.missingDownloadURL)
              return
            }

            let fileName: String? = item.kind == .file ? item.fileName : nil
            let record = CreatePostMediaRecord(
              url: url.absoluteString,
              path: storagePath,
              type: item.kind.rawValue,
              contentType: item.contentType,
              fileName: fileName,
              size: item.data.count,
              width: item.width,
              height: item.height
            )
            continuation.resume(returning: record)
          }
        }

        taskBox.task = uploadTask
        _ = uploadTask.observe(.progress) { snapshot in
          let fraction = snapshot.progress?.fractionCompleted ?? 0
          onProgress(fraction)
        }
      }
    } onCancel: {
      taskBox.task?.cancel()
    }
  }

  private func deleteMediaFiles(paths: [String]) async {
    let storage = self.storage ?? Storage.storage()
    for path in paths {
      let ref = storage.reference(withPath: path)
      do {
        try await StorageAsyncBridge.deleteObject(ref)
      } catch {
        continue
      }
    }
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

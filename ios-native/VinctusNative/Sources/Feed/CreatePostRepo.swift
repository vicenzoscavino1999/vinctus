import FirebaseAuth
import FirebaseCore
import FirebaseStorage
import FirebaseFirestore
import Foundation

private struct CreatePostAuthorSnapshot {
  let displayName: String
  let photoURL: String?
}

protocol CreatePostRepo {
  func makePostID() throws -> String
  /// `groupID` publishes the post inside that group (the web's `groupId`).
  func publishPost(_ draft: NativePostDraft, postID: String, groupID: String?, onProgress: @escaping (Double) -> Void) async throws
}

extension CreatePostRepo {
  func publishTextPost(text: String, postID: String, groupID: String?) async throws {
    try await publishPost(NativePostDraft(text: text), postID: postID, groupID: groupID, onProgress: { _ in })
  }
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
  case titleTooLong

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
    case .titleTooLong:
      return "El título supera el límite de 120 caracteres."
    case .missingSnapshot:
      return "No se pudo leer el estado del post."
    }
  }
}

final class FirebaseCreatePostRepo: CreatePostRepo {
  private let db: Firestore?
  private let auth: Auth?

  init(db: Firestore? = nil, auth: Auth? = nil) {
    self.db = db
    self.auth = auth
  }

  func makePostID() throws -> String {
    guard FirebaseApp.app() != nil else { throw CreatePostRepoError.firebaseNotConfigured }
    let db = self.db ?? Firestore.firestore()
    let postID = db.collection(FirestoreCollections.posts).document().documentID
      .trimmingCharacters(in: .whitespacesAndNewlines)
    guard !postID.isEmpty else { throw CreatePostRepoError.invalidPostID }
    return postID
  }

  func publishPost(_ draft: NativePostDraft, postID: String, groupID: String?, onProgress: @escaping (Double) -> Void) async throws {
    guard FirebaseApp.app() != nil else { throw CreatePostRepoError.firebaseNotConfigured }
    guard !postID.isEmpty, !postID.contains("/") else { throw CreatePostRepoError.invalidPostID }
    try draft.validate()
    let auth = self.auth ?? Auth.auth()
    guard let currentUser = auth.currentUser else { throw CreatePostRepoError.userNotAuthenticated }
    let uid = currentUser.uid
    let db = self.db ?? Firestore.firestore()
    let post = db.collection(FirestoreCollections.posts).document(postID)
    let text = draft.text.trimmingCharacters(in: .whitespacesAndNewlines)
    let title = draft.normalizedTitle
    let author = try await resolveAuthorSnapshot(uid: uid, fallbackUser: currentUser, db: db)
    let authorFields: [String: Any] = ["displayName": author.displayName, "photoURL": author.photoURL ?? NSNull()]
    let expectedPaths = draft.files.map { PostFiles.path($0, userID: uid, postID: postID) }
      + (draft.youtubeVideoID.map { [StoragePaths.postVideo(userID: uid, postID: postID, filename: "youtube-\($0)")] } ?? [])
    guard expectedPaths.allSatisfy({ $0.count <= 300 }) else { throw PostMediaError.invalidFile }
    let alreadyReady = try await db.runTransaction { transaction, errorPointer in
      do {
        let existing = try transaction.getDocument(post)
        if let data = existing.data() {
          guard data["authorId"] as? String == uid else { throw CreatePostRepoError.postOwnedByAnotherUser }
          guard data["text"] as? String == text,
            FirestoreValue.string(data["title"]) == title,
            FirestoreValue.string(data["groupId"]) == groupID
          else { throw CreatePostRepoError.draftMismatchForRetry }
          if data["status"] as? String == "ready" {
            let paths = (data["media"] as? [[String: Any]] ?? []).compactMap { $0["path"] as? String }
            guard paths == expectedPaths else { throw CreatePostRepoError.draftMismatchForRetry }
            return true
          }
        } else {
          transaction.setData([
            "postId": postID, "authorId": uid,
            "authorSnapshot": authorFields,
            "title": title ?? NSNull(), "text": text, "content": text,
            "status": "uploading", "media": [], "groupId": groupID ?? NSNull(), "categoryId": NSNull(),
            "likeCount": 0, "commentCount": 0,
            "createdAt": FieldValue.serverTimestamp(), "updatedAt": NSNull(),
          ], forDocument: post)
        }
      } catch { errorPointer?.pointee = error as NSError }
      return false
    } as? Bool ?? false
    if alreadyReady { onProgress(1); return }

    let total = max(1, draft.files.reduce(0) { $0 + $1.size })
    var completed = 0
    var media: [PostMediaItem] = []
    for file in draft.files {
      let path = PostFiles.path(file, userID: uid, postID: postID)
      let target = Storage.storage().reference(withPath: path)
      do {
        let existing = try await target.getMetadata()
        guard existing.size == Int64(file.size), existing.contentType == file.contentType else { throw PostMediaError.invalidFile }
      } catch let error as NSError where error.domain == StorageErrorDomain && error.code == StorageErrorCode.objectNotFound.rawValue {
        let metadata = StorageMetadata()
        metadata.contentType = file.contentType
        metadata.cacheControl = "private,no-store,max-age=0"
        let previous = completed
        _ = try await target.putFileAsync(from: file.fileURL, metadata: metadata) { progress in
          onProgress(Double(previous + Int(progress?.completedUnitCount ?? 0)) / Double(total))
        }
      }
      let kind = PostFiles.kind(contentType: file.contentType) ?? "file"
      media.append(PostMediaItem(type: kind, url: "post-media:\(path)", path: path, contentType: file.contentType,
        fileName: kind == "file" ? file.fileName : nil, size: kind == "file" ? file.size : nil))
      completed += file.size
      onProgress(Double(completed) / Double(total))
    }
    if let id = draft.youtubeVideoID {
      media.append(PostMediaItem(type: "video", url: "https://www.youtube.com/embed/\(id)",
        path: StoragePaths.postVideo(userID: uid, postID: postID, filename: "youtube-\(id)"), contentType: "video/youtube"))
    }
    let fields = media.map(\.fields)
    _ = try await db.runTransaction { transaction, errorPointer in
      do {
        let existing = try transaction.getDocument(post)
        guard existing.data()?["authorId"] as? String == uid else { throw CreatePostRepoError.postOwnedByAnotherUser }
        if existing.data()?["status"] as? String != "ready" {
          transaction.updateData(["status": "ready", "media": fields, "updatedAt": FieldValue.serverTimestamp()], forDocument: post)
        }
      } catch { errorPointer?.pointee = error as NSError }
      return nil
    }
    onProgress(1)
  }

  private func resolveAuthorSnapshot(
    uid: String,
    fallbackUser: User,
    db: Firestore
  ) async throws -> CreatePostAuthorSnapshot {
    let publicRef = db.collection(FirestoreCollections.usersPublic).document(uid)
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

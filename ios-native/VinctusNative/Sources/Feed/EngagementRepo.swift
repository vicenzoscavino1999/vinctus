import FirebaseAuth
import FirebaseCore
import FirebaseFirestore
import Foundation

enum FollowStatus: Equatable {
  case none
  case following
  /// Follow request sent to a private account, waiting for approval.
  case requested
}

/// Likes and follows, written exactly like the web (`src/shared/lib/firestore/postEngagement.ts`
/// and `follows.ts`) so Cloud Functions keep the counters in sync.
protocol EngagementRepo {
  func isPostLiked(postID: String) async throws -> Bool
  func setPostLiked(_ liked: Bool, postID: String) async throws
  func isPostSaved(postID: String) async throws -> Bool
  func setPostSaved(_ saved: Bool, postID: String) async throws
  func followStatus(targetUID: String) async throws -> FollowStatus
  func follow(targetUID: String, isPrivate: Bool) async throws -> FollowStatus
  func unfollow(targetUID: String, status: FollowStatus) async throws
}

enum EngagementRepoError: LocalizedError {
  case firebaseNotConfigured
  case userNotAuthenticated
  case cannotFollowSelf
  case postUnavailable

  var errorDescription: String? {
    switch self {
    case .firebaseNotConfigured:
      return "Firebase no está configurado."
    case .userNotAuthenticated:
      return "Debes iniciar sesión."
    case .cannotFollowSelf:
      return "No puedes seguirte a ti mismo."
    case .postUnavailable:
      return "La publicación ya no está disponible."
    }
  }
}

final class FirebaseEngagementRepo: EngagementRepo {
  private func context() throws -> (Firestore, String) {
    guard FirebaseApp.app() != nil else { throw EngagementRepoError.firebaseNotConfigured }
    guard let uid = Auth.auth().currentUser?.uid else { throw EngagementRepoError.userNotAuthenticated }
    return (Firestore.firestore(), uid)
  }

  // MARK: Likes

  func isPostLiked(postID: String) async throws -> Bool {
    let (db, uid) = try context()
    return try await db.collection(FirestoreCollections.posts).document(postID)
      .collection(FirestoreSubcollections.likes).document(uid)
      .getDocument(source: .server).exists
  }

  func setPostLiked(_ liked: Bool, postID: String) async throws {
    let (db, uid) = try context()
    // Source of truth for the counter trigger, plus the user's own index.
    let likeRef = db.collection(FirestoreCollections.posts).document(postID)
      .collection(FirestoreSubcollections.likes).document(uid)
    let userLikeRef = db.collection(FirestoreCollections.users).document(uid)
      .collection(FirestoreSubcollections.likes).document(postID)
    let postRef = db.collection(FirestoreCollections.posts).document(postID)
    _ = try await db.runTransaction { tx, errorPointer in
      do {
        let like = try tx.getDocument(likeRef)
        let index = try tx.getDocument(userLikeRef)
        if liked {
          let post = try tx.getDocument(postRef)
          guard FirebaseFeedRepo.isPublished(post) else { throw EngagementRepoError.postUnavailable }
          if !like.exists {
            tx.setData(["uid": uid, "postId": postID, "createdAt": FieldValue.serverTimestamp()], forDocument: likeRef)
          }
          if !index.exists {
            tx.setData(["postId": postID, "createdAt": FieldValue.serverTimestamp()], forDocument: userLikeRef)
          }
        } else {
          if like.exists { tx.deleteDocument(likeRef) }
          if index.exists { tx.deleteDocument(userLikeRef) }
        }
      } catch { errorPointer?.pointee = error as NSError }
      return nil
    }
  }

  func isPostSaved(postID: String) async throws -> Bool {
    let (db, uid) = try context()
    return try await db.collection(FirestoreCollections.users).document(uid)
      .collection(FirestoreSubcollections.savedPosts).document(postID)
      .getDocument(source: .server).exists
  }

  func setPostSaved(_ saved: Bool, postID: String) async throws {
    let (db, uid) = try context()
    let ref = db.collection(FirestoreCollections.users).document(uid)
      .collection(FirestoreSubcollections.savedPosts).document(postID)
    let postRef = db.collection(FirestoreCollections.posts).document(postID)
    _ = try await db.runTransaction { tx, errorPointer in
      do {
        let existing = try tx.getDocument(ref)
        if saved {
          let post = try tx.getDocument(postRef)
          guard FirebaseFeedRepo.isPublished(post) else { throw EngagementRepoError.postUnavailable }
          if !existing.exists {
            tx.setData(["postId": postID, "createdAt": FieldValue.serverTimestamp()], forDocument: ref)
          }
        } else if existing.exists { tx.deleteDocument(ref) }
      } catch { errorPointer?.pointee = error as NSError }
      return nil
    }
  }

  // MARK: Follows

  func followStatus(targetUID: String) async throws -> FollowStatus {
    let (db, uid) = try context()
    let follower = try? await db.collection(FirestoreCollections.users).document(targetUID)
      .collection(FirestoreSubcollections.followers).document(uid).getDocument()
    if follower?.exists == true {
      return .following
    }
    let request = try? await db.collection(FirestoreCollections.followRequests)
      .document(Self.requestID(from: uid, to: targetUID)).getDocument()
    if request?.exists == true, request?.data()?["status"] as? String == "pending" {
      return .requested
    }
    return .none
  }

  func follow(targetUID: String, isPrivate: Bool) async throws -> FollowStatus {
    let (db, uid) = try context()
    guard targetUID != uid else { throw EngagementRepoError.cannotFollowSelf }

    if isPrivate {
      let ref = db.collection(FirestoreCollections.followRequests).document(Self.requestID(from: uid, to: targetUID))
      let existing = try? await ref.getDocument()
      if existing?.exists == true {
        try await ref.updateData(["status": "pending", "updatedAt": FieldValue.serverTimestamp()])
      } else {
        try await ref.setData([
          "fromUid": uid,
          "toUid": targetUID,
          "status": "pending",
          "createdAt": FieldValue.serverTimestamp(),
          "updatedAt": FieldValue.serverTimestamp(),
        ])
      }
      return .requested
    }

    let users = db.collection(FirestoreCollections.users)
    let batch = db.batch()
    batch.setData(
      ["uid": uid, "createdAt": FieldValue.serverTimestamp()],
      forDocument: users.document(targetUID).collection(FirestoreSubcollections.followers).document(uid)
    )
    batch.setData(
      ["uid": targetUID, "createdAt": FieldValue.serverTimestamp()],
      forDocument: users.document(uid).collection(FirestoreSubcollections.following).document(targetUID)
    )
    try await batch.commit()
    return .following
  }

  func unfollow(targetUID: String, status: FollowStatus) async throws {
    let (db, uid) = try context()
    switch status {
    case .requested:
      try await db.collection(FirestoreCollections.followRequests)
        .document(Self.requestID(from: uid, to: targetUID)).delete()
    case .following, .none:
      let users = db.collection(FirestoreCollections.users)
      let batch = db.batch()
      batch.deleteDocument(users.document(targetUID).collection(FirestoreSubcollections.followers).document(uid))
      batch.deleteDocument(users.document(uid).collection(FirestoreSubcollections.following).document(targetUID))
      try await batch.commit()
    }
  }

  static func requestID(from: String, to: String) -> String { "\(from)_\(to)" }
}

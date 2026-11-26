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
    // Returns the post's author when this call created the like, so they get notified once.
    let newLikeAuthor = try await db.runTransaction { tx, errorPointer -> Any? in
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
          return like.exists ? nil : FirestoreValue.string(post.data()?["authorId"])
        } else {
          if like.exists { tx.deleteDocument(likeRef) }
          if index.exists { tx.deleteDocument(userLikeRef) }
        }
      } catch { errorPointer?.pointee = error as NSError }
      return nil
    }
    // Like the web (`likePostWithSync`): the author is told, best effort.
    if liked, let authorID = newLikeAuthor as? String {
      await ActivityNotificationWriter.like(postID: postID, authorID: authorID, fromUID: uid, db: db)
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
    do {
      let follower = try await db.collection(FirestoreCollections.users).document(targetUID)
        .collection(FirestoreSubcollections.followers).document(uid)
        .getDocument(source: .server)
      if follower.exists {
        return .following
      }
    } catch where FirestoreValue.isPermissionDenied(error) {
      return .none
    }

    do {
      let request = try await db.collection(FirestoreCollections.followRequests)
        .document(Self.requestID(from: uid, to: targetUID))
        .getDocument(source: .server)
      if request.exists, request.data()?["status"] as? String == "pending" {
        return .requested
      }
    } catch where FirestoreValue.isPermissionDenied(error) {
      return .none
    }
    return .none
  }

  func follow(targetUID: String, isPrivate: Bool) async throws -> FollowStatus {
    let (db, uid) = try context()
    guard targetUID != uid else { throw EngagementRepoError.cannotFollowSelf }

    let resolvedIsPrivate = try await fetchServerIsPrivate(
      db: db,
      targetUID: targetUID,
      fallback: isPrivate
    )
    do {
      return try await executeFollow(db: db, uid: uid, targetUID: targetUID, isPrivate: resolvedIsPrivate)
    } catch where FirestoreValue.isPermissionDenied(error) {
      // Visibility may have changed concurrently right before the write; retry once with fresh visibility.
      let freshIsPrivate = try await fetchServerIsPrivate(
        db: db,
        targetUID: targetUID,
        fallback: resolvedIsPrivate
      )
      guard freshIsPrivate != resolvedIsPrivate else { throw error }
      return try await executeFollow(db: db, uid: uid, targetUID: targetUID, isPrivate: freshIsPrivate)
    }
  }

  func unfollow(targetUID: String, status: FollowStatus) async throws {
    let (db, uid) = try context()
    let requestRef = db.collection(FirestoreCollections.followRequests)
      .document(Self.requestID(from: uid, to: targetUID))

    if status == .requested {
      let requestSnap = try await requestRef.getDocument(source: .server)
      if requestSnap.exists, (requestSnap.data()?["status"] as? String) == "pending" {
        try await requestRef.delete()
        return
      }
      // If the request was accepted concurrently right before canceling, fall through and unfollow.
    }

    let users = db.collection(FirestoreCollections.users)
    let batch = db.batch()
    batch.deleteDocument(users.document(targetUID).collection(FirestoreSubcollections.followers).document(uid))
    batch.deleteDocument(users.document(uid).collection(FirestoreSubcollections.following).document(targetUID))
    try await batch.commit()

    // Clean up any accepted/declined follow request so future follow attempts create cleanly.
    if let requestSnap = try? await requestRef.getDocument(source: .server), requestSnap.exists {
      try? await requestRef.delete()
    }
  }

  private func fetchServerIsPrivate(
    db: Firestore,
    targetUID: String,
    fallback: Bool
  ) async throws -> Bool {
    let publicSnap = try await db.collection(FirestoreCollections.usersPublic)
      .document(targetUID)
      .getDocument(source: .server)
    if let visibility = publicSnap.data()?["accountVisibility"] as? String {
      return visibility == "private"
    }
    return fallback
  }

  private func executeFollow(
    db: Firestore,
    uid: String,
    targetUID: String,
    isPrivate: Bool
  ) async throws -> FollowStatus {
    if isPrivate {
      let ref = db.collection(FirestoreCollections.followRequests)
        .document(Self.requestID(from: uid, to: targetUID))
      let existing = try await ref.getDocument(source: .server)
      if existing.exists {
        if (existing.data()?["status"] as? String) == "pending" {
          return .requested
        }
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
    let followerRef = users.document(targetUID).collection(FirestoreSubcollections.followers).document(uid)
    let followingRef = users.document(uid).collection(FirestoreSubcollections.following).document(targetUID)
    _ = try await db.runTransaction { tx, errorPointer in
      do {
        let followerSnap = try tx.getDocument(followerRef)
        let followingSnap = try tx.getDocument(followingRef)
        if !followerSnap.exists {
          tx.setData(["uid": uid, "createdAt": FieldValue.serverTimestamp()], forDocument: followerRef)
        }
        if !followingSnap.exists {
          tx.setData(["uid": targetUID, "createdAt": FieldValue.serverTimestamp()], forDocument: followingRef)
        }
      } catch let error as NSError {
        errorPointer?.pointee = error
        return nil
      }
      return nil
    }
    return .following
  }

  static func requestID(from: String, to: String) -> String { "\(from)_\(to)" }
}

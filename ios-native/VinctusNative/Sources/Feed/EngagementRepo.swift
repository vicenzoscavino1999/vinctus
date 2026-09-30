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
  func followStatus(targetUID: String) async throws -> FollowStatus
  func follow(targetUID: String, isPrivate: Bool) async throws -> FollowStatus
  func unfollow(targetUID: String, status: FollowStatus) async throws
}

enum EngagementRepoError: LocalizedError {
  case firebaseNotConfigured
  case userNotAuthenticated
  case cannotFollowSelf

  var errorDescription: String? {
    switch self {
    case .firebaseNotConfigured:
      return "Firebase no está configurado."
    case .userNotAuthenticated:
      return "Debes iniciar sesión."
    case .cannotFollowSelf:
      return "No puedes seguirte a ti mismo."
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
    return try await db.collection("posts").document(postID).collection("likes").document(uid)
      .getDocument().exists
  }

  func setPostLiked(_ liked: Bool, postID: String) async throws {
    let (db, uid) = try context()
    // Source of truth for the counter trigger, plus the user's own index.
    let likeRef = db.collection("posts").document(postID).collection("likes").document(uid)
    let userLikeRef = db.collection("users").document(uid).collection("likes").document(postID)
    let batch = db.batch()
    if liked {
      batch.setData(
        ["uid": uid, "postId": postID, "createdAt": FieldValue.serverTimestamp()],
        forDocument: likeRef
      )
      batch.setData(
        ["postId": postID, "createdAt": FieldValue.serverTimestamp()],
        forDocument: userLikeRef
      )
    } else {
      batch.deleteDocument(likeRef)
      batch.deleteDocument(userLikeRef)
    }
    try await batch.commit()
  }

  // MARK: Follows

  func followStatus(targetUID: String) async throws -> FollowStatus {
    let (db, uid) = try context()
    let follower = try? await db.collection("users").document(targetUID)
      .collection("followers").document(uid).getDocument()
    if follower?.exists == true {
      return .following
    }
    let request = try? await db.collection("follow_requests")
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
      let ref = db.collection("follow_requests").document(Self.requestID(from: uid, to: targetUID))
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

    let users = db.collection("users")
    let batch = db.batch()
    batch.setData(
      ["uid": uid, "createdAt": FieldValue.serverTimestamp()],
      forDocument: users.document(targetUID).collection("followers").document(uid)
    )
    batch.setData(
      ["uid": targetUID, "createdAt": FieldValue.serverTimestamp()],
      forDocument: users.document(uid).collection("following").document(targetUID)
    )
    try await batch.commit()
    return .following
  }

  func unfollow(targetUID: String, status: FollowStatus) async throws {
    let (db, uid) = try context()
    switch status {
    case .requested:
      try await db.collection("follow_requests")
        .document(Self.requestID(from: uid, to: targetUID)).delete()
    case .following, .none:
      let users = db.collection("users")
      let batch = db.batch()
      batch.deleteDocument(users.document(targetUID).collection("followers").document(uid))
      batch.deleteDocument(users.document(uid).collection("following").document(targetUID))
      try await batch.commit()
    }
  }

  static func requestID(from: String, to: String) -> String { "\(from)_\(to)" }
}

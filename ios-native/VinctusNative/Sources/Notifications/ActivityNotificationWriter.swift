import FirebaseFirestore
import Foundation

/// Writes the notifications a post's author sees when someone likes or comments, with the same
/// documents as the web (`createPostLikeActivity` / `createPostCommentActivity` in
/// `src/shared/lib/firestore/postEngagement.ts`). Best effort: a refused write (for example a
/// block between the two accounts) never undoes the like or the comment.
enum ActivityNotificationWriter {
  /// One document per person and post (`like_{post}_{uid}`): liking again only refreshes it.
  static func like(postID: String, authorID: String, fromUID: String, db: Firestore) async {
    guard authorID != fromUID else { return }
    let sender = await senderProfile(fromUID, db: db)
    try? await db.collection(FirestoreCollections.notifications)
      .document("like_\(postID)_\(fromUID)")
      .setData(
        payload(type: "post_like", toUID: authorID, fromUID: fromUID, sender: sender, postID: postID),
        merge: true
      )
  }

  /// One document per comment (`comment_{post}_{comment}`), so a retried comment notifies once.
  static func comment(
    postID: String,
    commentID: String,
    authorID: String,
    fromUID: String,
    senderName: String,
    senderPhotoURL: String?,
    db: Firestore
  ) async {
    guard authorID != fromUID else { return }
    try? await db.collection(FirestoreCollections.notifications)
      .document("comment_\(postID)_\(commentID)")
      .setData(payload(
        type: "post_comment",
        toUID: authorID,
        fromUID: fromUID,
        sender: (senderName, senderPhotoURL),
        postID: postID
      ))
  }

  /// The fields `isValidNotificationCreate` accepts: no snippet or comment text is copied.
  static func payload(
    type: String,
    toUID: String,
    fromUID: String,
    sender: (name: String?, photoURL: String?),
    postID: String
  ) -> [String: Any] {
    [
      "type": type,
      "toUid": toUID,
      "fromUid": fromUID,
      "fromUserName": sender.name.map { String($0.prefix(120)) } ?? NSNull(),
      "fromUserPhoto": sender.photoURL.flatMap { $0.count <= 600 ? $0 : nil } ?? NSNull(),
      "postId": postID,
      "postSnippet": NSNull(),
      "commentText": NSNull(),
      "createdAt": FieldValue.serverTimestamp(),
      "read": false,
    ]
  }

  private static func senderProfile(_ uid: String, db: Firestore) async -> (name: String?, photoURL: String?) {
    let data = (try? await db.collection(FirestoreCollections.usersPublic).document(uid).getDocument().data()) ?? [:]
    return (FirestoreValue.string(data["displayName"]), FirestoreValue.string(data["photoURL"]))
  }
}

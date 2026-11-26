import FirebaseAuth
import FirebaseFirestore
import XCTest
@testable import VinctusNative

/// Notifications against the emulators and the real rules: the owner answers requests and the
/// recipient reads, marks and deletes activity, with the same writes as the web.
final class NotificationsIntegrationTests: EmulatorTestCase {
  func testTheOwnerAcceptsAGroupRequestAndTheMemberGetsIn() async throws {
    let bruno = try await makeUser("Bruno")
    let groupID = try await makeGroup(name: "Club privado", visibility: .private)
    let ana = try await makeUser("Ana")
    let groups = FirebaseGroupsRepo()
    try await groups.requestToJoin(groupID: groupID, groupName: "Club privado", ownerID: bruno.uid, uid: ana.uid)

    try await signIn(bruno)
    let repo = FirebaseNotificationsRepo()
    let pending = try await repo.fetchRequests(.groups)
    let request = try XCTUnwrap(pending.first { $0.fromUID == ana.uid })
    XCTAssertEqual(request.target, "Club privado")
    XCTAssertEqual(request.name, "Ana")

    try await repo.accept(request)
    let afterAccept = try await repo.fetchRequests(.groups)
    XCTAssertFalse(afterAccept.contains { $0.fromUID == ana.uid })

    try await signIn(ana)
    let status = try await groups.membershipStatus(groupID: groupID, ownerID: bruno.uid, uid: ana.uid)
    XCTAssertEqual(status, .member)
  }

  func testAPrivateAccountAnswersFollowRequestsFromNotifications() async throws {
    let carla = try await makeUser("Carla")
    try await makeSignedInAccountPrivate()
    _ = try await makeUser("Bruno")
    _ = try await FirebaseEngagementRepo().follow(targetUID: carla.uid, isPrivate: true)
    let diego = try await makeUser("Diego")
    _ = try await FirebaseEngagementRepo().follow(targetUID: carla.uid, isPrivate: true)

    try await signIn(carla)
    let repo = FirebaseNotificationsRepo()
    let pending = try await repo.fetchRequests(.followers)
    XCTAssertEqual(Set(pending.map(\.name)), ["Bruno", "Diego"])

    let fromDiego = try XCTUnwrap(pending.first { $0.fromUID == diego.uid })
    try await repo.reject(fromDiego)
    let fromBruno = try XCTUnwrap(pending.first { $0.name == "Bruno" })
    try await repo.accept(fromBruno)

    let remaining = try await repo.fetchRequests(.followers)
    XCTAssertTrue(remaining.isEmpty)
  }

  func testLikesAndCommentsFromTheAppNotifyTheAuthorLikeTheWeb() async throws {
    let ana = try await makeUser("Ana")
    let postID = try await publishPost("Anoche vi los anillos de Saturno")
    let bruno = try await makeUser("Bruno")
    let engagement = FirebaseEngagementRepo()
    try await engagement.setPostLiked(true, postID: postID)
    try await engagement.setPostLiked(false, postID: postID)
    try await engagement.setPostLiked(true, postID: postID)
    try await FirebasePostCommentsRepo().addComment(postID: postID, text: "¡Qué buena foto!")

    try await signIn(ana)
    let page = try await FirebaseNotificationsRepo().fetchActivity(limit: 20, after: nil)
    let fromBruno = page.items.filter { $0.fromUID == bruno.uid }
    let likes = fromBruno.filter { $0.kind == .like }
    XCTAssertEqual(likes.map(\.id), ["like_\(postID)_\(bruno.uid)"], "Liking again does not repeat the notification")
    XCTAssertEqual(likes.first?.fromName, "Bruno")
    XCTAssertEqual(likes.first?.postID, postID)
    XCTAssertEqual(fromBruno.filter { $0.kind == .comment }.count, 1)

    // Ana's own like on her post notifies nobody.
    try await engagement.setPostLiked(true, postID: postID)
    let afterOwnLike = try await FirebaseNotificationsRepo().fetchActivity(limit: 20, after: nil)
    XCTAssertFalse(afterOwnLike.items.contains { $0.fromUID == ana.uid })
  }

  func testTheRecipientReadsMarksAndDeletesActivity() async throws {
    let ana = try await makeUser("Ana")
    let postID = try await publishPost("Noche de observación")
    let bruno = try await makeUser("Bruno")
    // A like notification written as the web writes it (`isValidNotificationCreate`).
    try await Firestore.firestore().collection("notifications").addDocument(data: [
      "type": "post_like",
      "toUid": ana.uid,
      "fromUid": bruno.uid,
      "fromUserName": "Bruno",
      "fromUserPhoto": NSNull(),
      "postId": postID,
      "postSnippet": NSNull(),
      "commentText": NSNull(),
      "createdAt": FieldValue.serverTimestamp(),
      "read": false,
    ])

    try await signIn(ana)
    let repo = FirebaseNotificationsRepo()
    let page = try await repo.fetchActivity(limit: 20, after: nil)
    let like = try XCTUnwrap(page.items.first { $0.fromUID == bruno.uid })
    XCTAssertEqual(like.kind, .like)
    XCTAssertEqual(like.postID, postID)
    XCTAssertFalse(like.read)
    let badge = try await repo.badgeCount()
    XCTAssertGreaterThanOrEqual(badge, 1)

    try await repo.markRead(ids: [like.id])
    let afterRead = try await repo.fetchActivity(limit: 20, after: nil)
    XCTAssertEqual(afterRead.items.first { $0.id == like.id }?.read, true)

    try await repo.delete(id: like.id)
    let afterDelete = try await repo.fetchActivity(limit: 20, after: nil)
    XCTAssertFalse(afterDelete.items.contains { $0.id == like.id })
  }
}

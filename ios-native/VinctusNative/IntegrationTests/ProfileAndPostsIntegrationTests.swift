import XCTest
import FirebaseFirestore
import FirebaseStorage
@testable import VinctusNative

final class ProfileIntegrationTests: EmulatorTestCase {
  func testTheFirstSignInCreatesAProfileThatCanBeEdited() async throws {
    let lucia = try await makeUser("Lucía")
    let repo = FirebaseProfileRepo()

    let created = try await repo.fetchUserProfile(uid: lucia.uid)
    XCTAssertEqual(created?.displayName, "Lucía")
    XCTAssertEqual(created?.accountVisibility, .public)

    let photoURL = try await repo.uploadProfilePhoto(uid: lucia.uid, jpegData: Self.jpegData())
    var update = ProfileUpdate(displayName: "Lucía F.", bio: "Me gusta la astronomía", role: "Estudiante", location: "Lima")
    update.photo = .set(photoURL)
    try await repo.updateProfile(uid: lucia.uid, update)

    let edited = try await repo.fetchUserProfile(uid: lucia.uid)
    XCTAssertEqual(edited?.displayName, "Lucía F.")
    XCTAssertEqual(edited?.bio, "Me gusta la astronomía")
    XCTAssertEqual(edited?.role, "Estudiante")
    XCTAssertEqual(edited?.location, "Lima")
    XCTAssertEqual(edited?.photoURL, photoURL)
  }

  func testTheAIConsentIsSaved() async throws {
    let ana = try await makeUser("Ana")
    let repo = FirebaseAIConsentRepo()

    try await repo.setConsent(uid: ana.uid, granted: true, source: .aiChat)
    let consent = try await repo.getConsent(uid: ana.uid)

    XCTAssertTrue(consent.granted)
  }

  func testContributionsAndFollowedCategories() async throws {
    let ana = try await makeUser("Ana")
    let repo = FirebaseProfileContentRepo()

    var draft = NewContribution()
    draft.title = "Telescopio casero"
    draft.link = "https://example.com/telescopio"
    try await repo.createContribution(draft)
    let contributions = try await repo.fetchContributions(uid: ana.uid)
    XCTAssertEqual(contributions.map(\.title), ["Telescopio casero"])

    let contribution = try XCTUnwrap(contributions.first)
    try await repo.deleteContribution(id: contribution.id)
    let afterDelete = try await repo.fetchContributions(uid: ana.uid)
    XCTAssertTrue(afterDelete.isEmpty)

    try await repo.setCategoryFollowed(true, categoryID: "science")
    let followed = try await repo.fetchFollowedCategories()
    XCTAssertEqual(followed, ["science"])

    try await repo.setCategoryFollowed(false, categoryID: "science")
    let afterUnfollow = try await repo.fetchFollowedCategories()
    XCTAssertTrue(afterUnfollow.isEmpty)
  }
}

final class PostIntegrationTests: EmulatorTestCase {
  func testNativePhotoVideoDocumentAndYouTubePostRetriesWithoutOverwriting() async throws {
    _ = try await makeUser("Lucía")
    let repo = FirebaseCreatePostRepo()
    let postID = try repo.makePostID()
    let cases: [(String, String, ChatMediaKind, Data)] = [
      ("jpg", "image/jpeg", .image, Self.jpegData()),
      // Transport/permissions fixture; real movie decoding remains a device check.
      ("mp4", "video/mp4", .video, Data([0, 1, 2, 3])),
      ("pdf", "application/pdf", .document, Data("%PDF-1.4".utf8)),
    ]
    var files: [ChatPendingAttachment] = []
    for (suffix, type, kind, data) in cases {
      let url = ChatPendingAttachment.temporaryURL(extension: suffix)
      try data.write(to: url)
      files.append(ChatPendingAttachment(fileURL: url, fileName: "test.\(suffix)", contentType: type, size: data.count, kind: kind))
    }
    let draft = NativePostDraft(title: "Adjuntos entre plataformas", text: "", files: files, youtubeVideoID: "dQw4w9WgXcQ")
    try await repo.publishPost(draft, postID: postID, groupID: nil, onProgress: { _ in })
    let ref = Firestore.firestore().collection("posts").document(postID)
    let first = try await ref.getDocument(source: .server)
    try await repo.publishPost(draft, postID: postID, groupID: nil, onProgress: { _ in })
    let second = try await ref.getDocument(source: .server)
    XCTAssertEqual(first.data()?["updatedAt"] as? Timestamp, second.data()?["updatedAt"] as? Timestamp)
    XCTAssertEqual(second.data()?["status"] as? String, "ready")
    let wire = try XCTUnwrap(second.data()?["media"] as? [[String: Any]])
    XCTAssertEqual(wire.compactMap { $0["type"] as? String }, ["image", "video", "file", "video"])
    for (index, file) in files.enumerated() {
      let path = try XCTUnwrap(wire[index]["path"] as? String)
      let received = try await Storage.storage().reference(withPath: path).data(maxSize: 1024 * 1024)
      XCTAssertEqual(received, try Data(contentsOf: file.fileURL))
    }
    let feed = try await FirebaseFeedRepo().fetchFeedPage(limit: 30, after: nil)
    let item = try XCTUnwrap(feed.items.first { $0.id == postID })
    XCTAssertEqual(item.media.count, 4)
    XCTAssertEqual(item.title, "Adjuntos entre plataformas")
    let profile = try await FirebaseProfileContentRepo().fetchPosts(uid: try XCTUnwrap(second.data()?["authorId"] as? String), limit: 30, after: nil)
    XCTAssertTrue(profile.items.contains { $0.id == postID && $0.media.count == 4 })
  }

  func testPendingPostsStayOutOfTheFeedAndTextRetriesCheckTheGroup() async throws {
    let user = try await makeUser("Ana")
    let repo = FirebaseCreatePostRepo()
    let postID = try repo.makePostID()
    let db = Firestore.firestore()
    try await db.collection("posts").document(postID).setData([
      "postId": postID, "authorId": user.uid,
      "authorSnapshot": ["displayName": "Ana", "photoURL": NSNull()],
      "title": NSNull(), "text": "Pendiente", "status": "uploading", "media": [],
      "createdAt": FieldValue.serverTimestamp(), "updatedAt": NSNull(),
      "groupId": NSNull(), "categoryId": NSNull(), "likeCount": 0, "commentCount": 0,
    ])
    let feed = try await FirebaseFeedRepo().fetchFeedPage(limit: 30, after: nil)
    XCTAssertFalse(feed.items.contains { $0.id == postID })
    try await repo.publishTextPost(text: "Pendiente", postID: postID, groupID: nil)
    do {
      try await repo.publishTextPost(text: "Pendiente", postID: postID, groupID: "otro-grupo")
      XCTFail("The original group cannot change during a retry")
    } catch { }
  }
  func testCommentRetriesOnlyCreateOneImmutableDocument() async throws {
    _ = try await makeUser("Lucía")
    let postID = try await publishPost("Publicación con comentarios")
    _ = try await makeUser("Bruno")
    let repo = FirebasePostCommentsRepo()
    let commentID = UUID().uuidString
    try await repo.addComment(postID: postID, text: "Una sola vez", commentID: commentID)
    let ref = Firestore.firestore().collection("posts").document(postID).collection("comments").document(commentID)
    let before = try await ref.getDocument(source: .server)
    try await repo.addComment(postID: postID, text: "Una sola vez", commentID: commentID)
    let after = try await ref.getDocument(source: .server)
    XCTAssertEqual(before.data()?["createdAt"] as? Timestamp, after.data()?["createdAt"] as? Timestamp)
    let page = try await repo.fetchComments(postID: postID, limit: 20)
    XCTAssertEqual(page.items.map(\.id), [commentID])

    do {
      try await repo.addComment(postID: postID, text: "Texto distinto", commentID: commentID)
      XCTFail("A retry must not replace an immutable comment")
    } catch { }
    _ = try await makeUser("Ana")
    do {
      try await repo.addComment(postID: postID, text: "Una sola vez", commentID: commentID)
      XCTFail("Another account must not claim an existing comment")
    } catch { }
    let unchanged = try await ref.getDocument(source: .server)
    XCTAssertEqual(unchanged.data()?["text"] as? String, "Una sola vez")
  }

  func testPublishAndFindItInTheFeed() async throws {
    _ = try await makeUser("Lucía")

    let postID = try await publishPost("Hoy vi Saturno con el telescopio")
    let feed = try await FirebaseFeedRepo().fetchFeedPage(limit: 20, after: nil)

    XCTAssertTrue(feed.items.contains { $0.id == postID })
  }

  func testSomeoneElseLikesAndComments() async throws {
    let lucia = try await makeUser("Lucía")
    let postID = try await publishPost("Hoy vi Saturno con el telescopio")
    _ = try await makeUser("Bruno")

    let engagement = FirebaseEngagementRepo()
    try await engagement.setPostLiked(true, postID: postID)
    let liked = try await engagement.isPostLiked(postID: postID)
    XCTAssertTrue(liked)

    try await engagement.setPostLiked(false, postID: postID)
    let unliked = try await engagement.isPostLiked(postID: postID)
    XCTAssertFalse(unliked)

    let comments = FirebasePostCommentsRepo()
    try await comments.addComment(postID: postID, text: "¡Qué buena observación!")
    let page = try await comments.fetchComments(postID: postID, limit: 10)
    XCTAssertEqual(page.items.map(\.text), ["¡Qué buena observación!"])
    XCTAssertEqual(page.items.first?.authorName, "Bruno")

    // The author sees the comment too.
    try await signIn(lucia)
    let seenByAuthor = try await comments.fetchComments(postID: postID, limit: 10)
    XCTAssertEqual(seenByAuthor.items.count, 1)
  }
}

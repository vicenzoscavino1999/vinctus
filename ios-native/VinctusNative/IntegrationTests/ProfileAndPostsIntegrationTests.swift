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
    let user = try await makeUser("Lucía")
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
    // Simulate a previous attempt that uploaded the image but never finalized
    // the post. Storage rules reject overwrites, so the repo must recover it.
    let firstPath = PostFiles.path(files[0], userID: user.uid, postID: postID)
    let firstObject = Storage.storage().reference(withPath: firstPath)
    let metadata = StorageMetadata()
    metadata.contentType = files[0].contentType
    _ = try await firstObject.putDataAsync(try Data(contentsOf: files[0].fileURL), metadata: metadata)
    let beforeRetry = try await firstObject.getMetadata()
    let draft = NativePostDraft(title: "Adjuntos entre plataformas", text: "", files: files, youtubeVideoID: "dQw4w9WgXcQ")
    try await repo.publishPost(draft, postID: postID, groupID: nil, onProgress: { _ in })
    let recovered = try await firstObject.getMetadata()
    XCTAssertEqual(recovered.generation, beforeRetry.generation)
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

  func testCommentPaginationKeepsTiedTimestampsAndSurvivesADeletedCursor() async throws {
    let user = try await makeUser("Ana")
    let postID = try await publishPost("Más de ochenta comentarios")
    let db = Firestore.firestore()
    let comments = db.collection("posts").document(postID).collection("comments")
    let batch = db.batch()
    let ids = (0..<105).map { String(format: "c%03d", $0) }
    for id in ids {
      batch.setData([
        "postId": postID, "authorId": user.uid,
        "authorSnapshot": ["displayName": "Ana", "photoURL": NSNull()],
        "text": id, "createdAt": FieldValue.serverTimestamp(),
      ], forDocument: comments.document(id))
    }
    try await batch.commit()

    let repo = FirebasePostCommentsRepo()
    var page = try await repo.fetchComments(postID: postID, limit: 20)
    XCTAssertFalse(page.isFromCache)
    XCTAssertEqual(page.items.map(\.id), Array(ids.reversed().prefix(20)))
    let cursor = try XCTUnwrap(page.nextCursor)
    // The batch gives every comment exactly the same timestamp, so ID is essential.
    let timestamps = Set(page.items.compactMap(\.createdAt))
    XCTAssertEqual(timestamps.count, 1)
    try await comments.document(cursor.commentID).delete()
    // A new comment must not shift/duplicate older pages.
    try await repo.addComment(postID: postID, text: "Más reciente", commentID: "new")
    var loaded = page.items.map(\.id)
    var pageCount = 1
    while page.hasMore && pageCount < 10 {
      page = try await repo.fetchComments(postID: postID, limit: 20, after: page.nextCursor)
      loaded.append(contentsOf: page.items.map(\.id))
      pageCount += 1
    }
    XCTAssertEqual(pageCount, 6)
    XCTAssertFalse(page.hasMore)
    XCTAssertEqual(loaded, Array(ids.reversed()))
    XCTAssertEqual(Set(loaded).count, 105)
    let refreshed = try await repo.fetchComments(postID: postID, limit: 20)
    XCTAssertEqual(refreshed.items.first?.id, "new")
    XCTAssertFalse(refreshed.items.contains { $0.id == cursor.commentID })
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

  func testLikeAndSaveRetriesKeepDatesAndRepairTheLikeIndex() async throws {
    _ = try await makeUser("Ana")
    let postID = try await publishPost("Reacciones compartidas")
    let user = try await makeUser("Bruno")
    let repo = FirebaseEngagementRepo()
    let db = Firestore.firestore()
    let like = db.collection("posts").document(postID).collection("likes").document(user.uid)
    let index = db.collection("users").document(user.uid).collection("likes").document(postID)
    let saved = db.collection("users").document(user.uid).collection("savedPosts").document(postID)
    try await repo.setPostLiked(true, postID: postID)
    try await repo.setPostSaved(true, postID: postID)
    let originalLike = try await like.getDocument(source: .server)
    let originalSaved = try await saved.getDocument(source: .server)
    try await index.delete()
    try await repo.setPostLiked(true, postID: postID)
    try await repo.setPostSaved(true, postID: postID)
    let retriedLike = try await like.getDocument(source: .server)
    let retriedSaved = try await saved.getDocument(source: .server)
    let repairedIndex = try await index.getDocument(source: .server)
    XCTAssertEqual(originalLike.data()?["createdAt"] as? Timestamp, retriedLike.data()?["createdAt"] as? Timestamp)
    XCTAssertEqual(originalSaved.data()?["createdAt"] as? Timestamp, retriedSaved.data()?["createdAt"] as? Timestamp)
    XCTAssertTrue(repairedIndex.exists)
    try await repo.setPostLiked(false, postID: postID)
    try await repo.setPostLiked(false, postID: postID)
    try await repo.setPostSaved(false, postID: postID)
    try await repo.setPostSaved(false, postID: postID)
    let unliked = try await repo.isPostLiked(postID: postID)
    let unsaved = try await repo.isPostSaved(postID: postID)
    XCTAssertFalse(unliked)
    XCTAssertFalse(unsaved)
  }

  func testSavedPostsAdvanceOverDeletedItemsAndBelongOnlyToTheCurrentAccount() async throws {
    let user = try await makeUser("Ana")
    let postID = try await publishPost("Una publicación conservada")
    let engagement = FirebaseEngagementRepo()
    try await engagement.setPostSaved(true, postID: postID)
    let db = Firestore.firestore()
    let index = db.collection("users").document(user.uid).collection("savedPosts")
    let batch = db.batch()
    for i in 0..<20 {
      let id = "orphan-\(i)"
      batch.setData(["postId": id, "createdAt": FieldValue.serverTimestamp()], forDocument: index.document(id))
    }
    try await batch.commit()
    let repo = FirebaseSavedPostsRepo()
    let first = try await repo.fetchSavedPosts(limit: 20, after: nil)
    XCTAssertTrue(first.items.isEmpty)
    XCTAssertNotNil(first.next)
    let second = try await repo.fetchSavedPosts(limit: 20, after: first.next)
    XCTAssertEqual(second.items.map(\.id), [postID])
    XCTAssertNil(second.next)
    _ = try await makeUser("Bruno")
    let other = try await repo.fetchSavedPosts(limit: 20, after: nil)
    XCTAssertTrue(other.items.isEmpty)
    do {
      _ = try await index.getDocuments(source: .server)
      XCTFail("Another account must not read the saved index")
    } catch { }
  }
}

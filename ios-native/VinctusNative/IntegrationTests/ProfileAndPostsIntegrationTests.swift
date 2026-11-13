import XCTest
import FirebaseFirestore
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

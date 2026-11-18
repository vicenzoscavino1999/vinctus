import FirebaseAuth
import FirebaseFirestore
import FirebaseStorage
import XCTest
@testable import VinctusNative

final class StoriesIntegrationTests: EmulatorTestCase {
  func testPublishStoryVisibleToFollowerHiddenAfterBlockAndDeletedByOwner() async throws {
    let ana = try await makeUser("Ana")
    let repo = FirebaseStoriesRepo()

    try await repo.publishImageStory(jpegData: Self.jpegData())
    let anaGroups = try await repo.fetchStoryGroups()
    let anaGroup = try XCTUnwrap(anaGroups.first(where: { $0.ownerID == ana.uid }))
    let published = try XCTUnwrap(anaGroup.stories.first)
    XCTAssertTrue(published.mediaPath.hasPrefix("stories/\(ana.uid)/\(published.id)/original/"))

    let ownerMeta = try await Storage.storage().reference(withPath: published.mediaPath).getMetadata()
    XCTAssertGreaterThan(ownerMeta.size, 0)

    _ = try await makeUser("Bruno")
    let beforeFollow = try await repo.fetchStoryGroups()
    XCTAssertFalse(beforeFollow.contains(where: { $0.ownerID == ana.uid }))

    do {
      _ = try await Firestore.firestore().collection("stories").document(published.id)
        .getDocument(source: .server)
      XCTFail("Non-follower must not read a friends-only story document")
    } catch {
      // Expected permission denied.
    }

    _ = try await FirebaseEngagementRepo().follow(targetUID: ana.uid, isPrivate: false)
    let followerGroups = try await repo.fetchStoryGroups()
    XCTAssertTrue(followerGroups.contains(where: { $0.ownerID == ana.uid }))
    let followerMeta = try await Storage.storage().reference(withPath: published.mediaPath).getMetadata()
    XCTAssertGreaterThan(followerMeta.size, 0)

    try await FirebaseModerationRepo().report(
      .story(storyID: published.id, ownerID: ana.uid),
      reason: .abuse,
      details: "Prueba de reporte"
    )

    try await FirebaseModerationRepo().blockUser(ana.uid)
    let afterBlockGroups = try await repo.fetchStoryGroups()
    XCTAssertFalse(afterBlockGroups.contains(where: { $0.ownerID == ana.uid }))

    do {
      _ = try await Firestore.firestore().collection("stories").document(published.id)
        .getDocument(source: .server)
      XCTFail("Blocked viewer must not read the blocked user's story")
    } catch {
      // Expected permission denied.
    }

    do {
      _ = try await Storage.storage().reference(withPath: published.mediaPath).getMetadata()
      XCTFail("Blocked viewer must not read the blocked user's story media")
    } catch {
      // Expected permission denied.
    }

    try await signIn(ana)
    try await repo.deleteStory(published)
    let afterDeleteGroups = try await repo.fetchStoryGroups()
    XCTAssertFalse(afterDeleteGroups.contains(where: { $0.ownerID == ana.uid }))

    do {
      _ = try await Storage.storage().reference(withPath: published.mediaPath).getMetadata()
      XCTFail("Deleted story media should be removed from Storage")
    } catch {
      // Expected object-not-found.
    }
  }
}

import XCTest
@testable import VinctusNative

final class FollowIntegrationTests: EmulatorTestCase {
  func testFollowAPublicAccountThenMessageAndUnfollow() async throws {
    let bruno = try await makeUser("Bruno")
    _ = try await makeUser("Ana")
    let engagement = FirebaseEngagementRepo()

    let status = try await engagement.follow(targetUID: bruno.uid, isPrivate: false)
    XCTAssertEqual(status, .following)
    let loaded = try await engagement.followStatus(targetUID: bruno.uid)
    XCTAssertEqual(loaded, .following)

    // Following someone is what lets you write to them (canStartDirectConversation).
    let chat = FirebaseChatRepo()
    let conversationID = try await chat.openDirectConversation(with: bruno.uid)
    XCTAssertTrue(conversationID.hasPrefix("dm_"))
    try await chat.sendMessage(conversationID: conversationID, text: "¡Hola, Bruno!")
    await chat.markRead(conversationID: conversationID)

    try await engagement.unfollow(targetUID: bruno.uid, status: .following)
    let afterUnfollow = try await engagement.followStatus(targetUID: bruno.uid)
    XCTAssertEqual(afterUnfollow, FollowStatus.none)
  }

  func testAPrivateAccountGetsAFollowRequest() async throws {
    let carla = try await makeUser("Carla")
    try await makeSignedInAccountPrivate()
    let ana = try await makeUser("Ana")
    let engagement = FirebaseEngagementRepo()

    let status = try await engagement.follow(targetUID: carla.uid, isPrivate: true)
    XCTAssertEqual(status, .requested)
    let loaded = try await engagement.followStatus(targetUID: carla.uid)
    XCTAssertEqual(loaded, .requested)

    // Carla sees the request and accepts it. The follower documents come from a Cloud Function
    // (onFollowRequestUpdated), which these tests don't run.
    try await signIn(carla)
    let content = FirebaseProfileContentRepo()
    let requests = try await content.fetchIncomingFollowRequests()
    XCTAssertEqual(requests.map(\.from.id), [ana.uid])
    let pending = try await content.hasPendingFollowRequest(from: ana.uid)
    XCTAssertTrue(pending)

    try await content.answerFollowRequest(from: ana.uid, accept: true)
    let stillPending = try await content.hasPendingFollowRequest(from: ana.uid)
    XCTAssertFalse(stillPending)
  }

  func testYouCannotWriteToSomeoneYouDontFollow() async throws {
    let bruno = try await makeUser("Bruno")
    _ = try await makeUser("Ana")

    do {
      _ = try await FirebaseChatRepo().openDirectConversation(with: bruno.uid)
      XCTFail("The rules should reject a conversation between people who don't follow each other")
    } catch ChatRepoError.cannotStartConversation {
      // Expected: the rules' denial is reported as "you can't write to this person".
    }
  }
}

final class ModerationIntegrationTests: EmulatorTestCase {
  func testReportAPostAndAUser() async throws {
    let bruno = try await makeUser("Bruno")
    let postID = try await publishPost("Publicación de Bruno")
    _ = try await makeUser("Ana")
    let moderation = FirebaseModerationRepo()

    try await moderation.report(.post(postID: postID, authorID: bruno.uid), reason: .spam, details: "Es publicidad")
    try await moderation.report(.user(userID: bruno.uid), reason: .harassment, details: nil)
  }

  func testBlockAndUnblock() async throws {
    let bruno = try await makeUser("Bruno")
    _ = try await makeUser("Ana")
    _ = try await FirebaseEngagementRepo().follow(targetUID: bruno.uid, isPrivate: false)
    let moderation = FirebaseModerationRepo()

    try await moderation.blockUser(bruno.uid)
    let blocked = try await moderation.fetchBlockedUserIDs()
    XCTAssertEqual(blocked, [bruno.uid])

    // A block stops new conversations, even with someone you follow.
    do {
      _ = try await FirebaseChatRepo().openDirectConversation(with: bruno.uid)
      XCTFail("The rules should reject a conversation with a blocked user")
    } catch ChatRepoError.cannotStartConversation {
      // Expected.
    }

    try await moderation.unblockUser(bruno.uid)
    let afterUnblock = try await moderation.fetchBlockedUserIDs()
    XCTAssertTrue(afterUnblock.isEmpty)
  }
}

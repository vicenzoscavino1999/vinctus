import FirebaseAuth
import FirebaseFirestore
import XCTest
@testable import VinctusNative

@MainActor
final class ChatIntegrationTests: EmulatorTestCase {
  func testHistoryPagesIncludeMessagesWithIdenticalTimestampsWithoutGapsOrDuplicates() async throws {
    let (repo, conversationID, uid) = try await makeConversation()
    try await seedMessages(1...105, conversationID: conversationID, uid: uid, timestamp: 1_700_000_000_000)

    let loaded = expectation(description: "Latest server page")
    var firstPage: ChatMessagePage?
    let subscription = repo.observeMessages(conversationID: conversationID, through: nil) { page in
      guard !page.isFromCache, firstPage == nil else { return }
      firstPage = page
      loaded.fulfill()
    } onError: { error in
      XCTFail("Messages listener failed: \(error)")
    }
    defer { subscription.cancel() }
    await fulfillment(of: [loaded], timeout: 20)

    let first = try XCTUnwrap(firstPage)
    XCTAssertEqual(first.messages.count, 50)
    let second = try await repo.fetchOlderMessages(
      conversationID: conversationID, before: XCTUnwrap(first.oldestCursor))
    let third = try await repo.fetchOlderMessages(
      conversationID: conversationID, before: XCTUnwrap(second.oldestCursor))

    XCTAssertEqual(second.messages.count, 50)
    XCTAssertEqual(third.messages.count, 5)
    XCTAssertFalse(third.hasMore)
    let ids = (third.messages + second.messages + first.messages).map(\.id)
    XCTAssertEqual(ids, (1...105).map { String(format: "m%03d", $0) })
    XCTAssertEqual(Set(ids).count, 105)
  }

  func testOpenedWindowKeepsOlderRowsWhenMoreThanFiftyNewMessagesArrive() async throws {
    let (repo, conversationID, uid) = try await makeConversation()
    try await seedMessages(1...50, conversationID: conversationID, uid: uid, timestamp: 1_700_000_000_000)
    let boundary = ChatMessageCursor(clientCreatedAt: 1_700_000_000_000, messageID: "m001")
    let expanded = expectation(description: "All opened and newly received messages")
    var didFulfill = false
    var received: [ChatMessage] = []
    let subscription = repo.observeMessages(conversationID: conversationID, through: boundary) { page in
      guard !page.isFromCache, page.messages.count == 110, !didFulfill else { return }
      didFulfill = true
      received = page.messages
      expanded.fulfill()
    } onError: { error in
      XCTFail("Messages listener failed: \(error)")
    }
    defer { subscription.cancel() }
    try await seedMessages(51...110, conversationID: conversationID, uid: uid, timestamp: 1_700_000_000_001)
    await fulfillment(of: [expanded], timeout: 20)
    XCTAssertEqual(received.first?.id, "m001")
    XCTAssertEqual(received.last?.id, "m110")
  }

  func testAnOlderGroupChatIsListedBeyondFiftyMoreRecentMemberships() async throws {
    let user = try await makeUser("Ana")
    let groupID = try await makeGroup(name: "Grupo antiguo activo", visibility: .public)
    try await FirebaseGroupsRepo().joinGroup(groupID: groupID, uid: user.uid)
    let repo = FirebaseChatRepo()
    let conversationID = try await repo.openGroupConversation(groupID: groupID)
    let memberships = Firestore.firestore().collection("users").document(user.uid).collection("memberships")
    try await memberships.document(groupID).updateData(["joinedAt": Timestamp(seconds: 1, nanoseconds: 0)])

    // Stale group indexes are valid too. They must not displace an older active chat.
    let batch = Firestore.firestore().batch()
    for number in 1...50 {
      let id = "other-\(number)"
      batch.setData(["groupId": id, "joinedAt": FieldValue.serverTimestamp()],
        forDocument: memberships.document(id))
    }
    try await batch.commit()

    let loaded = expectation(description: "Older active group remains visible")
    var didFulfill = false
    let subscription = repo.observeConversations { conversations in
      guard conversations.contains(where: { $0.id == conversationID }), !didFulfill else { return }
      didFulfill = true
      loaded.fulfill()
    } onError: { _ in
      // Missing conversations behind the stale indexes are unrelated to the active group.
    }
    defer { subscription.cancel() }
    await fulfillment(of: [loaded], timeout: 20)
  }

  func testListenerErrorsKeepPreviouslyLoadedConversations() async throws {
    let (repo, conversationID, _) = try await makeConversation()
    let loaded = expectation(description: "Conversation is loaded")
    let denied = expectation(description: "Auth loss is reported")
    var didLoad = false
    var didReport = false
    var latest: [ChatConversation] = []
    let subscription = repo.observeConversations { conversations in
      latest = conversations
      if conversations.contains(where: { $0.id == conversationID }), !didLoad {
        didLoad = true
        loaded.fulfill()
      }
    } onError: { _ in
      if didLoad, !didReport {
        didReport = true
        denied.fulfill()
      }
    }
    defer { subscription.cancel() }
    await fulfillment(of: [loaded], timeout: 20)
    try Auth.auth().signOut()
    await fulfillment(of: [denied], timeout: 20)
    XCTAssertTrue(latest.contains { $0.id == conversationID })
  }

  private func makeConversation() async throws -> (FirebaseChatRepo, String, String) {
    let bruno = try await makeUser("Bruno")
    let ana = try await makeUser("Ana")
    _ = try await FirebaseEngagementRepo().follow(targetUID: bruno.uid, isPrivate: false)
    let repo = FirebaseChatRepo()
    let id = try await repo.openDirectConversation(with: bruno.uid)
    return (repo, id, ana.uid)
  }

  private func seedMessages(_ numbers: ClosedRange<Int>, conversationID: String, uid: String, timestamp: Int64) async throws {
    let db = Firestore.firestore()
    let messages = db.collection("conversations").document(conversationID).collection("messages")
    let batch = db.batch()
    for number in numbers {
      let id = String(format: "m%03d", number)
      batch.setData([
        "senderId": uid, "senderName": "Ana", "senderPhotoURL": NSNull(),
        "text": "Mensaje \(number)", "createdAt": FieldValue.serverTimestamp(),
        "clientCreatedAt": timestamp, "clientId": id,
      ], forDocument: messages.document(id))
    }
    try await batch.commit()
  }
}

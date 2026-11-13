import FirebaseAuth
import FirebaseFirestore
import FirebaseStorage
import XCTest
@testable import VinctusNative

@MainActor
final class ChatIntegrationTests: EmulatorTestCase {
  func testPhotoVideoAndAudioRoundTripAndRetryDoesNotDuplicateTheMessage() async throws {
    let (repo, conversationID, uid) = try await makeConversation()
    let cases: [(String, String, ChatMediaKind, Data)] = [
      ("jpg", "image/jpeg", .image, Self.jpegData()),
      ("mp4", "video/mp4", .video, Data([0, 1, 2, 3])),
      ("m4a", "audio/mp4", .audio, Data([0, 1, 2, 3])),
    ]
    // Video/audio bytes here exercise upload permissions and message transport. Real codec
    // decoding, microphone permissions and playback still need a device/simulator UI check.
    for (suffix, type, kind, data) in cases {
      let local = ChatPendingAttachment.temporaryURL(extension: suffix)
      try data.write(to: local)
      let file = try ChatPickedFile.ownedFile(local, name: "test.\(suffix)", type: type, kind: kind)
      let id = UUID().uuidString
      try await repo.sendMessage(conversationID: conversationID, text: "", attachments: [file], clientID: id, onProgress: { _ in })
      try await repo.sendMessage(conversationID: conversationID, text: "", attachments: [file], clientID: id, onProgress: { _ in })
      let stored = try await Firestore.firestore().collection("conversations").document(conversationID)
        .collection("messages").document(id).getDocument(source: .server)
      let message = try XCTUnwrap(FirebaseChatRepo.message(id: id, data: stored.data() ?? [:]))
      let attachment = try XCTUnwrap(message.attachments.first)
      XCTAssertEqual(attachment.mediaKind, kind)
      XCTAssertEqual(attachment.contentType, type)
      XCTAssertEqual(attachment.size, data.count)
      XCTAssertTrue(attachment.path.contains("/\(uid)/\(id)/"))
      let downloaded = try await Storage.storage().reference(withPath: attachment.path).data(maxSize: 1024 * 1024)
      XCTAssertEqual(downloaded, data)
    }
    let messages = try await Firestore.firestore().collection("conversations").document(conversationID)
      .collection("messages").getDocuments(source: .server)
    XCTAssertEqual(messages.documents.count, 3)
  }

  func testReadAcknowledgementNeverMovesBackwards() async throws {
    let (repo, conversationID, uid) = try await makeConversation()
    let member = Firestore.firestore().collection("conversations").document(conversationID).collection("members").document(uid)
    let newer = Int64(Date().timeIntervalSince1970 * 1000) + 1000
    try await repo.markRead(conversationID: conversationID, through: newer)
    try await repo.markRead(conversationID: conversationID, through: newer - 500)
    let stored = try await member.getDocument(source: .server)
    XCTAssertEqual((stored.data()?["lastReadClientAt"] as? NSNumber)?.int64Value, newer)
  }

  func testMoreThanFiftyDirectConversationsRemainAccessible() async throws {
    let user = try await makeUser("Ana")
    let db = Firestore.firestore()
    let batch = db.batch()
    let ids = (1...51).map { "dm_\(user.uid)_other\($0)" }
    // Admin fixture writes create existing chats without 51 unrelated Auth sign-up flows.
    // All application reads below still use FirebaseChatRepo under the user's real rules.
    for id in ids {
      let endpoint = URL(string: "http://127.0.0.1:8080/v1/projects/\(Emulator.projectID)/databases/(default)/documents/conversations/\(id)")!
      var request = URLRequest(url: endpoint)
      request.httpMethod = "PATCH"
      request.setValue("Bearer owner", forHTTPHeaderField: "Authorization")
      request.setValue("application/json", forHTTPHeaderField: "Content-Type")
      request.httpBody = try JSONSerialization.data(withJSONObject: ["fields": [
        "type": ["stringValue": "direct"],
        "memberIds": ["arrayValue": ["values": [["stringValue": user.uid], ["stringValue": "other"]]]],
        "updatedAt": ["timestampValue": "2026-01-01T00:00:00Z"],
      ]])
      let (_, response) = try await URLSession.shared.data(for: request)
      XCTAssertEqual((response as? HTTPURLResponse)?.statusCode, 200)
      batch.setData(["conversationId": id, "otherUid": "other", "type": "direct", "updatedAt": FieldValue.serverTimestamp()],
        forDocument: db.collection("users").document(user.uid).collection("directConversations").document(id))
    }
    try await batch.commit()
    let loaded = expectation(description: "All 51 direct chats are listed")
    var didFulfill = false
    let subscription = FirebaseChatRepo().observeConversations { conversations in
      guard conversations.count == 51, !didFulfill else { return }
      didFulfill = true
      XCTAssertEqual(Set(conversations.map(\.id)), Set(ids))
      loaded.fulfill()
    } onError: { error in XCTFail("Conversation read failed: \(error)") }
    defer { subscription.cancel() }
    await fulfillment(of: [loaded], timeout: 30)
  }
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

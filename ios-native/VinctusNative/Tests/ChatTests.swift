import XCTest
@testable import VinctusNative

/// Chat data must match the web (`src/shared/lib/firestore/messaging.ts`).
final class ChatDataTests: XCTestCase {
  func testDirectConversationIDIsTheSameForBothPeople() {
    XCTAssertEqual(FirebaseChatRepo.directConversationID("b", "a"), "dm_a_b")
    XCTAssertEqual(FirebaseChatRepo.directConversationID("a", "b"), "dm_a_b")
  }

  func testMessageFromDocumentData() {
    let message = FirebaseChatRepo.message(id: "m1", data: [
      "senderId": "u2",
      "senderName": "Mateo",
      "text": "hola",
      "clientCreatedAt": NSNumber(value: 1_700_000_000_000),
    ])

    XCTAssertEqual(message?.id, "m1")
    XCTAssertEqual(message?.senderID, "u2")
    XCTAssertEqual(message?.senderName, "Mateo")
    XCTAssertEqual(message?.text, "hola")
    XCTAssertEqual(message?.hasAttachments, false)
    XCTAssertEqual(message?.createdAt, Date(timeIntervalSince1970: 1_700_000_000))
  }

  func testAttachmentOnlyMessageAndMissingSender() {
    let attachment = FirebaseChatRepo.message(id: "m2", data: [
      "senderId": "u2",
      "attachments": [["kind": "image"]],
    ])
    XCTAssertEqual(attachment?.text, "")
    XCTAssertEqual(attachment?.hasAttachments, true)

    XCTAssertNil(FirebaseChatRepo.message(id: "m3", data: ["text": "sin autor"]))
  }

  /// The moderation panel removes a reported message from `msg|<conversation>|<message>`
  /// (parseReportedMessageTarget in functions/src/moderation.ts).
  func testMessageReport() {
    let fields = ReportFields(
      target: .message(conversationID: "dm_a_b", messageID: "m1", authorID: "b", excerpt: "insulto"),
      details: " spam "
    )

    XCTAssertEqual(fields.reportedUID, "b")
    XCTAssertEqual(fields.conversationID, "msg|dm_a_b|m1")
    XCTAssertEqual(fields.details, "[Mensaje en dm_a_b] insulto | Motivo: spam")
    XCTAssertTrue(fields.fitsRules)
  }

  func testLongMessageReportStillFitsTheRules() {
    let fields = ReportFields(
      target: .message(
        conversationID: "grp_g1", messageID: "m1", authorID: "b",
        excerpt: String(repeating: "a", count: 4000)
      ),
      details: String(repeating: "b", count: 900)
    )

    XCTAssertTrue(fields.fitsRules)
  }
}

@MainActor
final class ConversationViewModelTests: XCTestCase {
  func testCanSendOnlyNonEmptyMessagesWithinTheLimit() {
    let vm = ConversationViewModel(repo: FakeChatRepo(), conversationID: "dm_a_b")

    vm.draft = "   "
    XCTAssertFalse(vm.canSend)
    vm.draft = String(repeating: "a", count: FirebaseChatRepo.maxMessageLength + 1)
    XCTAssertFalse(vm.canSend)
    vm.draft = "hola"
    XCTAssertTrue(vm.canSend)
  }

  func testSendingClearsTheDraft() async {
    let repo = FakeChatRepo()
    let vm = ConversationViewModel(repo: repo, conversationID: "dm_a_b")
    vm.draft = "hola"

    await vm.send()?.value

    XCTAssertEqual(repo.sentTexts, ["hola"])
    XCTAssertEqual(vm.draft, "")
    XCTAssertNil(vm.errorMessage)
    XCTAssertFalse(vm.isSending)
  }

  func testAFailedSendGivesTheDraftBack() async {
    let repo = FakeChatRepo()
    repo.failsToSend = true
    let vm = ConversationViewModel(repo: repo, conversationID: "dm_a_b")
    vm.draft = "hola"

    await vm.send()?.value

    XCTAssertEqual(vm.draft, "hola")
    XCTAssertEqual(vm.errorMessage, "Falló la prueba")
    XCTAssertFalse(vm.isSending)
  }

  func testAFailedSendPreservesANewerDraftAndCanBeRetriedSeparately() async throws {
    let repo = FakeChatRepo()
    repo.failsToSend = true
    let vm = ConversationViewModel(repo: repo, conversationID: "dm_a_b")
    vm.draft = "primer mensaje"
    let sending = vm.send()
    vm.draft = "segundo mensaje en preparación"
    await sending?.value

    XCTAssertEqual(vm.draft, "segundo mensaje en preparación")
    XCTAssertEqual(vm.failedMessages.map(\.text), ["primer mensaje"])
    let failed = try XCTUnwrap(vm.failedMessages.first)

    // A failed retry must neither duplicate the retained message nor overwrite the draft.
    await vm.retry(failed)?.value
    XCTAssertEqual(vm.failedMessages.count, 1)
    XCTAssertEqual(vm.draft, "segundo mensaje en preparación")

    repo.failsToSend = false
    await vm.retry(failed)?.value
    XCTAssertEqual(repo.sentTexts, ["primer mensaje"])
    XCTAssertTrue(vm.failedMessages.isEmpty)
    XCTAssertEqual(vm.draft, "segundo mensaje en preparación")
  }

  func testReceivingMessagesClearsALoadErrorButPreservesASendFailure() async {
    let repo = FakeChatRepo()
    let vm = ConversationViewModel(repo: repo, conversationID: "dm_a_b")
    vm.start()
    repo.messagesFailed?(FakeError())
    XCTAssertNotNil(vm.loadErrorMessage)

    repo.failsToSend = true
    vm.draft = "hola"
    await vm.send()?.value
    repo.messagesChanged?(page([1], hasMore: false))

    XCTAssertNil(vm.loadErrorMessage)
    XCTAssertEqual(vm.sendErrorMessage, "Falló la prueba")
    XCTAssertEqual(vm.errorMessage, "Falló la prueba")
    XCTAssertEqual(vm.messages.map(\.id), ["m1"])
    vm.stop()
  }

  func testAMessageLoadErrorClearsAfterRecovery() {
    let repo = FakeChatRepo()
    let vm = ConversationViewModel(repo: repo, conversationID: "dm_a_b")
    vm.start()
    repo.messagesFailed?(FakeError())
    repo.messagesChanged?(page([1], hasMore: false))
    XCTAssertNil(vm.errorMessage)
    XCTAssertFalse(vm.isLoading)
    vm.stop()
  }

  func testOlderPagesPreserveRecentMessagesAndUseTheOldestCursor() async {
    let repo = FakeChatRepo()
    let vm = ConversationViewModel(repo: repo, conversationID: "dm_a_b")
    vm.start()
    repo.messagesChanged?(page(Array(51...100), hasMore: true))
    repo.olderPages = [page(Array(1...50), hasMore: true)]

    await vm.loadOlder()

    XCTAssertEqual(repo.olderRequests, [ChatMessageCursor(clientCreatedAt: 51, messageID: "m51")])
    XCTAssertEqual(vm.messages.count, 100)
    XCTAssertEqual(vm.messages.first?.id, "m1")
    XCTAssertEqual(vm.messages.last?.id, "m100")
    XCTAssertEqual(repo.observedBoundaries.last!, ChatMessageCursor(clientCreatedAt: 1, messageID: "m1"))

    // An empty page ends pagination without removing the opened history.
    await vm.loadOlder()
    XCTAssertFalse(vm.hasOlderMessages)
    XCTAssertEqual(vm.messages.count, 100)
    vm.stop()
  }

  func testNewMessagesArrivingDuringPaginationAreNotLost() async {
    let repo = FakeChatRepo()
    let vm = ConversationViewModel(repo: repo, conversationID: "dm_a_b")
    vm.start()
    repo.messagesChanged?(page([3, 4], hasMore: true))
    repo.olderHandler = {
      repo.messagesChanged?(self.page([3, 4, 5], hasMore: true))
      return self.page([1, 2], hasMore: false)
    }

    await vm.loadOlder()

    XCTAssertEqual(vm.messages.map(\.id), ["m1", "m2", "m3", "m4", "m5"])
    XCTAssertFalse(vm.hasOlderMessages)
    vm.stop()
  }

  func testAnOlderPageFailureCanBeRetriedWithoutLosingMessages() async {
    let repo = FakeChatRepo()
    let vm = ConversationViewModel(repo: repo, conversationID: "dm_a_b")
    vm.start()
    repo.messagesChanged?(page([2, 3], hasMore: true))
    repo.failsToLoadOlder = true
    await vm.loadOlder()
    XCTAssertNotNil(vm.historyErrorMessage)
    XCTAssertTrue(vm.hasOlderMessages)
    XCTAssertFalse(vm.isLoadingOlder)
    XCTAssertEqual(vm.messages.map(\.id), ["m2", "m3"])

    repo.failsToLoadOlder = false
    repo.olderPages = [page([1], hasMore: false)]
    await vm.loadOlder()
    XCTAssertNil(vm.historyErrorMessage)
    XCTAssertEqual(vm.messages.map(\.id), ["m1", "m2", "m3"])
    vm.stop()
  }

  func testAPartialCacheDoesNotFinalizeTheHistoryBoundary() {
    let repo = FakeChatRepo()
    let vm = ConversationViewModel(repo: repo, conversationID: "dm_a_b")
    vm.start()
    var cached = page([100], hasMore: false)
    cached.isFromCache = true
    repo.messagesChanged?(cached)
    XCTAssertEqual(vm.messages.map(\.id), ["m100"])
    XCTAssertFalse(vm.hasOlderMessages)

    repo.messagesChanged?(page(Array(51...100), hasMore: true))
    XCTAssertEqual(vm.messages.count, 50)
    XCTAssertTrue(vm.hasOlderMessages)
    vm.stop()
  }

  func testExpandedListenerRetainsHistoryThroughPartialCacheAndHonorsServerDeletions() async {
    let repo = FakeChatRepo()
    let vm = ConversationViewModel(repo: repo, conversationID: "dm_a_b")
    vm.start()
    repo.messagesChanged?(page([2, 3], hasMore: true))
    repo.olderPages = [page([1], hasMore: false)]
    await vm.loadOlder()

    var cached = page([3], hasMore: false)
    cached.isFromCache = true
    repo.messagesChanged?(cached)
    XCTAssertEqual(vm.messages.map(\.id), ["m1", "m2", "m3"])
    repo.messagesChanged?(page([1, 3], hasMore: false))
    XCTAssertEqual(vm.messages.map(\.id), ["m1", "m3"])
    vm.stop()
  }

  func testReceivingMessagesDoesNotMarkThemReadUntilTheyAreVisibleInTheActiveApp() async {
    let repo = FakeChatRepo()
    let vm = ConversationViewModel(repo: repo, conversationID: "dm_a_b")
    vm.start()
    repo.messagesChanged?(page([1, 2], hasMore: false))
    XCTAssertTrue(repo.readTimestamps.isEmpty)

    await vm.updateReadingContext(isActive: false, visibleLastMessageID: "m2")?.value
    await vm.updateReadingContext(isActive: true, visibleLastMessageID: nil)?.value
    await vm.updateReadingContext(isActive: true, visibleLastMessageID: "m1")?.value
    XCTAssertTrue(repo.readTimestamps.isEmpty)

    await vm.updateReadingContext(isActive: true, visibleLastMessageID: "m2")?.value
    await vm.updateReadingContext(isActive: true, visibleLastMessageID: "m2")?.value
    XCTAssertEqual(repo.readTimestamps.compactMap { $0 }, [2])

    repo.messagesChanged?(page([1, 2, 3], hasMore: false))
    // A previously visible bottom marker must not acknowledge the newly arrived row.
    await vm.updateReadingContext(isActive: true, visibleLastMessageID: "m2")?.value
    XCTAssertEqual(repo.readTimestamps.compactMap { $0 }, [2])
    await vm.updateReadingContext(isActive: true, visibleLastMessageID: "m3")?.value
    XCTAssertEqual(repo.readTimestamps.compactMap { $0 }, [2, 3])
    vm.stop()
  }

  func testStoppingPreventsQueuedReadAcknowledgementsAndOldListenerCallbacks() async {
    let repo = FakeChatRepo()
    let vm = ConversationViewModel(repo: repo, conversationID: "dm_a_b")
    vm.start()
    let oldCallback = repo.messagesChanged
    repo.messagesChanged?(page([1], hasMore: false))
    let markingRead = vm.updateReadingContext(isActive: true, visibleLastMessageID: "m1")
    vm.stop()
    await markingRead?.value
    XCTAssertTrue(repo.readTimestamps.isEmpty)

    vm.start()
    oldCallback?(page([2], hasMore: false))
    XCTAssertEqual(vm.messages.map(\.id), ["m1"])
    vm.stop()
  }

  private func page(_ numbers: [Int], hasMore: Bool) -> ChatMessagePage {
    let messages = numbers.map { number in
      ChatMessage(id: "m\(number)", senderID: "b", senderName: "Bruno", text: "Mensaje \(number)",
        hasAttachments: false, createdAt: Date(timeIntervalSince1970: Double(number) / 1000),
        clientCreatedAt: Int64(number))
    }
    return ChatMessagePage(messages: messages, oldestCursor: messages.first.map {
      ChatMessageCursor(clientCreatedAt: $0.clientCreatedAt, messageID: $0.id)
    }, hasMore: hasMore)
  }
}

@MainActor
final class ConversationsViewModelTests: XCTestCase {
  func testAListErrorKeepsExistingConversationsAndClearsOnRecovery() {
    let repo = FakeChatRepo()
    let vm = ConversationsViewModel(repo: repo)
    let conversation = ChatConversation(id: "dm_a_b", isGroup: false, title: "Bruno", photoURL: nil,
      otherUserID: "b", groupID: nil, lastMessageText: "Hola", lastMessageSenderID: "b", updatedAt: Date())
    vm.start()
    repo.conversationsChanged?([conversation])
    repo.conversationsFailed?(FakeError())
    XCTAssertEqual(vm.conversations, [conversation])
    XCTAssertNotNil(vm.errorMessage)
    repo.conversationsChanged?([conversation])
    XCTAssertNil(vm.errorMessage)
    vm.stop()
  }
}

final class ChatScrollStateTests: XCTestCase {
  func testIncomingMessagesDoNotInterruptReadingHistory() {
    var state = ChatScrollState()
    XCTAssertTrue(state.lastMessageChanged(previousID: nil, lastID: "m1", isSendingOwnMessage: false))
    state.updateBottom(isVisible: true, messageID: "m1")
    state.userDidScroll()
    state.updateBottom(isVisible: false, messageID: "m1")

    XCTAssertFalse(state.lastMessageChanged(previousID: "m1", lastID: "m2", isSendingOwnMessage: false))
    XCTAssertTrue(state.hasNewMessages)
    XCTAssertFalse(state.isAtBottom)
  }

  func testABurstOfMessagesFollowsTheLatestUntilTheUserScrolls() {
    var state = ChatScrollState()
    _ = state.lastMessageChanged(previousID: nil, lastID: "m1", isSendingOwnMessage: false)
    state.updateBottom(isVisible: true, messageID: "m1")
    // Layout may report the new bottom outside the viewport before onChange runs.
    state.updateBottom(isVisible: false, messageID: "m2")
    XCTAssertTrue(state.lastMessageChanged(previousID: "m1", lastID: "m2", isSendingOwnMessage: false))
    state.updateBottom(isVisible: false, messageID: "m2")
    XCTAssertTrue(state.lastMessageChanged(previousID: "m2", lastID: "m3", isSendingOwnMessage: false))

    state.userDidScroll()
    XCTAssertFalse(state.lastMessageChanged(previousID: "m3", lastID: "m4", isSendingOwnMessage: false))
    state.updateBottom(isVisible: true, messageID: "m4")
    XCTAssertFalse(state.hasNewMessages)
  }
}

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
}

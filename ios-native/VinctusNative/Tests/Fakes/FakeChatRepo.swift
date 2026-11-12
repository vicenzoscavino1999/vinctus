import Foundation
@testable import VinctusNative

final class FakeChatRepo: ChatRepo {
  var sentTexts: [String] = []
  var failsToSend = false
  var sendHandler: (() async throws -> Void)?
  var conversationsChanged: (([ChatConversation]) -> Void)?
  var conversationsFailed: ((Error) -> Void)?
  var messagesChanged: ((ChatMessagePage) -> Void)?
  var messagesFailed: ((Error) -> Void)?
  var observedBoundaries: [ChatMessageCursor?] = []
  var olderPages: [ChatMessagePage] = []
  var olderRequests: [ChatMessageCursor] = []
  var failsToLoadOlder = false
  var olderHandler: (() async throws -> ChatMessagePage)?
  var readTimestamps: [Int64?] = []
  var failsToMarkRead = false
  var sentAttachments: [[ChatPendingAttachment]] = []
  var sentClientIDs: [String] = []

  func observeConversations(
    onChange: @escaping ([ChatConversation]) -> Void,
    onError: @escaping (Error) -> Void
  ) -> ChatSubscription {
    conversationsChanged = onChange
    conversationsFailed = onError
    return ChatSubscription {}
  }

  func observeMessages(
    conversationID: String,
    through cursor: ChatMessageCursor?,
    onChange: @escaping (ChatMessagePage) -> Void,
    onError: @escaping (Error) -> Void
  ) -> ChatSubscription {
    observedBoundaries.append(cursor)
    messagesChanged = onChange
    messagesFailed = onError
    return ChatSubscription {}
  }

  func fetchOlderMessages(conversationID: String, before cursor: ChatMessageCursor) async throws -> ChatMessagePage {
    olderRequests.append(cursor)
    if let olderHandler { return try await olderHandler() }
    if failsToLoadOlder { throw FakeError() }
    return olderPages.isEmpty
      ? ChatMessagePage(messages: [], oldestCursor: nil, hasMore: false)
      : olderPages.removeFirst()
  }

  func sendMessage(conversationID: String, text: String, attachments: [ChatPendingAttachment],
                   clientID: String, onProgress: @escaping (Double) -> Void) async throws {
    sentClientIDs.append(clientID)
    if let sendHandler { try await sendHandler() }
    if failsToSend { throw FakeError() }
    sentTexts.append(text)
    sentAttachments.append(attachments)
    onProgress(1)
  }

  var failsToOpen = false

  func markRead(conversationID: String, through clientCreatedAt: Int64?) async throws {
    if failsToMarkRead { throw FakeError() }
    readTimestamps.append(clientCreatedAt)
  }

  func openDirectConversation(with otherUserID: String) async throws -> String {
    if failsToOpen { throw FakeError() }
    return "dm_\(otherUserID)"
  }

  func openGroupConversation(groupID: String) async throws -> String {
    if failsToOpen { throw FakeError() }
    return "grp_\(groupID)"
  }
}

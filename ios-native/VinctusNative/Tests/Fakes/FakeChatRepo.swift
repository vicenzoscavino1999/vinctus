import Foundation
@testable import VinctusNative

final class FakeChatRepo: ChatRepo {
  var sentTexts: [String] = []
  var failsToSend = false

  func observeConversations(
    onChange: @escaping ([ChatConversation]) -> Void,
    onError: @escaping (Error) -> Void
  ) -> ChatSubscription {
    ChatSubscription {}
  }

  func observeMessages(
    conversationID: String,
    onChange: @escaping ([ChatMessage]) -> Void,
    onError: @escaping (Error) -> Void
  ) -> ChatSubscription {
    ChatSubscription {}
  }

  func sendMessage(conversationID: String, text: String) async throws {
    if failsToSend { throw FakeError() }
    sentTexts.append(text)
  }

  var failsToOpen = false

  func markRead(conversationID: String) async {}

  func openDirectConversation(with otherUserID: String) async throws -> String {
    if failsToOpen { throw FakeError() }
    return "dm_\(otherUserID)"
  }

  func openGroupConversation(groupID: String) async throws -> String {
    if failsToOpen { throw FakeError() }
    return "grp_\(groupID)"
  }
}

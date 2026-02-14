import Foundation

struct ChatPublicUser: Identifiable, Hashable {
  let uid: String
  let displayName: String
  let photoURL: String?

  var id: String { uid }
}

struct DirectConversationSummary: Identifiable, Hashable {
  let id: String
  let otherUID: String
  let lastMessageText: String
  let lastMessageSenderID: String?
  let lastMessageCreatedAt: Date?
  let createdAt: Date
  let updatedAt: Date
}

struct DirectMessage: Identifiable, Hashable {
  let id: String
  let senderID: String
  let senderName: String?
  let senderPhotoURL: String?
  let text: String
  let createdAt: Date
  let clientCreatedAt: Int
  let clientID: String
}

protocol ChatRepo {
  func subscribeToDirectConversations(
    uid: String,
    limit: Int,
    onUpdate: @escaping ([DirectConversationSummary]) -> Void,
    onError: @escaping (Error) -> Void
  ) -> () -> Void

  func subscribeToMessages(
    conversationID: String,
    limit: Int,
    onUpdate: @escaping ([DirectMessage]) -> Void,
    onError: @escaping (Error) -> Void
  ) -> () -> Void

  func getOrCreateDirectConversation(currentUID: String, otherUID: String) async throws -> String

  func sendMessage(
    conversationID: String,
    senderUID: String,
    senderName: String?,
    senderPhotoURL: String?,
    text: String
  ) async throws

  func fetchPublicUser(uid: String) async throws -> ChatPublicUser?
}

enum ChatRepoError: LocalizedError {
  case firebaseNotConfigured
  case invalidConversationMembers
  case emptyMessage

  var errorDescription: String? {
    switch self {
    case .firebaseNotConfigured:
      return "Firebase no esta configurado."
    case .invalidConversationMembers:
      return "No se pudo determinar la conversacion privada."
    case .emptyMessage:
      return "El mensaje no puede estar vacio."
    }
  }
}

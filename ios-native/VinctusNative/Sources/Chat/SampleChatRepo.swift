import Foundation

// Screenshot builds only (see App/DemoData.swift).

#if SCREENSHOTS
struct SampleChatRepo: ChatRepo {
  func observeConversations(
    onChange: @escaping ([ChatConversation]) -> Void,
    onError: @escaping (Error) -> Void
  ) -> ChatSubscription {
    let now = Date()
    onChange([
      ChatConversation(
        id: "dm_me_u2", isGroup: false, title: "Mateo Rojas", photoURL: nil, otherUserID: "u2",
        groupID: nil, lastMessageText: "¡Nos vemos en el observatorio el sábado!",
        lastMessageSenderID: "u2", updatedAt: now.addingTimeInterval(-300)
      ),
      ChatConversation(
        id: "grp_g2", isGroup: true, title: "Jazz y café", photoURL: nil, otherUserID: nil,
        groupID: "g2", lastMessageText: "Valentina: Dejo la lista de discos de la semana",
        lastMessageSenderID: "u3", updatedAt: now.addingTimeInterval(-3600)
      ),
      ChatConversation(
        id: "dm_me_u4", isGroup: false, title: "Diego Salazar", photoURL: nil, otherUserID: "u4",
        groupID: nil, lastMessageText: "Te paso los archivos de la impresora 3D",
        lastMessageSenderID: "me", updatedAt: now.addingTimeInterval(-86_400)
      ),
    ])
    return ChatSubscription {}
  }

  func observeMessages(
    conversationID: String,
    onChange: @escaping ([ChatMessage]) -> Void,
    onError: @escaping (Error) -> Void
  ) -> ChatSubscription {
    let now = Date()
    onChange([
      ChatMessage(id: "m1", senderID: "u2", senderName: "Mateo Rojas", text: "¿Viste la luna anoche?", hasAttachments: false, createdAt: now.addingTimeInterval(-900)),
      ChatMessage(id: "m2", senderID: "me", senderName: "Yo", text: "¡Sí! Se veía enorme 🌕", hasAttachments: false, createdAt: now.addingTimeInterval(-800)),
      ChatMessage(id: "m3", senderID: "u2", senderName: "Mateo Rojas", text: "¡Nos vemos en el observatorio el sábado!", hasAttachments: false, createdAt: now.addingTimeInterval(-300)),
    ])
    return ChatSubscription {}
  }

  func sendMessage(conversationID: String, text: String) async throws {}
  func markRead(conversationID: String) async {}
  func openDirectConversation(with otherUserID: String) async throws -> String { "dm_me_\(otherUserID)" }
  func openGroupConversation(groupID: String) async throws -> String { "grp_\(groupID)" }
}
#endif

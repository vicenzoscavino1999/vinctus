import Foundation

extension FirebaseChatRepo {
  static func parseDirectMessage(documentID: String, data: [String: Any]) -> DirectMessage {
    DirectMessage(
      id: documentID,
      senderID: FirestoreHelpers.nonEmptyString(data["senderId"]) ?? "",
      senderName: FirestoreHelpers.nonEmptyString(data["senderName"]),
      senderPhotoURL: FirestoreHelpers.nonEmptyString(data["senderPhotoURL"]),
      text: (data["text"] as? String) ?? "",
      createdAt: FirestoreHelpers.dateValue(data["createdAt"]) ?? Date(),
      clientCreatedAt: data["clientCreatedAt"] as? Int ?? 0,
      clientID: FirestoreHelpers.nonEmptyString(data["clientId"]) ?? documentID
    )
  }

  static func parseDirectConversation(
    conversationID: String,
    currentUID: String,
    data: [String: Any]
  ) -> DirectConversationSummary? {
    let type = FirestoreHelpers.nonEmptyString(data["type"]) ?? ""
    guard type == "direct" else { return nil }

    let memberIDs = (data["memberIds"] as? [String]) ?? []
    let otherUIDFromMembers = memberIDs.first(where: { $0 != currentUID })
    let otherUID = otherUIDFromMembers
      ?? parseOtherUID(from: conversationID, currentUID: currentUID)
    guard let otherUID else { return nil }

    let lastMessageData = data["lastMessage"] as? [String: Any]
    let lastMessageText = FirestoreHelpers.nonEmptyString(lastMessageData?["text"]) ?? ""
    let lastMessageSenderID = FirestoreHelpers.nonEmptyString(lastMessageData?["senderId"])
    let lastMessageCreatedAt = FirestoreHelpers.dateValue(lastMessageData?["createdAt"])
    let createdAt = FirestoreHelpers.dateValue(data["createdAt"]) ?? Date()
    let updatedAt = FirestoreHelpers.dateValue(data["updatedAt"]) ?? createdAt

    return DirectConversationSummary(
      id: conversationID,
      otherUID: otherUID,
      lastMessageText: lastMessageText,
      lastMessageSenderID: lastMessageSenderID,
      lastMessageCreatedAt: lastMessageCreatedAt,
      createdAt: createdAt,
      updatedAt: updatedAt
    )
  }

  static func parsePublicUser(uid: String, data: [String: Any]?) -> ChatPublicUser? {
    guard let data else { return nil }
    let displayName = FirestoreHelpers.nonEmptyString(data["displayName"])
      ?? FirestoreHelpers.nonEmptyString(data["username"])
      ?? "Usuario"
    return ChatPublicUser(
      uid: uid,
      displayName: displayName,
      photoURL: FirestoreHelpers.nonEmptyString(data["photoURL"])
    )
  }

  private static func parseOtherUID(from conversationID: String, currentUID: String) -> String? {
    guard conversationID.hasPrefix("dm_") else { return nil }
    let members = conversationID
      .replacingOccurrences(of: "dm_", with: "")
      .split(separator: "_")
      .map(String.init)
    return members.first(where: { $0 != currentUID })
  }
}

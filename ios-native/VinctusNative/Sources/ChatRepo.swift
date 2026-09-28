import FirebaseAuth
import FirebaseCore
import FirebaseFirestore
import Foundation

struct ChatConversation: Identifiable, Hashable {
  let id: String
  let isGroup: Bool
  let title: String
  let photoURL: String?
  /// The other person in a direct conversation.
  let otherUserID: String?
  let groupID: String?
  let lastMessageText: String?
  let lastMessageSenderID: String?
  let updatedAt: Date
}

struct ChatMessage: Identifiable, Hashable {
  let id: String
  let senderID: String
  let senderName: String?
  let text: String
  let hasAttachments: Bool
  let createdAt: Date
}

/// Cancels the Firestore listeners behind an observation when released or cancelled.
final class ChatSubscription {
  private var onCancel: (() -> Void)?

  init(_ onCancel: @escaping () -> Void) {
    self.onCancel = onCancel
  }

  func cancel() {
    onCancel?()
    onCancel = nil
  }

  deinit {
    cancel()
  }
}

protocol ChatRepo {
  func observeConversations(
    onChange: @escaping ([ChatConversation]) -> Void,
    onError: @escaping (Error) -> Void
  ) -> ChatSubscription
  func observeMessages(
    conversationID: String,
    onChange: @escaping ([ChatMessage]) -> Void,
    onError: @escaping (Error) -> Void
  ) -> ChatSubscription
  func sendMessage(conversationID: String, text: String) async throws
  func markRead(conversationID: String) async
  func openDirectConversation(with otherUserID: String) async throws -> String
  func openGroupConversation(groupID: String) async throws -> String
}

enum ChatRepoError: LocalizedError {
  case firebaseNotConfigured
  case userNotAuthenticated
  case emptyMessage
  case messageTooLong
  case cannotStartConversation

  var errorDescription: String? {
    switch self {
    case .firebaseNotConfigured:
      return "Firebase no está configurado."
    case .userNotAuthenticated:
      return "Debes iniciar sesión."
    case .emptyMessage:
      return "Escribe un mensaje."
    case .messageTooLong:
      return "El mensaje es demasiado largo."
    case .cannotStartConversation:
      return "Solo puedes escribirle a alguien que sigues o que te sigue, y que no te haya bloqueado."
    }
  }
}

/// Messaging over the same Firestore data as the web (`src/shared/lib/firestore/messaging.ts`):
/// `conversations/{dm_a_b | grp_groupId}` with `members` and `messages`, plus the per-user
/// `directConversations` and `memberships` indexes that list a user's conversations.
final class FirebaseChatRepo: ChatRepo {
  /// Same limit as `isValidMessageCreate` in firestore.rules.
  static let maxMessageLength = 4000
  private static let listLimit = 50

  private var senderProfile: (name: String?, photoURL: String?)?

  private func context() throws -> (Firestore, String) {
    guard FirebaseApp.app() != nil else { throw ChatRepoError.firebaseNotConfigured }
    guard let uid = Auth.auth().currentUser?.uid else { throw ChatRepoError.userNotAuthenticated }
    return (Firestore.firestore(), uid)
  }

  // MARK: Conversation list

  func observeConversations(
    onChange: @escaping ([ChatConversation]) -> Void,
    onError: @escaping (Error) -> Void
  ) -> ChatSubscription {
    let session: (Firestore, String)
    do {
      session = try context()
    } catch {
      onError(error)
      return ChatSubscription {}
    }
    let (db, uid) = session
    let observer = ConversationListObserver(db: db, uid: uid, onChange: onChange, onError: onError)
    observer.start(limit: Self.listLimit)
    return ChatSubscription { observer.stop() }
  }

  // MARK: Messages

  func observeMessages(
    conversationID: String,
    onChange: @escaping ([ChatMessage]) -> Void,
    onError: @escaping (Error) -> Void
  ) -> ChatSubscription {
    guard FirebaseApp.app() != nil else {
      onError(ChatRepoError.firebaseNotConfigured)
      return ChatSubscription {}
    }
    let registration = Firestore.firestore()
      .collection("conversations").document(conversationID).collection("messages")
      .order(by: "clientCreatedAt", descending: true)
      .limit(to: Self.listLimit)
      .addSnapshotListener { snapshot, error in
        if let error {
          onError(error)
          return
        }
        let messages = (snapshot?.documents ?? []).compactMap(Self.message(from:))
        onChange(messages.reversed())
      }
    return ChatSubscription { registration.remove() }
  }

  func sendMessage(conversationID: String, text: String) async throws {
    let (db, uid) = try context()
    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { throw ChatRepoError.emptyMessage }
    guard trimmed.count <= Self.maxMessageLength else { throw ChatRepoError.messageTooLong }

    let profile = try await currentSenderProfile(db: db, uid: uid)
    let now = Int64(Date().timeIntervalSince1970 * 1000)
    // Deterministic id, like the web, so a retried write doesn't duplicate the message.
    let clientID = "\(uid)_\(now)_\(UUID().uuidString.prefix(8).lowercased())"
    let conversation = db.collection("conversations").document(conversationID)

    let batch = db.batch()
    batch.setData(
      [
        "senderId": uid,
        "senderName": profile.name ?? NSNull(),
        "senderPhotoURL": profile.photoURL ?? NSNull(),
        "text": trimmed,
        "createdAt": FieldValue.serverTimestamp(),
        "clientCreatedAt": now,
        "clientId": clientID,
      ],
      forDocument: conversation.collection("messages").document(clientID)
    )
    batch.updateData(
      [
        "lastMessage": [
          "text": trimmed,
          "senderId": uid,
          "senderName": profile.name ?? NSNull(),
          "senderPhotoURL": profile.photoURL ?? NSNull(),
          "createdAt": FieldValue.serverTimestamp(),
          "clientCreatedAt": now,
        ],
        "updatedAt": FieldValue.serverTimestamp(),
      ],
      forDocument: conversation
    )
    try await batch.commit()
  }

  func markRead(conversationID: String) async {
    guard let session = try? context() else { return }
    let (db, uid) = session
    try? await db.collection("conversations").document(conversationID)
      .collection("members").document(uid)
      .updateData([
        "lastReadClientAt": Int64(Date().timeIntervalSince1970 * 1000),
        "lastReadAt": FieldValue.serverTimestamp(),
      ])
  }

  // MARK: Opening conversations

  func openDirectConversation(with otherUserID: String) async throws -> String {
    let (db, uid) = try context()
    let memberIDs = [uid, otherUserID].sorted()
    let conversationID = "dm_" + memberIDs.joined(separator: "_")
    let conversation = db.collection("conversations").document(conversationID)

    // The read is denied while the conversation doesn't exist, so a failure means "create it".
    let exists = (try? await conversation.getDocument().exists) ?? false
    if !exists {
      do {
        try await conversation.setData([
          "type": "direct",
          "memberIds": memberIDs,
          "lastMessage": NSNull(),
          "createdAt": FieldValue.serverTimestamp(),
          "updatedAt": FieldValue.serverTimestamp(),
        ])
      } catch {
        // The rules only allow it between people who follow each other and haven't blocked.
        throw ChatRepoError.cannotStartConversation
      }
    }

    for memberID in memberIDs {
      try await ensureMember(memberID, in: conversation)
    }
    for (owner, other) in [(memberIDs[0], memberIDs[1]), (memberIDs[1], memberIDs[0])] {
      try? await db.collection("users").document(owner)
        .collection("directConversations").document(conversationID)
        .setData(
          [
            "conversationId": conversationID,
            "otherUid": other,
            "type": "direct",
            "updatedAt": FieldValue.serverTimestamp(),
          ],
          merge: true
        )
    }
    return conversationID
  }

  func openGroupConversation(groupID: String) async throws -> String {
    let (db, uid) = try context()
    let conversationID = "grp_\(groupID)"
    let conversation = db.collection("conversations").document(conversationID)
    let exists = (try? await conversation.getDocument().exists) ?? false
    if !exists {
      try? await conversation.setData([
        "type": "group",
        "groupId": groupID,
        "lastMessage": NSNull(),
        "createdAt": FieldValue.serverTimestamp(),
        "updatedAt": FieldValue.serverTimestamp(),
      ])
    }
    try await ensureMember(uid, in: conversation)
    return conversationID
  }

  private func ensureMember(_ memberID: String, in conversation: DocumentReference) async throws {
    let member = conversation.collection("members").document(memberID)
    if (try? await member.getDocument().exists) == true { return }
    try await member.setData([
      "uid": memberID,
      "role": "member",
      "joinedAt": FieldValue.serverTimestamp(),
      "lastReadClientAt": Int64(Date().timeIntervalSince1970 * 1000),
      "lastReadAt": FieldValue.serverTimestamp(),
      "muted": false,
      "mutedUntil": NSNull(),
    ])
  }

  private func currentSenderProfile(db: Firestore, uid: String) async throws -> (name: String?, photoURL: String?) {
    if let senderProfile { return senderProfile }
    let data = (try? await db.collection("users_public").document(uid).getDocument().data()) ?? [:]
    let user = Auth.auth().currentUser
    let profile = (
      name: (data["displayName"] as? String) ?? user?.displayName,
      photoURL: (data["photoURL"] as? String) ?? user?.photoURL?.absoluteString
    )
    senderProfile = profile
    return profile
  }

  static func message(from document: QueryDocumentSnapshot) -> ChatMessage? {
    let data = document.data()
    guard let senderID = data["senderId"] as? String else { return nil }
    let createdAt = (data["createdAt"] as? Timestamp)?.dateValue()
      ?? (data["clientCreatedAt"] as? NSNumber).map { Date(timeIntervalSince1970: $0.doubleValue / 1000) }
      ?? Date()
    let attachments = data["attachments"] as? [Any] ?? []
    return ChatMessage(
      id: document.documentID,
      senderID: senderID,
      senderName: data["senderName"] as? String,
      text: data["text"] as? String ?? "",
      hasAttachments: !attachments.isEmpty,
      createdAt: createdAt
    )
  }
}

/// Listens to the user's direct-conversation and group-membership indexes and to every
/// conversation they point at, and reports the merged, newest-first list.
private final class ConversationListObserver {
  private let db: Firestore
  private let uid: String
  private let onChange: ([ChatConversation]) -> Void
  private let onError: (Error) -> Void

  private var indexListeners: [ListenerRegistration] = []
  private var conversationListeners: [String: ListenerRegistration] = [:]
  private var conversations: [String: ChatConversation] = [:]
  private var directOtherUser: [String: String] = [:]
  private var directIDs: Set<String> = []
  private var groupIDs: Set<String> = []
  private var titles: [String: (title: String, photoURL: String?)] = [:]

  init(
    db: Firestore,
    uid: String,
    onChange: @escaping ([ChatConversation]) -> Void,
    onError: @escaping (Error) -> Void
  ) {
    self.db = db
    self.uid = uid
    self.onChange = onChange
    self.onError = onError
  }

  func start(limit: Int) {
    let user = db.collection("users").document(uid)
    indexListeners.append(
      user.collection("directConversations")
        .order(by: "updatedAt", descending: true)
        .limit(to: limit)
        .addSnapshotListener { [weak self] snapshot, error in
          guard let self else { return }
          if let error {
            self.onError(error)
            return
          }
          var next: Set<String> = []
          for document in snapshot?.documents ?? [] where document.documentID.hasPrefix("dm_") {
            next.insert(document.documentID)
            if let other = document.data()["otherUid"] as? String {
              self.directOtherUser[document.documentID] = other
            }
          }
          self.directIDs = self.sync(ids: next, previous: self.directIDs)
        }
    )
    indexListeners.append(
      user.collection("memberships")
        .order(by: "joinedAt", descending: true)
        .limit(to: limit)
        .addSnapshotListener { [weak self] snapshot, error in
          guard let self else { return }
          if let error {
            self.onError(error)
            return
          }
          let next = Set((snapshot?.documents ?? []).map { "grp_\($0.documentID)" })
          self.groupIDs = self.sync(ids: next, previous: self.groupIDs)
        }
    )
  }

  func stop() {
    indexListeners.forEach { $0.remove() }
    indexListeners.removeAll()
    conversationListeners.values.forEach { $0.remove() }
    conversationListeners.removeAll()
  }

  /// Starts and stops conversation listeners for an index change; returns the new id set.
  private func sync(ids next: Set<String>, previous: Set<String>) -> Set<String> {
    for removed in previous.subtracting(next) {
      conversationListeners.removeValue(forKey: removed)?.remove()
      conversations.removeValue(forKey: removed)
    }
    for added in next.subtracting(previous) {
      listen(to: added)
    }
    emit()
    return next
  }

  private func listen(to conversationID: String) {
    conversationListeners[conversationID] = db.collection("conversations").document(conversationID)
      .addSnapshotListener { [weak self] snapshot, _ in
        guard let self else { return }
        guard let snapshot, snapshot.exists, let data = snapshot.data() else {
          self.conversations.removeValue(forKey: conversationID)
          self.emit()
          return
        }
        self.update(conversationID: conversationID, data: data)
      }
  }

  private func update(conversationID: String, data: [String: Any]) {
    let isGroup = conversationID.hasPrefix("grp_")
    let groupID = isGroup ? (data["groupId"] as? String ?? String(conversationID.dropFirst(4))) : nil
    let memberIDs = data["memberIds"] as? [String] ?? []
    let otherUserID = isGroup
      ? nil
      : directOtherUser[conversationID] ?? memberIDs.first(where: { $0 != uid })
    let lastMessage = data["lastMessage"] as? [String: Any]
    let updatedAt = (data["updatedAt"] as? Timestamp)?.dateValue() ?? Date.distantPast
    let titleKey = isGroup ? "group:\(groupID ?? "")" : "user:\(otherUserID ?? "")"
    let cached = titles[titleKey]

    conversations[conversationID] = ChatConversation(
      id: conversationID,
      isGroup: isGroup,
      title: cached?.title ?? (isGroup ? "Grupo" : "Usuario"),
      photoURL: cached?.photoURL,
      otherUserID: otherUserID,
      groupID: groupID,
      lastMessageText: lastMessage?["text"] as? String,
      lastMessageSenderID: lastMessage?["senderId"] as? String,
      updatedAt: updatedAt
    )
    emit()

    if cached == nil {
      Task { [weak self] in
        await self?.loadTitle(key: titleKey, isGroup: isGroup, id: isGroup ? groupID : otherUserID)
      }
    }
  }

  @MainActor
  private func loadTitle(key: String, isGroup: Bool, id: String?) async {
    guard let id, titles[key] == nil else { return }
    let path = isGroup ? db.collection("groups").document(id) : db.collection("users_public").document(id)
    let data = (try? await path.getDocument().data()) ?? [:]
    let title = (isGroup ? data["name"] : data["displayName"]) as? String
    let photo = (isGroup ? data["iconUrl"] : data["photoURL"]) as? String
    titles[key] = (title ?? (isGroup ? "Grupo" : "Usuario"), photo)
    for (conversationID, conversation) in conversations {
      let conversationKey = conversation.isGroup
        ? "group:\(conversation.groupID ?? "")"
        : "user:\(conversation.otherUserID ?? "")"
      guard conversationKey == key else { continue }
      conversations[conversationID] = ChatConversation(
        id: conversation.id, isGroup: conversation.isGroup, title: titles[key]!.title,
        photoURL: titles[key]!.photoURL, otherUserID: conversation.otherUserID,
        groupID: conversation.groupID, lastMessageText: conversation.lastMessageText,
        lastMessageSenderID: conversation.lastMessageSenderID, updatedAt: conversation.updatedAt
      )
    }
    emit()
  }

  private func emit() {
    onChange(conversations.values.sorted { $0.updatedAt > $1.updatedAt })
  }
}

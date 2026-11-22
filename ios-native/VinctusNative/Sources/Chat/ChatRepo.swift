import FirebaseAuth
import FirebaseCore
import FirebaseFirestore
import FirebaseStorage
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
  let clientCreatedAt: Int64
  let attachments: [ChatAttachment]

  init(id: String, senderID: String, senderName: String?, text: String, hasAttachments: Bool,
       createdAt: Date, clientCreatedAt: Int64? = nil, attachments: [ChatAttachment] = []) {
    self.id = id
    self.senderID = senderID
    self.senderName = senderName
    self.text = text
    self.hasAttachments = hasAttachments || !attachments.isEmpty
    self.attachments = attachments
    self.createdAt = createdAt
    self.clientCreatedAt = clientCreatedAt ?? Int64(createdAt.timeIntervalSince1970 * 1000)
  }
}

/// Both fields are needed when multiple messages have the same client timestamp.
struct ChatMessageCursor: Equatable {
  let clientCreatedAt: Int64
  let messageID: String
}

struct ChatMessagePage {
  let messages: [ChatMessage]
  let oldestCursor: ChatMessageCursor?
  let hasMore: Bool
  var isFromCache = false
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
    through cursor: ChatMessageCursor?,
    onChange: @escaping (ChatMessagePage) -> Void,
    onError: @escaping (Error) -> Void
  ) -> ChatSubscription
  func fetchOlderMessages(conversationID: String, before cursor: ChatMessageCursor) async throws -> ChatMessagePage
  func sendMessage(conversationID: String, text: String, attachments: [ChatPendingAttachment],
                   clientID: String, onProgress: @escaping (Double) -> Void) async throws
  func markRead(conversationID: String, through clientCreatedAt: Int64?) async throws
  func openDirectConversation(with otherUserID: String) async throws -> String
  func openGroupConversation(groupID: String) async throws -> String
}

extension ChatRepo {
  func markRead(conversationID: String) async throws {
    try await markRead(conversationID: conversationID, through: nil)
  }

  func sendMessage(conversationID: String, text: String) async throws {
    try await sendMessage(conversationID: conversationID, text: text, attachments: [],
      clientID: UUID().uuidString, onProgress: { _ in })
  }
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
  static let maxMessageLength = Limits.Messages.textMaxLength
  private static let listLimit = 50

  /// How long the sender's name and photo are reused before reading them again, so a profile edit
  /// shows up in new messages without reading the profile for every message sent.
  static let senderProfileLifetime: TimeInterval = 5 * 60

  private var senderProfile: (uid: String, name: String?, photoURL: String?, loadedAt: Date)?

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
    observer.start()
    return ChatSubscription { observer.stop() }
  }

  // MARK: Messages

  func observeMessages(
    conversationID: String,
    through cursor: ChatMessageCursor?,
    onChange: @escaping (ChatMessagePage) -> Void,
    onError: @escaping (Error) -> Void
  ) -> ChatSubscription {
    guard FirebaseApp.app() != nil else {
      onError(ChatRepoError.firebaseNotConfigured)
      return ChatSubscription {}
    }
    var query = messagesQuery(conversationID: conversationID)
    if let cursor {
      // Keep the entire opened window live, so new messages cannot push its oldest rows out.
      query = query.end(at: [cursor.clientCreatedAt, cursor.messageID])
    } else {
      query = query.limit(to: Self.listLimit)
    }
    let registration = query.addSnapshotListener(includeMetadataChanges: true) { snapshot, error in
      if let error {
        onError(error)
        return
      }
      guard let snapshot else { return }
      onChange(Self.messagePage(documents: snapshot.documents, isFromCache: snapshot.metadata.isFromCache))
    }
    return ChatSubscription { registration.remove() }
  }

  func fetchOlderMessages(conversationID: String, before cursor: ChatMessageCursor) async throws -> ChatMessagePage {
    _ = try context()
    let snapshot = try await messagesQuery(conversationID: conversationID)
      .start(after: [cursor.clientCreatedAt, cursor.messageID])
      .limit(to: Self.listLimit)
      .getDocuments(source: .server)
    return Self.messagePage(documents: snapshot.documents)
  }

  private func messagesQuery(conversationID: String) -> Query {
    Firestore.firestore()
      .collection(FirestoreCollections.conversations).document(conversationID)
      .collection(FirestoreSubcollections.messages)
      .order(by: "clientCreatedAt", descending: true)
      .order(by: FieldPath.documentID(), descending: true)
  }

  private static func messagePage(documents: [QueryDocumentSnapshot], isFromCache: Bool = false) -> ChatMessagePage {
    let oldestCursor = documents.last.flatMap { document -> ChatMessageCursor? in
      guard let timestamp = document.data()["clientCreatedAt"] as? NSNumber else { return nil }
      return ChatMessageCursor(clientCreatedAt: timestamp.int64Value, messageID: document.documentID)
    }
    return ChatMessagePage(
      messages: documents.compactMap(Self.message(from:)).reversed(),
      oldestCursor: oldestCursor,
      hasMore: documents.count >= Self.listLimit,
      isFromCache: isFromCache
    )
  }

  func sendMessage(conversationID: String, text: String, attachments: [ChatPendingAttachment],
                   clientID: String, onProgress: @escaping (Double) -> Void) async throws {
    let (db, uid) = try context()
    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty || !attachments.isEmpty else { throw ChatRepoError.emptyMessage }
    guard trimmed.count <= Self.maxMessageLength else { throw ChatRepoError.messageTooLong }
    guard attachments.count <= 10 else { throw ChatMediaError.tooManyAttachments }
    for attachment in attachments { try attachment.validate() }

    let conversation = db.collection(FirestoreCollections.conversations).document(conversationID)
    let message = conversation.collection(FirestoreSubcollections.messages).document(clientID)
    // A failed acknowledgement can follow a successful commit. Reuse the outbox ID on retry
    // and check the server before uploading again; immutable messages cannot be overwritten.
    let existing = try await message.getDocument(source: .server)
    if let data = existing.data() {
      guard data["senderId"] as? String == uid, data["text"] as? String == trimmed else {
        throw ChatMediaError.invalidAttachment
      }
      onProgress(1)
      return
    }

    let profile = try await currentSenderProfile(db: db, uid: uid)
    let now = Int64(Date().timeIntervalSince1970 * 1000)
    var uploaded: [ChatAttachment] = []
    let totalBytes = max(1, attachments.reduce(0) { $0 + $1.size })
    var completedBytes = 0
    for attachment in attachments {
      let completed = completedBytes
      let result = try await upload(attachment, conversationID: conversationID, uid: uid, messageID: clientID) { fraction in
        onProgress(Double(completed) / Double(totalBytes) + fraction * Double(attachment.size) / Double(totalBytes))
      }
      uploaded.append(result)
      completedBytes += attachment.size
    }
    // The signed-in account may change while a large file uploads.
    guard Auth.auth().currentUser?.uid == uid else { throw ChatRepoError.userNotAuthenticated }

    let batch = db.batch()
    var payload: [String: Any] = [
        "senderId": uid,
        "senderName": profile.name ?? NSNull(),
        "senderPhotoURL": profile.photoURL ?? NSNull(),
        "text": trimmed,
        "createdAt": FieldValue.serverTimestamp(),
        "clientCreatedAt": now,
        "clientId": clientID,
      ]
    if !uploaded.isEmpty { payload["attachments"] = uploaded.map(\.fields) }
    batch.setData(payload, forDocument: message)
    batch.updateData(
      [
        "lastMessage": [
          "text": Self.preview(text: trimmed, attachments: uploaded),
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
    onProgress(1)
  }

  private func upload(_ file: ChatPendingAttachment, conversationID: String, uid: String,
                      messageID: String, onProgress: @escaping (Double) -> Void) async throws -> ChatAttachment {
    let path = StoragePaths.conversationAttachment(conversationID: conversationID, userID: uid,
      messageID: messageID, filename: file.id + "." + file.fileURL.pathExtension)
    let ref = Storage.storage().reference(withPath: path)
    do {
      _ = try await ref.getMetadata()
    } catch let error as NSError where error.domain == StorageErrorDomain && error.code == StorageErrorCode.objectNotFound.rawValue {
      let metadata = StorageMetadata()
      metadata.contentType = file.contentType
      _ = try await ref.putFileAsync(from: file.fileURL, metadata: metadata) { progress in
        onProgress(progress?.fractionCompleted ?? 0)
      }
    }
    let url = try await ref.downloadURL()
    return ChatAttachment(kind: file.kind == .image ? "image" : "file", url: url.absoluteString,
      path: path, fileName: file.fileName, contentType: file.contentType, size: file.size)
  }

  static func preview(text: String, attachments: [ChatAttachment]) -> String {
    if !text.isEmpty { return text }
    if attachments.count > 1 { return "Adjuntos (\(attachments.count))" }
    return attachments.first?.label ?? ""
  }

  func markRead(conversationID: String, through clientCreatedAt: Int64?) async throws {
    let (db, uid) = try context()
    let member = db.collection(FirestoreCollections.conversations).document(conversationID)
      .collection(FirestoreSubcollections.members).document(uid)
    let timestamp = clientCreatedAt ?? Int64(Date().timeIntervalSince1970 * 1000)
    _ = try await db.runTransaction { transaction, errorPointer in
      do {
        let snapshot = try transaction.getDocument(member)
        let previous = (snapshot.data()?["lastReadClientAt"] as? NSNumber)?.int64Value ?? 0
        if snapshot.exists {
          if timestamp > previous {
            transaction.updateData(["lastReadClientAt": timestamp, "lastReadAt": FieldValue.serverTimestamp()], forDocument: member)
          }
        } else {
          transaction.setData([
            "uid": uid, "role": "member", "joinedAt": FieldValue.serverTimestamp(),
            "lastReadClientAt": timestamp, "lastReadAt": FieldValue.serverTimestamp(),
            "muted": false, "mutedUntil": NSNull(),
          ], forDocument: member)
        }
      } catch { errorPointer?.pointee = error as NSError }
      return nil
    }
  }

  // MARK: Opening conversations

  func openDirectConversation(with otherUserID: String) async throws -> String {
    let (db, uid) = try context()
    let memberIDs = [uid, otherUserID].sorted()
    let conversationID = Self.directConversationID(uid, otherUserID)
    let conversation = db.collection(FirestoreCollections.conversations).document(conversationID)

    // The read is denied while the conversation doesn't exist, so "permission denied" means
    // "create it". Any other failure (no connection, timeout) is reported as it is.
    let exists: Bool
    do {
      exists = try await conversation.getDocument().exists
    } catch where FirestoreValue.isPermissionDenied(error) {
      exists = false
    }
    if !exists {
      do {
        try await conversation.setData([
          "type": "direct",
          "memberIds": memberIDs,
          "lastMessage": NSNull(),
          "createdAt": FieldValue.serverTimestamp(),
          "updatedAt": FieldValue.serverTimestamp(),
        ])
      } catch where FirestoreValue.isPermissionDenied(error) {
        // The rules only allow it between people who follow each other and haven't blocked.
        throw ChatRepoError.cannotStartConversation
      }
    }

    for memberID in memberIDs {
      try await ensureMember(memberID, in: conversation)
    }
    for (owner, other) in [(memberIDs[0], memberIDs[1]), (memberIDs[1], memberIDs[0])] {
      try? await db.collection(FirestoreCollections.users).document(owner)
        .collection(FirestoreSubcollections.directConversations).document(conversationID)
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
    let conversation = db.collection(FirestoreCollections.conversations).document(conversationID)
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
    let member = conversation.collection(FirestoreSubcollections.members).document(memberID)
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
    if let senderProfile, senderProfile.uid == uid,
      Date().timeIntervalSince(senderProfile.loadedAt) < Self.senderProfileLifetime
    {
      return (senderProfile.name, senderProfile.photoURL)
    }
    let data = (try? await db.collection(FirestoreCollections.usersPublic).document(uid).getDocument().data()) ?? [:]
    let user = Auth.auth().currentUser
    let name = (data["displayName"] as? String) ?? user?.displayName
    let photoURL = (data["photoURL"] as? String) ?? user?.photoURL?.absoluteString
    senderProfile = (uid, name, photoURL, Date())
    return (name, photoURL)
  }

  /// Id of the direct conversation between two users, the same for both (`dm_<a>_<b>`, sorted).
  static func directConversationID(_ firstUID: String, _ secondUID: String) -> String {
    "dm_" + [firstUID, secondUID].sorted().joined(separator: "_")
  }

  static func message(from document: QueryDocumentSnapshot) -> ChatMessage? {
    message(id: document.documentID, data: document.data())
  }

  static func message(id: String, data: [String: Any]) -> ChatMessage? {
    guard let senderID = data["senderId"] as? String else { return nil }
    let createdAt = (data["createdAt"] as? Timestamp)?.dateValue()
      ?? (data["clientCreatedAt"] as? NSNumber).map { Date(timeIntervalSince1970: $0.doubleValue / 1000) }
      ?? Date()
    let attachments = data["attachments"] as? [Any] ?? []
    return ChatMessage(
      id: id,
      senderID: senderID,
      senderName: data["senderName"] as? String,
      text: data["text"] as? String ?? "",
      hasAttachments: !attachments.isEmpty,
      createdAt: createdAt,
      clientCreatedAt: (data["clientCreatedAt"] as? NSNumber)?.int64Value,
      attachments: attachments.compactMap { ($0 as? [String: Any]).flatMap(ChatAttachment.init(fields:)) }
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
  private var errors: [String: Error] = [:]
  private var isStopped = false

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

  func start() {
    let user = db.collection(FirestoreCollections.users).document(uid)
    indexListeners.append(
      user.collection(FirestoreSubcollections.directConversations)
        .addSnapshotListener { [weak self] snapshot, error in
          guard let self, !self.isStopped else { return }
          if let error {
            self.errors["direct-index"] = error
            self.emit()
            return
          }
          self.errors.removeValue(forKey: "direct-index")
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
      user.collection(FirestoreSubcollections.memberships)
        // Every membership matters: an older group may have the newest conversation.
        .addSnapshotListener { [weak self] snapshot, error in
          guard let self, !self.isStopped else { return }
          if let error {
            self.errors["group-index"] = error
            self.emit()
            return
          }
          self.errors.removeValue(forKey: "group-index")
          let next = Set((snapshot?.documents ?? []).map { "grp_\($0.documentID)" })
          self.groupIDs = self.sync(ids: next, previous: self.groupIDs)
        }
    )
  }

  func stop() {
    isStopped = true
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
      errors.removeValue(forKey: removed)
    }
    for added in next.subtracting(previous) {
      listen(to: added)
    }
    emit()
    return next
  }

  private func listen(to conversationID: String) {
    conversationListeners[conversationID] = db.collection(FirestoreCollections.conversations).document(conversationID)
      .addSnapshotListener { [weak self] snapshot, error in
        guard let self, !self.isStopped else { return }
        if let error {
          self.errors[conversationID] = error
          self.emit()
          return
        }
        guard let snapshot else { return }
        self.errors.removeValue(forKey: conversationID)
        // A missing local cache entry is not proof that a known conversation was deleted.
        if !snapshot.exists && snapshot.metadata.isFromCache { return }
        guard snapshot.exists, let data = snapshot.data() else {
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
    let path = isGroup
      ? db.collection(FirestoreCollections.groups).document(id)
      : db.collection(FirestoreCollections.usersPublic).document(id)
    let data = (try? await path.getDocument().data()) ?? [:]
    guard !isStopped else { return }
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
    guard !isStopped else { return }
    onChange(conversations.values.sorted { $0.updatedAt > $1.updatedAt })
    if let error = errors.values.first { onError(error) }
  }
}

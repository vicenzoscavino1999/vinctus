import FirebaseCore
import FirebaseFirestore
import Foundation

final class FirebaseChatRepo: ChatRepo {
  private let db: Firestore?

  init(db: Firestore? = nil) {
    self.db = db
  }

  func subscribeToDirectConversations(
    uid: String,
    limit: Int,
    onUpdate: @escaping ([DirectConversationSummary]) -> Void,
    onError: @escaping (Error) -> Void
  ) -> () -> Void {
    guard FirebaseBootstrap.isConfigured else {
      onError(ChatRepoError.firebaseNotConfigured)
      return {}
    }

    let database = db ?? Firestore.firestore()
    let queryLimit = max(1, min(50, limit))
    let indexQuery = database.collection("users")
      .document(uid)
      .collection("directConversations")
      .order(by: "updatedAt", descending: true)
      .limit(to: queryLimit)

    var conversationMap: [String: DirectConversationSummary] = [:]
    var conversationListeners: [String: ListenerRegistration] = [:]

    let emit: () -> Void = {
      let sorted = conversationMap.values.sorted { lhs, rhs in
        lhs.updatedAt > rhs.updatedAt
      }
      onUpdate(sorted)
    }

    let subscribeConversation: (String) -> Void = { conversationID in
      guard conversationListeners[conversationID] == nil else { return }
      let ref = database.collection("conversations").document(conversationID)
      let listener = ref.addSnapshotListener { snapshot, error in
        if let error {
          onError(error)
          return
        }

        guard let snapshot, snapshot.exists, let data = snapshot.data() else {
          conversationMap.removeValue(forKey: conversationID)
          emit()
          return
        }

        guard let summary = Self.parseDirectConversation(
          conversationID: conversationID,
          currentUID: uid,
          data: data
        ) else {
          conversationMap.removeValue(forKey: conversationID)
          emit()
          return
        }

        conversationMap[conversationID] = summary
        emit()
      }
      conversationListeners[conversationID] = listener
    }

    let indexListener = indexQuery.addSnapshotListener { snapshot, error in
      if let error {
        onError(error)
        return
      }

      guard let snapshot else { return }

      let nextIDs = Set(
        snapshot.documents
          .map(\.documentID)
          .filter { $0.hasPrefix("dm_") }
      )

      for conversationID in nextIDs {
        subscribeConversation(conversationID)
      }

      let removedIDs = Set(conversationListeners.keys).subtracting(nextIDs)
      for conversationID in removedIDs {
        conversationListeners[conversationID]?.remove()
        conversationListeners.removeValue(forKey: conversationID)
        conversationMap.removeValue(forKey: conversationID)
      }

      emit()
    }

    return {
      indexListener.remove()
      for listener in conversationListeners.values {
        listener.remove()
      }
    }
  }

  func subscribeToMessages(
    conversationID: String,
    limit: Int,
    onUpdate: @escaping ([DirectMessage]) -> Void,
    onError: @escaping (Error) -> Void
  ) -> () -> Void {
    guard FirebaseBootstrap.isConfigured else {
      onError(ChatRepoError.firebaseNotConfigured)
      return {}
    }

    let database = db ?? Firestore.firestore()
    let queryLimit = max(1, min(100, limit))
    let query = database.collection("conversations")
      .document(conversationID)
      .collection("messages")
      .order(by: "clientCreatedAt", descending: true)
      .limit(to: queryLimit)

    let listener = query.addSnapshotListener { snapshot, error in
      if let error {
        onError(error)
        return
      }
      guard let snapshot else { return }

      let messages: [DirectMessage] = snapshot.documents.map { doc in
        Self.parseDirectMessage(documentID: doc.documentID, data: doc.data())
      }
      onUpdate(messages)
    }

    return {
      listener.remove()
    }
  }

  func getOrCreateDirectConversation(currentUID: String, otherUID: String) async throws -> String {
    guard FirebaseBootstrap.isConfigured else { throw ChatRepoError.firebaseNotConfigured }

    let trimmedCurrent = currentUID.trimmingCharacters(in: .whitespacesAndNewlines)
    let trimmedOther = otherUID.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmedCurrent.isEmpty, !trimmedOther.isEmpty, trimmedCurrent != trimmedOther else {
      throw ChatRepoError.invalidConversationMembers
    }

    let memberIDs = [trimmedCurrent, trimmedOther].sorted()
    let conversationID = "dm_\(memberIDs.joined(separator: "_"))"
    let database = db ?? Firestore.firestore()
    let conversationRef = database.collection("conversations").document(conversationID)

    let conversationSnapshot = try? await FirestoreAsyncBridge.getDocument(conversationRef)
    let exists = conversationSnapshot?.exists ?? false

    if !exists {
      try await FirestoreAsyncBridge.setData(
        conversationRef,
        data: [
          "type": "direct",
          "memberIds": memberIDs,
          "lastMessage": NSNull(),
          "createdAt": FieldValue.serverTimestamp(),
          "updatedAt": FieldValue.serverTimestamp()
        ],
        merge: false
      )
    }

    for uid in memberIDs {
      let memberRef = conversationRef.collection("members").document(uid)
      let memberSnapshot = try? await FirestoreAsyncBridge.getDocument(memberRef)
      if memberSnapshot?.exists == true { continue }
      try await FirestoreAsyncBridge.setData(
        memberRef,
        data: [
          "uid": uid,
          "role": "member",
          "joinedAt": FieldValue.serverTimestamp(),
          "lastReadClientAt": Int(Date().timeIntervalSince1970 * 1000),
          "lastReadAt": FieldValue.serverTimestamp(),
          "muted": false,
          "mutedUntil": NSNull()
        ],
        merge: false
      )
    }

    let firstUID = memberIDs[0]
    let secondUID = memberIDs[1]
    try await upsertDirectIndex(database: database, uid: firstUID, otherUID: secondUID, conversationID: conversationID)
    try await upsertDirectIndex(database: database, uid: secondUID, otherUID: firstUID, conversationID: conversationID)

    return conversationID
  }

  func sendMessage(
    conversationID: String,
    senderUID: String,
    senderName: String?,
    senderPhotoURL: String?,
    text: String
  ) async throws {
    guard FirebaseBootstrap.isConfigured else { throw ChatRepoError.firebaseNotConfigured }

    let trimmedText = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmedText.isEmpty else { throw ChatRepoError.emptyMessage }

    let database = db ?? Firestore.firestore()
    let clientCreatedAt = Int(Date().timeIntervalSince1970 * 1000)
    let clientID = "\(senderUID)_\(clientCreatedAt)_\(UUID().uuidString.prefix(8))"
    let conversationRef = database.collection("conversations").document(conversationID)
    let messageRef = conversationRef.collection("messages").document(clientID)

    let batch = database.batch()
    batch.setData(
      [
        "senderId": senderUID,
        "senderName": senderName ?? NSNull(),
        "senderPhotoURL": senderPhotoURL ?? NSNull(),
        "text": trimmedText,
        "createdAt": FieldValue.serverTimestamp(),
        "clientCreatedAt": clientCreatedAt,
        "clientId": clientID
      ],
      forDocument: messageRef,
      merge: false
    )

    batch.updateData(
      [
        "lastMessage": [
          "text": trimmedText,
          "senderId": senderUID,
          "senderName": senderName ?? NSNull(),
          "senderPhotoURL": senderPhotoURL ?? NSNull(),
          "createdAt": FieldValue.serverTimestamp(),
          "clientCreatedAt": clientCreatedAt
        ],
        "updatedAt": FieldValue.serverTimestamp()
      ],
      forDocument: conversationRef
    )

    try await FirestoreAsyncBridge.commit(batch)
  }

  func fetchPublicUser(uid: String) async throws -> ChatPublicUser? {
    guard FirebaseBootstrap.isConfigured else { throw ChatRepoError.firebaseNotConfigured }
    let trimmedUID = uid.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmedUID.isEmpty else { return nil }

    let database = db ?? Firestore.firestore()
    let ref = database.collection("users_public").document(trimmedUID)

    do {
      let snapshot = try await FirestoreAsyncBridge.getDocument(ref)
      return Self.parsePublicUser(uid: trimmedUID, data: snapshot.data())
    } catch {
      let snapshot = try await FirestoreAsyncBridge.getDocument(ref, source: .cache)
      return Self.parsePublicUser(uid: trimmedUID, data: snapshot.data())
    }
  }

  private func upsertDirectIndex(
    database: Firestore,
    uid: String,
    otherUID: String,
    conversationID: String
  ) async throws {
    let indexRef = database.collection("users")
      .document(uid)
      .collection("directConversations")
      .document(conversationID)
    try await FirestoreAsyncBridge.setData(
      indexRef,
      data: [
        "conversationId": conversationID,
        "otherUid": otherUID,
        "type": "direct",
        "updatedAt": FieldValue.serverTimestamp()
      ],
      merge: true
    )
  }

}

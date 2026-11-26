import FirebaseAuth
import FirebaseCore
import FirebaseFirestore
import Foundation

/// A pending follow, group or collaboration request addressed to the signed-in person.
struct IncomingRequest: Identifiable, Hashable, Sendable {
  enum Kind: String, CaseIterable, Hashable, Sendable {
    case followers, groups, collaboration

    var title: String {
      switch self {
      case .followers: return "Seguidores"
      case .groups: return "Grupos"
      case .collaboration: return "Colaboración"
      }
    }
  }

  let kind: Kind
  /// Document ID of the request.
  let requestID: String
  let fromUID: String
  let name: String
  let username: String?
  let photoURL: String?
  let createdAt: Date
  /// Group name or collaboration title.
  let target: String?
  let message: String?

  var id: String { "\(kind.rawValue):\(requestID)" }
}

/// The fields of `users_public` a request row shows.
private struct PublicProfile: Sendable {
  let name: String
  let username: String?
  let photoURL: String?

  init(_ data: [String: Any]) {
    username = FirestoreValue.string(data["username"])
    name = FirestoreValue.string(data["displayName"]) ?? username ?? "Usuario"
    photoURL = FirestoreValue.string(data["photoURL"])
  }
}

/// Where the next page of activity starts. Opaque outside the repo.
struct NotificationsCursor {
  fileprivate let lastDocument: DocumentSnapshot?

  /// A cursor that points nowhere, for fakes in tests.
  static let placeholder = NotificationsCursor(lastDocument: nil)
}

struct ActivityPage {
  let items: [ActivityNotification]
  let cursor: NotificationsCursor?
  let hasMore: Bool
}

enum NotificationsRepoError: LocalizedError {
  case firebaseNotConfigured
  case userNotAuthenticated
  case groupNotFound

  var errorDescription: String? {
    switch self {
    case .firebaseNotConfigured: return "Firebase no está configurado."
    case .userNotAuthenticated: return "Debes iniciar sesión."
    case .groupNotFound: return "Este grupo ya no existe."
    }
  }
}

/// The signed-in person's notifications and pending requests: the same Firestore data and
/// writes as the web (`src/features/notifications`, `groups.ts`, `collaborations.ts`).
protocol NotificationsRepo {
  func fetchActivity(limit: Int, after cursor: NotificationsCursor?) async throws -> ActivityPage
  func markRead(ids: [String]) async throws
  func delete(id: String) async throws
  func fetchRequests(_ kind: IncomingRequest.Kind) async throws -> [IncomingRequest]
  func accept(_ request: IncomingRequest) async throws
  func reject(_ request: IncomingRequest) async throws
  /// The post a notification points to, through `readPosts` (it checks the access).
  func fetchPost(id: String) async throws -> FeedItem?
  /// Unread activity plus pending requests, without blocked senders, like the web's bell.
  func badgeCount() async throws -> Int
}

final class FirebaseNotificationsRepo: NotificationsRepo {
  private static let batchLimit = 450

  private func context() throws -> (Firestore, String) {
    guard FirebaseApp.app() != nil else { throw NotificationsRepoError.firebaseNotConfigured }
    guard let uid = Auth.auth().currentUser?.uid else { throw NotificationsRepoError.userNotAuthenticated }
    return (Firestore.firestore(), uid)
  }

  /// Mirrors `getUserActivity` in `src/shared/lib/firestore/postEngagement.ts`.
  func fetchActivity(limit: Int, after cursor: NotificationsCursor?) async throws -> ActivityPage {
    let (db, uid) = try context()
    let pageSize = max(1, min(50, limit))
    var query = db.collection(FirestoreCollections.notifications)
      .whereField("toUid", isEqualTo: uid)
      .order(by: "createdAt", descending: true)
      .limit(to: pageSize + 1)
    if let last = cursor?.lastDocument {
      query = query.start(afterDocument: last)
    }
    let snapshot = try await query.getDocuments()
    let hasMore = snapshot.documents.count > pageSize
    let documents = Array(snapshot.documents.prefix(pageSize))
    return ActivityPage(
      items: documents.compactMap { ActivityNotification(id: $0.documentID, data: $0.data()) },
      cursor: hasMore ? NotificationsCursor(lastDocument: documents.last) : nil,
      hasMore: hasMore
    )
  }

  func markRead(ids: [String]) async throws {
    let (db, _) = try context()
    let unique = Array(Set(ids))
    for start in stride(from: 0, to: unique.count, by: Self.batchLimit) {
      let batch = db.batch()
      for id in unique[start..<min(unique.count, start + Self.batchLimit)] {
        batch.updateData(["read": true], forDocument: db.collection(FirestoreCollections.notifications).document(id))
      }
      try await batch.commit()
    }
  }

  func delete(id: String) async throws {
    let (db, _) = try context()
    try await db.collection(FirestoreCollections.notifications).document(id).delete()
  }

  func fetchRequests(_ kind: IncomingRequest.Kind) async throws -> [IncomingRequest] {
    let (db, uid) = try context()
    let collection: String
    switch kind {
    case .followers: collection = FirestoreCollections.followRequests
    case .groups: collection = FirestoreCollections.groupRequests
    case .collaboration: collection = FirestoreCollections.collaborationRequests
    }
    let snapshot = try await db.collection(collection)
      .whereField("toUid", isEqualTo: uid)
      .whereField("status", isEqualTo: "pending")
      .order(by: "createdAt", descending: true)
      .limit(to: 50)
      .getDocuments()

    if kind != .followers {
      return snapshot.documents.compactMap { document -> IncomingRequest? in
        let data = document.data()
        guard let fromUID = FirestoreValue.string(data["fromUid"]) else { return nil }
        return IncomingRequest(
          kind: kind,
          requestID: document.documentID,
          fromUID: fromUID,
          name: FirestoreValue.string(data["fromUserName"]) ?? "Usuario",
          username: nil,
          photoURL: FirestoreValue.string(data["fromUserPhoto"]),
          createdAt: FirestoreValue.date(data["createdAt"]) ?? Date(),
          target: FirestoreValue.string(data[kind == .groups ? "groupName" : "collaborationTitle"]),
          message: FirestoreValue.string(data["message"])
        )
      }
    }

    // Follow requests only carry the uid: read the public profiles, all at once.
    let rows = snapshot.documents.compactMap { document -> (String, String, Date)? in
      guard let fromUID = FirestoreValue.string(document.data()["fromUid"]) else { return nil }
      return (document.documentID, fromUID, FirestoreValue.date(document.data()["createdAt"]) ?? Date())
    }
    let profiles = await withTaskGroup(of: (String, PublicProfile).self) { group in
      for fromUID in Set(rows.map { $0.1 }) {
        group.addTask {
          let data = (try? await Firestore.firestore().collection(FirestoreCollections.usersPublic)
            .document(fromUID).getDocument().data()) ?? [:]
          return (fromUID, PublicProfile(data))
        }
      }
      var result: [String: PublicProfile] = [:]
      for await (uid, profile) in group { result[uid] = profile }
      return result
    }
    return rows.map { row in
      let profile = profiles[row.1] ?? PublicProfile([:])
      return IncomingRequest(
        kind: .followers,
        requestID: row.0,
        fromUID: row.1,
        name: profile.name,
        username: profile.username,
        photoURL: profile.photoURL,
        createdAt: row.2,
        target: nil,
        message: nil
      )
    }
  }

  func accept(_ request: IncomingRequest) async throws {
    let (db, _) = try context()
    switch request.kind {
    case .followers:
      // A Cloud Function adds the follow (`acceptFollowRequest`).
      try await db.collection(FirestoreCollections.followRequests).document(request.requestID)
        .updateData(["status": "accepted", "updatedAt": FieldValue.serverTimestamp()])
    case .collaboration:
      try await db.collection(FirestoreCollections.collaborationRequests).document(request.requestID)
        .updateData(["status": "accepted", "updatedAt": FieldValue.serverTimestamp()])
    case .groups:
      try await acceptGroupRequest(request.requestID, db: db)
    }
  }

  /// Mirrors `acceptGroupJoinRequest`: accept the request and add the member in one batch.
  private func acceptGroupRequest(_ requestID: String, db: Firestore) async throws {
    let requestRef = db.collection(FirestoreCollections.groupRequests).document(requestID)
    let data = try await requestRef.getDocument().data() ?? [:]
    guard FirestoreValue.string(data["status"]) == "pending" else { return }
    guard let groupID = FirestoreValue.string(data["groupId"]),
      let memberUID = FirestoreValue.string(data["fromUid"])
    else { throw NotificationsRepoError.groupNotFound }
    let groupRef = db.collection(FirestoreCollections.groups).document(groupID)
    guard try await groupRef.getDocument().exists else { throw NotificationsRepoError.groupNotFound }

    let memberRef = groupRef.collection(FirestoreSubcollections.members).document(memberUID)
    let membershipRef = db.collection(FirestoreCollections.users).document(memberUID)
      .collection(FirestoreSubcollections.memberships).document(groupID)
    // Owners cannot read the member's memberships (rules): check the group's member doc instead.
    let isMember = try await memberRef.getDocument().exists

    let batch = db.batch()
    batch.updateData(["status": "accepted", "updatedAt": FieldValue.serverTimestamp()], forDocument: requestRef)
    if !isMember {
      batch.setData(
        ["uid": memberUID, "groupId": groupID, "role": "member", "joinedAt": FieldValue.serverTimestamp()],
        forDocument: memberRef
      )
      batch.setData(["groupId": groupID, "joinedAt": FieldValue.serverTimestamp()], forDocument: membershipRef)
    }
    try await batch.commit()
  }

  func reject(_ request: IncomingRequest) async throws {
    let (db, _) = try context()
    let target: (collection: String, status: String)
    switch request.kind {
    case .followers: target = (FirestoreCollections.followRequests, "declined")
    case .groups: target = (FirestoreCollections.groupRequests, "rejected")
    case .collaboration: target = (FirestoreCollections.collaborationRequests, "rejected")
    }
    try await db.collection(target.collection).document(request.requestID)
      .updateData(["status": target.status, "updatedAt": FieldValue.serverTimestamp()])
  }

  func fetchPost(id: String) async throws -> FeedItem? {
    let page = try await PostReadClient.read(view: "ids", ids: [id], limit: 1)
    return page.items.first.map { FirebaseFeedRepo.feedItem(id: $0.id, data: $0.fields) }
  }

  /// Mirrors `getUnreadNotificationBadgeCount` in `src/features/notifications/api/queries.ts`.
  func badgeCount() async throws -> Int {
    let (db, uid) = try context()
    async let blockedSnapshot = db.collection(FirestoreCollections.users).document(uid)
      .collection(FirestoreSubcollections.blockedUsers).getDocuments()
    async let activitySnapshot = db.collection(FirestoreCollections.notifications)
      .whereField("toUid", isEqualTo: uid)
      .order(by: "createdAt", descending: true)
      .limit(to: 20)
      .getDocuments()
    let requestCollections = [
      FirestoreCollections.followRequests,
      FirestoreCollections.groupRequests,
      FirestoreCollections.collaborationRequests,
    ]
    let blocked = Set(((try? await blockedSnapshot)?.documents ?? []).map(\.documentID))
    let activity = (try? await activitySnapshot)?.documents ?? []
    var total = activity.filter { document in
      let data = document.data()
      let fromUID = FirestoreValue.string(data["fromUid"]) ?? ""
      return data["read"] as? Bool != true && !blocked.contains(fromUID)
    }.count
    for collection in requestCollections {
      let snapshot = try? await db.collection(collection)
        .whereField("toUid", isEqualTo: uid)
        .whereField("status", isEqualTo: "pending")
        .order(by: "createdAt", descending: true)
        .limit(to: 10)
        .getDocuments()
      total += (snapshot?.documents ?? []).filter {
        !blocked.contains(FirestoreValue.string($0.data()["fromUid"]) ?? "")
      }.count
    }
    return total
  }
}

#if SCREENSHOTS
// Screenshot builds only (see App/DemoData.swift).
struct SampleNotificationsRepo: NotificationsRepo {
  private static let now = Date()

  func fetchActivity(limit: Int, after cursor: NotificationsCursor?) async throws -> ActivityPage {
    let hour: TimeInterval = 3_600
    let items = [
      ActivityNotification(id: "n1", kind: .like, fromUID: "u1", fromName: "Mateo", postID: "p1",
                           postSnippet: "Anoche vi los anillos de Saturno", createdAt: Self.now.addingTimeInterval(-0.5 * hour), read: false),
      ActivityNotification(id: "n2", kind: .like, fromUID: "u2", fromName: "Valentina", postID: "p1",
                           createdAt: Self.now.addingTimeInterval(-1 * hour), read: false),
      ActivityNotification(id: "n3", kind: .like, fromUID: "u3", fromName: "Diego", postID: "p1",
                           createdAt: Self.now.addingTimeInterval(-2 * hour), read: false),
      ActivityNotification(id: "n4", kind: .follow, fromUID: "u2", fromName: "Valentina",
                           createdAt: Self.now.addingTimeInterval(-3 * hour), read: false),
      ActivityNotification(id: "n5", kind: .comment, fromUID: "u3", fromName: "Diego", postID: "p1",
                           commentText: "¿Con qué telescopio?", createdAt: Self.now.addingTimeInterval(-26 * hour), read: true),
      ActivityNotification(id: "n6", kind: .follow, fromUID: "u1", fromName: "Mateo",
                           createdAt: Self.now.addingTimeInterval(-40 * 24 * hour), read: true),
    ]
    return ActivityPage(items: items, cursor: nil, hasMore: false)
  }

  func markRead(ids: [String]) async throws {}
  func delete(id: String) async throws {}

  func fetchRequests(_ kind: IncomingRequest.Kind) async throws -> [IncomingRequest] {
    switch kind {
    case .groups:
      return [IncomingRequest(kind: .groups, requestID: "r1", fromUID: "u3", name: "Diego", username: nil, photoURL: nil,
                              createdAt: Self.now.addingTimeInterval(-4 * 3_600), target: "Club de Astronomía",
                              message: "Me encanta observar el cielo")]
    case .followers:
      return [IncomingRequest(kind: .followers, requestID: "r2", fromUID: "u4", name: "Lucía", username: "lucia",
                              photoURL: nil, createdAt: Self.now.addingTimeInterval(-5 * 3_600), target: nil, message: nil)]
    case .collaboration:
      return []
    }
  }

  func accept(_ request: IncomingRequest) async throws {}
  func reject(_ request: IncomingRequest) async throws {}
  func fetchPost(id: String) async throws -> FeedItem? { nil }
  func badgeCount() async throws -> Int { 6 }
}
#endif

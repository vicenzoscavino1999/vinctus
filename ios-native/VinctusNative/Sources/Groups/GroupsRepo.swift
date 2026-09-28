import FirebaseCore
import FirebaseFirestore
import Foundation

struct GroupSummary: Identifiable, Hashable {
  let id: String
  let name: String
  let description: String
  let categoryID: String?
  let visibility: ProfileAccountVisibility
  let iconURL: String?
  let memberCount: Int
  let updatedAt: Date
}

struct GroupPostPreview: Identifiable, Hashable {
  let id: String
  let title: String
  let authorID: String?
  let authorName: String
  let createdAt: Date?
}

struct GroupMemberPreview: Identifiable, Hashable {
  let uid: String
  let name: String
  let photoURL: String?
  let role: String
  let joinedAt: Date?

  var id: String { uid }
}

struct GroupDetail: Identifiable, Hashable {
  let id: String
  let name: String
  let description: String
  let categoryID: String?
  let ownerID: String?
  let visibility: ProfileAccountVisibility
  let iconURL: String?
  let memberCount: Int
  let postsPerWeek: Int
  let createdAt: Date?
  let updatedAt: Date?
  let recentPosts: [GroupPostPreview]
  let topMembers: [GroupMemberPreview]
  let isFromCache: Bool
}

struct GroupsPage {
  let items: [GroupSummary]
  let isFromCache: Bool
}

protocol GroupsRepo {
  func fetchGroups(limit: Int) async throws -> GroupsPage
  func fetchGroupDetail(groupID: String, recentPostLimit: Int, topMemberLimit: Int) async throws -> GroupDetail?
  func isMember(groupID: String, uid: String) async throws -> Bool
  /// Joins a public group, like the web's `joinPublicGroup`. Private groups need a request on the web.
  func joinGroup(groupID: String, uid: String) async throws
  func leaveGroup(groupID: String, uid: String) async throws
}

enum GroupsRepoError: LocalizedError {
  case firebaseNotConfigured
  case missingSnapshot
  case privateGroup

  var errorDescription: String? {
    switch self {
    case .firebaseNotConfigured:
      return "Firebase no está configurado."
    case .missingSnapshot:
      return "No se pudo cargar grupos."
    case .privateGroup:
      return "Este grupo es privado. Pide unirte desde la web."
    }
  }
}

final class FirebaseGroupsRepo: GroupsRepo {
  private let db: Firestore?

  init(db: Firestore? = nil) {
    self.db = db
  }

  func fetchGroups(limit: Int) async throws -> GroupsPage {
    guard FirebaseApp.app() != nil else { throw GroupsRepoError.firebaseNotConfigured }

    let db = self.db ?? Firestore.firestore()
    let pageSize = max(1, min(60, limit))

    let query = db.collection("groups")
      .order(by: "updatedAt", descending: true)
      .limit(to: pageSize)

    let (snapshot, isFromCache) = try await getDocumentsWithFallback(query)
    let groups = snapshot.documents.map(mapGroupSummary)

    return GroupsPage(items: groups, isFromCache: isFromCache || snapshot.metadata.isFromCache)
  }

  func fetchGroupDetail(groupID: String, recentPostLimit: Int = 3, topMemberLimit: Int = 3) async throws -> GroupDetail? {
    guard FirebaseApp.app() != nil else { throw GroupsRepoError.firebaseNotConfigured }

    let normalizedGroupID = groupID.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !normalizedGroupID.isEmpty else { return nil }

    let db = self.db ?? Firestore.firestore()

    let groupRef = db.collection("groups").document(normalizedGroupID)
    let (groupDoc, groupFromCache) = try await getDocumentWithFallback(groupRef)
    guard let groupData = groupDoc.data() else { return nil }

    let postsLimit = max(1, min(10, recentPostLimit))
    let membersLimit = max(1, min(12, topMemberLimit))

    let recentPostsQuery = db.collection("posts")
      .whereField("groupId", isEqualTo: normalizedGroupID)
      .order(by: "createdAt", descending: true)
      .limit(to: postsLimit)

    let membersQuery = db.collection("groups")
      .document(normalizedGroupID)
      .collection("members")
      .order(by: "joinedAt", descending: true)
      .limit(to: membersLimit)

    let weekAgo = Timestamp(date: Date().addingTimeInterval(-7 * 24 * 60 * 60))
    let weeklyPostsQuery = db.collection("posts")
      .whereField("groupId", isEqualTo: normalizedGroupID)
      .whereField("createdAt", isGreaterThanOrEqualTo: weekAgo)
      .limit(to: 200)

    async let recentPostsResult = getDocumentsWithFallback(recentPostsQuery)
    async let membersResult = getDocumentsWithFallback(membersQuery)
    async let weeklyPostsResult = getDocumentsWithFallback(weeklyPostsQuery)

    let (recentPostsSnapshot, recentPostsFromCache) = try await recentPostsResult
    let (membersSnapshot, membersFromCache) = try await membersResult
    let (weeklyPostsSnapshot, weeklyPostsFromCache) = try await weeklyPostsResult

    let memberDocs = membersSnapshot.documents
    let memberProfiles = try await fetchMemberProfiles(db: db, memberDocs: memberDocs)

    let topMembers = memberDocs.map { doc in
      let data = doc.data()
      let role = FirestoreValue.string(data["role"]) ?? "member"
      let joinedAt = FirestoreValue.date(data["joinedAt"])
      let profile = memberProfiles[doc.documentID]
      return GroupMemberPreview(
        uid: doc.documentID,
        name: profile?.name ?? "Usuario",
        photoURL: profile?.photoURL,
        role: role,
        joinedAt: joinedAt
      )
    }

    let recentPosts = recentPostsSnapshot.documents.map { doc in
      let data = doc.data()
      let title = FirestoreValue.string(data["title"]) ?? FirestoreValue.string(data["text"]) ?? FirestoreValue.string(data["content"]) ?? "Publicacion"

      let authorName: String = {
        if
          let authorSnapshot = data["authorSnapshot"] as? [String: Any],
          let displayName = FirestoreValue.string(authorSnapshot["displayName"])
        {
          return displayName
        }
        return FirestoreValue.string(data["authorName"]) ?? "Usuario"
      }()

      return GroupPostPreview(
        id: doc.documentID,
        title: normalizedPostTitle(title),
        authorID: FirestoreValue.string(data["authorId"]) ?? FirestoreValue.string(data["authorID"]),
        authorName: authorName,
        createdAt: FirestoreValue.date(data["createdAt"])
      )
    }

    let visibility = (groupData["visibility"] as? String) == ProfileAccountVisibility.private.rawValue
      ? ProfileAccountVisibility.private
      : ProfileAccountVisibility.public

    let isFromCache = groupFromCache
      || recentPostsFromCache
      || membersFromCache
      || weeklyPostsFromCache
      || recentPostsSnapshot.metadata.isFromCache
      || membersSnapshot.metadata.isFromCache
      || weeklyPostsSnapshot.metadata.isFromCache

    return GroupDetail(
      id: groupDoc.documentID,
      name: FirestoreValue.string(groupData["name"]) ?? "Grupo",
      description: FirestoreValue.string(groupData["description"]) ?? "",
      categoryID: FirestoreValue.string(groupData["categoryId"]),
      ownerID: FirestoreValue.string(groupData["ownerId"]),
      visibility: visibility,
      iconURL: FirestoreValue.string(groupData["iconUrl"]),
      memberCount: FirestoreValue.int(groupData["memberCount"]) ?? max(memberDocs.count, 0),
      postsPerWeek: max(weeklyPostsSnapshot.documents.count, 0),
      createdAt: FirestoreValue.date(groupData["createdAt"]),
      updatedAt: FirestoreValue.date(groupData["updatedAt"]),
      recentPosts: recentPosts,
      topMembers: topMembers,
      isFromCache: isFromCache
    )
  }

  func isMember(groupID: String, uid: String) async throws -> Bool {
    guard FirebaseApp.app() != nil else { throw GroupsRepoError.firebaseNotConfigured }
    let db = self.db ?? Firestore.firestore()
    let ref = db.collection("groups").document(groupID).collection("members").document(uid)
    return try await ref.getDocument(source: .server).exists
  }

  /// Mirrors `joinPublicGroup` / `joinGroupWithSync` in `src/shared/lib/firestore/groups.ts`.
  func joinGroup(groupID: String, uid: String) async throws {
    guard FirebaseApp.app() != nil else { throw GroupsRepoError.firebaseNotConfigured }
    let db = self.db ?? Firestore.firestore()
    let groupRef = db.collection("groups").document(groupID)
    let groupDoc = try await groupRef.getDocument(source: .server)
    guard let data = groupDoc.data() else { throw GroupsRepoError.missingSnapshot }
    if (data["visibility"] as? String) == ProfileAccountVisibility.private.rawValue {
      throw GroupsRepoError.privateGroup
    }

    let batch = db.batch()
    batch.setData(
      [
        "uid": uid,
        "groupId": groupID,
        "role": "member",
        "joinedAt": FieldValue.serverTimestamp(),
      ],
      forDocument: groupRef.collection("members").document(uid)
    )
    batch.setData(
      [
        "groupId": groupID,
        "joinedAt": FieldValue.serverTimestamp(),
      ],
      forDocument: db.collection("users").document(uid).collection("memberships").document(groupID)
    )
    try await batch.commit()
  }

  /// Mirrors `leaveGroupWithSync` in `src/shared/lib/firestore/groups.ts`.
  func leaveGroup(groupID: String, uid: String) async throws {
    guard FirebaseApp.app() != nil else { throw GroupsRepoError.firebaseNotConfigured }
    let db = self.db ?? Firestore.firestore()
    let batch = db.batch()
    batch.deleteDocument(db.collection("groups").document(groupID).collection("members").document(uid))
    batch.deleteDocument(db.collection("users").document(uid).collection("memberships").document(groupID))
    try await batch.commit()
  }

  private func fetchMemberProfiles(
    db: Firestore,
    memberDocs: [QueryDocumentSnapshot]
  ) async throws -> [String: (name: String, photoURL: String?)] {
    try await withThrowingTaskGroup(of: (String, (String, String?)).self) { group in
      for memberDoc in memberDocs {
        let uid = memberDoc.documentID
        group.addTask {
          let publicRef = db.collection("users_public").document(uid)
          let (publicDoc, _) = try await self.getDocumentWithFallback(publicRef)

          if let data = publicDoc.data() {
            let name = FirestoreValue.string(data["displayName"]) ?? FirestoreValue.string(data["username"]) ?? "Usuario"
            let photoURL = FirestoreValue.string(data["photoURL"])
            return (uid, (name, photoURL))
          }

          let privateRef = db.collection("users").document(uid)
          let (privateDoc, _) = try await self.getDocumentWithFallback(privateRef)
          let privateData = privateDoc.data() ?? [:]

          let name = FirestoreValue.string(privateData["displayName"]) ?? FirestoreValue.string(privateData["username"]) ?? "Usuario"
          let photoURL = FirestoreValue.string(privateData["photoURL"])
          return (uid, (name, photoURL))
        }
      }

      var result: [String: (name: String, photoURL: String?)] = [:]
      for try await (uid, profile) in group {
        result[uid] = profile
      }
      return result
    }
  }

  private func mapGroupSummary(doc: QueryDocumentSnapshot) -> GroupSummary {
    let data = doc.data()
    let visibility = (data["visibility"] as? String) == ProfileAccountVisibility.private.rawValue
      ? ProfileAccountVisibility.private
      : ProfileAccountVisibility.public

    return GroupSummary(
      id: doc.documentID,
      name: FirestoreValue.string(data["name"]) ?? "Grupo",
      description: FirestoreValue.string(data["description"]) ?? "",
      categoryID: FirestoreValue.string(data["categoryId"]),
      visibility: visibility,
      iconURL: FirestoreValue.string(data["iconUrl"]),
      memberCount: FirestoreValue.int(data["memberCount"]) ?? 0,
      updatedAt: FirestoreValue.date(data["updatedAt"]) ?? FirestoreValue.date(data["createdAt"]) ?? Date()
    )
  }

  private func normalizedPostTitle(_ text: String) -> String {
    let normalized = text.replacingOccurrences(of: "\n", with: " ").trimmingCharacters(in: .whitespacesAndNewlines)
    guard !normalized.isEmpty else { return "Publicación" }
    if normalized.count <= 90 { return normalized }
    let endIndex = normalized.index(normalized.startIndex, offsetBy: 87)
    return String(normalized[..<endIndex]) + "..."
  }

  private func getDocumentsWithFallback(_ query: Query) async throws -> (QuerySnapshot, Bool) {
    do {
      let snapshot = try await query.getDocuments(source: .server)
      return (snapshot, false)
    } catch {
      let cachedSnapshot = try await query.getDocuments(source: .cache)
      return (cachedSnapshot, true)
    }
  }

  private func getDocumentWithFallback(_ ref: DocumentReference) async throws -> (DocumentSnapshot, Bool) {
    do {
      let snapshot = try await ref.getDocument(source: .server)
      return (snapshot, false)
    } catch {
      let cachedSnapshot = try await ref.getDocument(source: .cache)
      return (cachedSnapshot, true)
    }
  }
}

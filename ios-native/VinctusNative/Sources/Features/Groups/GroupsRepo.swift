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
}

enum GroupsRepoError: LocalizedError {
  case firebaseNotConfigured
  case missingSnapshot

  var errorDescription: String? {
    switch self {
    case .firebaseNotConfigured:
      return "Firebase no esta configurado."
    case .missingSnapshot:
      return "No se pudo cargar grupos."
    }
  }
}

final class FirebaseGroupsRepo: GroupsRepo {
  private let db: Firestore?

  init(db: Firestore? = nil) {
    self.db = db
  }

  func fetchGroups(limit: Int) async throws -> GroupsPage {
    guard FirebaseBootstrap.isConfigured else { throw GroupsRepoError.firebaseNotConfigured }

    let db = self.db ?? Firestore.firestore()
    let pageSize = max(1, min(60, limit))

    let query = db.collection("groups")
      .order(by: "updatedAt", descending: true)
      .limit(to: pageSize)

    let (snapshot, isFromCache) = try await FirestoreAsyncBridge.getDocumentsWithFallback(query)
    let groups = snapshot.documents.map(mapGroupSummary)

    return GroupsPage(items: groups, isFromCache: isFromCache || snapshot.metadata.isFromCache)
  }

  func fetchGroupDetail(groupID: String, recentPostLimit: Int = 3, topMemberLimit: Int = 3) async throws -> GroupDetail? {
    guard FirebaseBootstrap.isConfigured else { throw GroupsRepoError.firebaseNotConfigured }

    let normalizedGroupID = groupID.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !normalizedGroupID.isEmpty else { return nil }

    let db = self.db ?? Firestore.firestore()

    let groupRef = db.collection("groups").document(normalizedGroupID)
    let (groupDoc, groupFromCache) = try await FirestoreAsyncBridge.getDocumentWithFallback(groupRef)
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

    async let recentPostsResult = FirestoreAsyncBridge.getDocumentsWithFallback(recentPostsQuery)
    async let membersResult = FirestoreAsyncBridge.getDocumentsWithFallback(membersQuery)
    async let weeklyPostsResult = FirestoreAsyncBridge.getDocumentsWithFallback(weeklyPostsQuery)

    let (recentPostsSnapshot, recentPostsFromCache) = try await recentPostsResult
    let (membersSnapshot, membersFromCache) = try await membersResult
    let (weeklyPostsSnapshot, weeklyPostsFromCache) = try await weeklyPostsResult

    let memberDocs = membersSnapshot.documents
    let memberProfiles = try await fetchMemberProfiles(db: db, memberDocs: memberDocs)

    let topMembers = memberDocs.map { doc in
      let data = doc.data()
      let role = FirestoreHelpers.nonEmptyString(data["role"]) ?? "member"
      let joinedAt = FirestoreHelpers.dateValue(data["joinedAt"])
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
      let title = FirestoreHelpers.nonEmptyString(data["title"])
        ?? FirestoreHelpers.nonEmptyString(data["text"])
        ?? FirestoreHelpers.nonEmptyString(data["content"])
        ?? "Publicacion"

      let authorName: String = {
        if
          let authorSnapshot = data["authorSnapshot"] as? [String: Any],
          let displayName = FirestoreHelpers.nonEmptyString(authorSnapshot["displayName"]) {
          return displayName
        }
        return FirestoreHelpers.nonEmptyString(data["authorName"]) ?? "Usuario"
      }()

      return GroupPostPreview(
        id: doc.documentID,
        title: normalizedPostTitle(title),
        authorName: authorName,
        createdAt: FirestoreHelpers.dateValue(data["createdAt"])
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
      name: FirestoreHelpers.nonEmptyString(groupData["name"]) ?? "Grupo",
      description: FirestoreHelpers.nonEmptyString(groupData["description"]) ?? "",
      categoryID: FirestoreHelpers.nonEmptyString(groupData["categoryId"]),
      ownerID: FirestoreHelpers.nonEmptyString(groupData["ownerId"]),
      visibility: visibility,
      iconURL: FirestoreHelpers.nonEmptyString(groupData["iconUrl"]),
      memberCount: intValue(groupData["memberCount"]) ?? max(memberDocs.count, 0),
      postsPerWeek: max(weeklyPostsSnapshot.documents.count, 0),
      createdAt: FirestoreHelpers.dateValue(groupData["createdAt"]),
      updatedAt: FirestoreHelpers.dateValue(groupData["updatedAt"]),
      recentPosts: recentPosts,
      topMembers: topMembers,
      isFromCache: isFromCache
    )
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
          let (publicDoc, _) = try await FirestoreAsyncBridge.getDocumentWithFallback(publicRef)

          if let data = publicDoc.data() {
            let name = FirestoreHelpers.nonEmptyString(data["displayName"])
              ?? FirestoreHelpers.nonEmptyString(data["username"])
              ?? "Usuario"
            let photoURL = FirestoreHelpers.nonEmptyString(data["photoURL"])
            return (uid, (name, photoURL))
          }

          let privateRef = db.collection("users").document(uid)
          let (privateDoc, _) = try await FirestoreAsyncBridge.getDocumentWithFallback(privateRef)
          let privateData = privateDoc.data() ?? [:]

          let name = FirestoreHelpers.nonEmptyString(privateData["displayName"])
            ?? FirestoreHelpers.nonEmptyString(privateData["username"])
            ?? "Usuario"
          let photoURL = FirestoreHelpers.nonEmptyString(privateData["photoURL"])
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
      name: FirestoreHelpers.nonEmptyString(data["name"]) ?? "Grupo",
      description: FirestoreHelpers.nonEmptyString(data["description"]) ?? "",
      categoryID: FirestoreHelpers.nonEmptyString(data["categoryId"]),
      visibility: visibility,
      iconURL: FirestoreHelpers.nonEmptyString(data["iconUrl"]),
      memberCount: intValue(data["memberCount"]) ?? 0,
      updatedAt: FirestoreHelpers.dateValue(data["updatedAt"]) ?? FirestoreHelpers.dateValue(data["createdAt"]) ?? Date()
    )
  }

  private func normalizedPostTitle(_ text: String) -> String {
    let normalized = text.replacingOccurrences(of: "\n", with: " ").trimmingCharacters(in: .whitespacesAndNewlines)
    guard !normalized.isEmpty else { return "Publicacion" }
    if normalized.count <= 90 { return normalized }
    let endIndex = normalized.index(normalized.startIndex, offsetBy: 87)
    return String(normalized[..<endIndex]) + "..."
  }

  private func intValue(_ value: Any?) -> Int? {
    if let intValue = value as? Int { return intValue }
    if let number = value as? NSNumber { return number.intValue }
    if let string = value as? String, let parsed = Int(string) { return parsed }
    return nil
  }
}

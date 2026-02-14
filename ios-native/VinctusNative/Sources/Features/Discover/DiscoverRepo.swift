import FirebaseCore
import FirebaseFirestore
import Foundation

struct DiscoverUser: Identifiable, Hashable {
  let uid: String
  let displayName: String
  let photoURL: String?
  let accountVisibility: ProfileAccountVisibility

  var id: String { uid }
}

protocol DiscoverRepo {
  func fetchRecentUsers(limit: Int, excluding uid: String?) async throws -> [DiscoverUser]
  func searchUsers(prefix: String, limit: Int, excluding uid: String?) async throws -> [DiscoverUser]
  func fetchFollowedUserIDs(uid: String) async throws -> Set<String>
  func setFollowState(currentUID: String, targetUID: String, isFollowing: Bool) async throws
}

enum DiscoverRepoError: LocalizedError {
  case firebaseNotConfigured
  case missingSnapshot

  var errorDescription: String? {
    switch self {
    case .firebaseNotConfigured:
      return "Firebase no esta configurado."
    case .missingSnapshot:
      return "No se pudieron cargar usuarios."
    }
  }
}

final class FirebaseDiscoverRepo: DiscoverRepo {
  private let db: Firestore?

  init(db: Firestore? = nil) {
    self.db = db
  }

  func fetchRecentUsers(limit: Int, excluding uid: String?) async throws -> [DiscoverUser] {
    guard FirebaseBootstrap.isConfigured else { throw DiscoverRepoError.firebaseNotConfigured }

    let db = self.db ?? Firestore.firestore()
    let pageSize = max(1, min(30, limit))

    let query = db.collection("users_public")
      .order(by: "updatedAt", descending: true)
      .limit(to: pageSize + 1)

    do {
      let snapshot = try await FirestoreAsyncBridge.getDocuments(query)
      return mapUsers(from: snapshot, excluding: uid, limit: pageSize)
    } catch {
      let snapshot = try await FirestoreAsyncBridge.getDocuments(query, source: .cache)
      return mapUsers(from: snapshot, excluding: uid, limit: pageSize)
    }
  }

  func searchUsers(prefix: String, limit: Int, excluding uid: String?) async throws -> [DiscoverUser] {
    guard FirebaseBootstrap.isConfigured else { throw DiscoverRepoError.firebaseNotConfigured }

    let normalized = prefix.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    guard !normalized.isEmpty else { return [] }

    let db = self.db ?? Firestore.firestore()
    let pageSize = max(1, min(30, limit))

    let query = db.collection("users_public")
      .order(by: "displayNameLowercase")
      .start(at: [normalized])
      .end(at: ["\(normalized)\u{f8ff}"])
      .limit(to: pageSize + 1)

    do {
      let snapshot = try await FirestoreAsyncBridge.getDocuments(query)
      return mapUsers(from: snapshot, excluding: uid, limit: pageSize)
    } catch {
      let snapshot = try await FirestoreAsyncBridge.getDocuments(query, source: .cache)
      return mapUsers(from: snapshot, excluding: uid, limit: pageSize)
    }
  }

  func fetchFollowedUserIDs(uid: String) async throws -> Set<String> {
    guard FirebaseBootstrap.isConfigured else { throw DiscoverRepoError.firebaseNotConfigured }

    let normalizedUID = uid.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !normalizedUID.isEmpty else { return [] }

    let db = self.db ?? Firestore.firestore()
    let query = db.collection("users")
      .document(normalizedUID)
      .collection("following")
      .limit(to: 300)

    do {
      let snapshot = try await FirestoreAsyncBridge.getDocuments(query)
      return followedUIDs(from: snapshot, excluding: normalizedUID)
    } catch {
      let snapshot = try await FirestoreAsyncBridge.getDocuments(query, source: .cache)
      return followedUIDs(from: snapshot, excluding: normalizedUID)
    }
  }

  func setFollowState(currentUID: String, targetUID: String, isFollowing: Bool) async throws {
    guard FirebaseBootstrap.isConfigured else { throw DiscoverRepoError.firebaseNotConfigured }

    let normalizedCurrentUID = currentUID.trimmingCharacters(in: .whitespacesAndNewlines)
    let normalizedTargetUID = targetUID.trimmingCharacters(in: .whitespacesAndNewlines)
    guard
      !normalizedCurrentUID.isEmpty,
      !normalizedTargetUID.isEmpty,
      normalizedCurrentUID != normalizedTargetUID
    else {
      return
    }

    let db = self.db ?? Firestore.firestore()
    let followingRef = db.collection("users")
      .document(normalizedCurrentUID)
      .collection("following")
      .document(normalizedTargetUID)

    if isFollowing {
      try await FirestoreAsyncBridge.setData(
        followingRef,
        data: [
          "uid": normalizedTargetUID,
          "source": "discover",
          "createdAt": FieldValue.serverTimestamp(),
          "updatedAt": FieldValue.serverTimestamp()
        ],
        merge: true
      )
    } else {
      try await FirestoreAsyncBridge.deleteDocument(followingRef)
    }
  }

  private func mapUsers(
    from snapshot: QuerySnapshot,
    excluding uid: String?,
    limit: Int
  ) -> [DiscoverUser] {
    let excludedUID = uid?.trimmingCharacters(in: .whitespacesAndNewlines)
    let users = snapshot.documents.compactMap { doc -> DiscoverUser? in
      if let excludedUID, doc.documentID == excludedUID { return nil }

      let data = doc.data()
      let displayName = FirestoreHelpers.nonEmptyString(data["displayName"])
        ?? FirestoreHelpers.nonEmptyString(data["username"])
        ?? "Usuario"

      let accountVisibility = (data["accountVisibility"] as? String) == ProfileAccountVisibility.private.rawValue
        ? ProfileAccountVisibility.private
        : ProfileAccountVisibility.public

      return DiscoverUser(
        uid: doc.documentID,
        displayName: displayName,
        photoURL: FirestoreHelpers.nonEmptyString(data["photoURL"]),
        accountVisibility: accountVisibility
      )
    }

    return Array(users.prefix(limit))
  }

  private func followedUIDs(from snapshot: QuerySnapshot, excluding uid: String) -> Set<String> {
    Set(
      snapshot.documents
        .map(\.documentID)
        .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
        .filter { !$0.isEmpty && $0 != uid }
    )
  }

}

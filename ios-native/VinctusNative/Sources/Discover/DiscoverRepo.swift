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
}

enum DiscoverRepoError: LocalizedError {
  case firebaseNotConfigured
  case missingSnapshot

  var errorDescription: String? {
    switch self {
    case .firebaseNotConfigured:
      return "Firebase no está configurado."
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
    guard FirebaseApp.app() != nil else { throw DiscoverRepoError.firebaseNotConfigured }

    let db = self.db ?? Firestore.firestore()
    let pageSize = max(1, min(30, limit))

    let query = db.collection("users_public")
      .order(by: "updatedAt", descending: true)
      .limit(to: pageSize + 1)

    do {
      let snapshot = try await query.getDocuments()
      return mapUsers(from: snapshot, excluding: uid, limit: pageSize)
    } catch {
      let snapshot = try await query.getDocuments(source: .cache)
      return mapUsers(from: snapshot, excluding: uid, limit: pageSize)
    }
  }

  func searchUsers(prefix: String, limit: Int, excluding uid: String?) async throws -> [DiscoverUser] {
    guard FirebaseApp.app() != nil else { throw DiscoverRepoError.firebaseNotConfigured }

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
      let snapshot = try await query.getDocuments()
      return mapUsers(from: snapshot, excluding: uid, limit: pageSize)
    } catch {
      let snapshot = try await query.getDocuments(source: .cache)
      return mapUsers(from: snapshot, excluding: uid, limit: pageSize)
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
      let displayName = FirestoreValue.string(data["displayName"])
        ?? FirestoreValue.string(data["username"])
        ?? "Usuario"

      let accountVisibility = (data["accountVisibility"] as? String) == ProfileAccountVisibility.private.rawValue
        ? ProfileAccountVisibility.private
        : ProfileAccountVisibility.public

      return DiscoverUser(
        uid: doc.documentID,
        displayName: displayName,
        photoURL: FirestoreValue.string(data["photoURL"]),
        accountVisibility: accountVisibility
      )
    }

    return Array(users.prefix(limit))
  }
}

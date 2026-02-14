import FirebaseCore
import FirebaseFirestore
import Foundation

enum ProfileAccountVisibility: String, Hashable {
  case `public`
  case `private`
}

struct UserProfile: Identifiable, Hashable {
  let id: String
  let displayName: String
  let photoURL: String?
  let username: String?
  let email: String?
  let bio: String?
  let role: String?
  let location: String?
  let reputation: Int
  let followersCount: Int
  let followingCount: Int
  let postsCount: Int
  let accountVisibility: ProfileAccountVisibility
  let createdAt: Date
  let updatedAt: Date
}

protocol ProfileRepo {
  func fetchUserProfile(uid: String) async throws -> UserProfile?
}

enum ProfileRepoError: LocalizedError {
  case firebaseNotConfigured
  case missingSnapshot

  var errorDescription: String? {
    switch self {
    case .firebaseNotConfigured:
      return "Firebase no esta configurado."
    case .missingSnapshot:
      return "No se pudo cargar el perfil."
    }
  }
}

final class FirebaseProfileRepo: ProfileRepo {
  private let db: Firestore?

  init(db: Firestore? = nil) {
    self.db = db
  }

  func fetchUserProfile(uid: String) async throws -> UserProfile? {
    guard FirebaseApp.app() != nil else { throw ProfileRepoError.firebaseNotConfigured }

    let normalizedUID = uid.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !normalizedUID.isEmpty else { return nil }

    let db = self.db ?? Firestore.firestore()
    let privateRef = db.collection("users").document(normalizedUID)
    let publicRef = db.collection("users_public").document(normalizedUID)

    async let privateData = getDocumentData(privateRef, allowPermissionDenied: true)
    async let publicData = getDocumentData(publicRef)

    let (privatePayload, publicPayload) = try await (privateData, publicData)

    guard privatePayload != nil || publicPayload != nil else {
      AppLog.profile.info("profile.notFound uid=\(normalizedUID, privacy: .private)")
      return nil
    }

    let visibility: ProfileAccountVisibility = {
      if
        let settings = privatePayload?["settings"] as? [String: Any],
        let privacy = settings["privacy"] as? [String: Any],
        let accountVisibility = privacy["accountVisibility"] as? String,
        accountVisibility == ProfileAccountVisibility.private.rawValue
      {
        return .private
      }

      if
        let accountVisibility = publicPayload?["accountVisibility"] as? String,
        accountVisibility == ProfileAccountVisibility.private.rawValue
      {
        return .private
      }

      return .public
    }()

    let profile = UserProfile(
      id: normalizedUID,
      displayName: nonEmptyString(privatePayload?["displayName"])
        ?? nonEmptyString(publicPayload?["displayName"])
        ?? nonEmptyString(privatePayload?["username"])
        ?? nonEmptyString(publicPayload?["username"])
        ?? "Usuario",
      photoURL: nonEmptyString(privatePayload?["photoURL"]) ?? nonEmptyString(publicPayload?["photoURL"]),
      username: nonEmptyString(privatePayload?["username"]) ?? nonEmptyString(publicPayload?["username"]),
      email: nonEmptyString(privatePayload?["email"]),
      bio: nonEmptyString(privatePayload?["bio"]),
      role: nonEmptyString(privatePayload?["role"]),
      location: nonEmptyString(privatePayload?["location"]),
      reputation: intValue(privatePayload?["reputation"]) ?? intValue(publicPayload?["reputation"]) ?? 0,
      followersCount: intValue(publicPayload?["followersCount"]) ?? intValue(privatePayload?["followersCount"]) ?? 0,
      followingCount: intValue(publicPayload?["followingCount"]) ?? intValue(privatePayload?["followingCount"]) ?? 0,
      postsCount: intValue(publicPayload?["postsCount"]) ?? intValue(privatePayload?["postsCount"]) ?? 0,
      accountVisibility: visibility,
      createdAt: dateValue(privatePayload?["createdAt"]) ?? dateValue(publicPayload?["createdAt"]) ?? Date(),
      updatedAt: dateValue(privatePayload?["updatedAt"]) ?? dateValue(publicPayload?["updatedAt"]) ?? Date()
    )

    return profile
  }

  private func getDocumentData(
    _ ref: DocumentReference,
    allowPermissionDenied: Bool = false
  ) async throws -> [String: Any]? {
    do {
      let snapshot = try await getDocument(ref)
      return snapshot.data()
    } catch {
      if allowPermissionDenied, isPermissionDenied(error) {
        AppLog.profile.info("profile.private.permissionDenied path=\(ref.path, privacy: .private)")
        return nil
      }
      throw error
    }
  }

  private func getDocument(_ ref: DocumentReference) async throws -> DocumentSnapshot {
    try await withCheckedThrowingContinuation { continuation in
      ref.getDocument { snapshot, error in
        if let error {
          continuation.resume(throwing: error)
          return
        }
        guard let snapshot else {
          continuation.resume(throwing: ProfileRepoError.missingSnapshot)
          return
        }
        continuation.resume(returning: snapshot)
      }
    }
  }

  private func isPermissionDenied(_ error: Error) -> Bool {
    let nsError = error as NSError
    return nsError.domain == FirestoreErrorDomain
      && nsError.code == FirestoreErrorCode.permissionDenied.rawValue
  }

  private func nonEmptyString(_ value: Any?) -> String? {
    guard let stringValue = value as? String else { return nil }
    let trimmed = stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
    return trimmed.isEmpty ? nil : trimmed
  }

  private func intValue(_ value: Any?) -> Int? {
    if let intValue = value as? Int { return intValue }
    if let number = value as? NSNumber { return number.intValue }
    if let string = value as? String, let parsed = Int(string) { return parsed }
    return nil
  }

  private func dateValue(_ value: Any?) -> Date? {
    if let timestamp = value as? Timestamp { return timestamp.dateValue() }
    if let date = value as? Date { return date }
    return nil
  }
}

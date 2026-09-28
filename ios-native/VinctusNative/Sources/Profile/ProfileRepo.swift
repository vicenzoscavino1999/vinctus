import FirebaseAuth
import FirebaseCore
import FirebaseFirestore
import FirebaseStorage
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
  /// Reputation earned per interest (category id -> points), like the web profile shows.
  var karmaByInterest: [String: Double] = [:]
}

/// Fields the edit sheet saves. `photo` is left alone unless it is set.
struct ProfileUpdate {
  enum Photo {
    case keep
    case remove
    case set(String)
  }

  var displayName: String
  var bio: String?
  var role: String?
  var location: String?
  var photo: Photo = .keep
}

protocol ProfileRepo {
  func fetchUserProfile(uid: String) async throws -> UserProfile?
  /// Saves the editable fields of the signed-in user's profile, like the web's
  /// `updateUserProfile` (`users/{uid}` plus the public name in `users_public/{uid}`).
  func updateProfile(uid: String, _ update: ProfileUpdate) async throws
  /// Uploads a JPEG to `profiles/{uid}/avatar/` (storage.rules) and returns its download URL.
  func uploadProfilePhoto(uid: String, jpegData: Data) async throws -> String
}

enum ProfileRepoError: LocalizedError {
  case firebaseNotConfigured
  case missingSnapshot

  var errorDescription: String? {
    switch self {
    case .firebaseNotConfigured:
      return "Firebase no está configurado."
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
      displayName: FirestoreValue.string(privatePayload?["displayName"])
        ?? FirestoreValue.string(publicPayload?["displayName"])
        ?? FirestoreValue.string(privatePayload?["username"])
        ?? FirestoreValue.string(publicPayload?["username"])
        ?? "Usuario",
      photoURL: FirestoreValue.string(privatePayload?["photoURL"]) ?? FirestoreValue.string(publicPayload?["photoURL"]),
      username: FirestoreValue.string(privatePayload?["username"]) ?? FirestoreValue.string(publicPayload?["username"]),
      email: FirestoreValue.string(privatePayload?["email"]),
      bio: FirestoreValue.string(privatePayload?["bio"]),
      role: FirestoreValue.string(privatePayload?["role"]),
      location: FirestoreValue.string(privatePayload?["location"]),
      reputation: FirestoreValue.int(privatePayload?["reputation"]) ?? FirestoreValue.int(publicPayload?["reputation"]) ?? 0,
      followersCount: FirestoreValue.int(publicPayload?["followersCount"]) ?? FirestoreValue.int(privatePayload?["followersCount"]) ?? 0,
      followingCount: FirestoreValue.int(publicPayload?["followingCount"]) ?? FirestoreValue.int(privatePayload?["followingCount"]) ?? 0,
      postsCount: FirestoreValue.int(publicPayload?["postsCount"]) ?? FirestoreValue.int(privatePayload?["postsCount"]) ?? 0,
      accountVisibility: visibility,
      createdAt: FirestoreValue.date(privatePayload?["createdAt"]) ?? FirestoreValue.date(publicPayload?["createdAt"]) ?? Date(),
      updatedAt: FirestoreValue.date(privatePayload?["updatedAt"]) ?? FirestoreValue.date(publicPayload?["updatedAt"]) ?? Date(),
      karmaByInterest: karma(privatePayload?["karmaByInterest"] ?? publicPayload?["karmaByInterest"])
    )

    return profile
  }

  /// Mirrors `updateUserProfile` in `src/shared/lib/firestore/profile.ts`, plus the Auth profile
  /// update the web's edit modal makes.
  func updateProfile(uid: String, _ update: ProfileUpdate) async throws {
    guard FirebaseApp.app() != nil else { throw ProfileRepoError.firebaseNotConfigured }
    let db = self.db ?? Firestore.firestore()
    let name = update.displayName.trimmingCharacters(in: .whitespacesAndNewlines)

    var privateFields: [String: Any] = [
      "displayName": name,
      "displayNameLowercase": name.lowercased(),
      "bio": update.bio ?? NSNull(),
      "role": update.role ?? NSNull(),
      "location": update.location ?? NSNull(),
      "updatedAt": FieldValue.serverTimestamp(),
    ]
    var publicFields: [String: Any] = [
      "displayName": name,
      "displayNameLowercase": name.lowercased(),
      "updatedAt": FieldValue.serverTimestamp(),
    ]
    var photoURL: URL??
    switch update.photo {
    case .keep:
      break
    case .remove:
      privateFields["photoURL"] = NSNull()
      publicFields["photoURL"] = NSNull()
      photoURL = .some(nil)
    case let .set(url):
      privateFields["photoURL"] = url
      publicFields["photoURL"] = url
      photoURL = .some(URL(string: url))
    }

    let batch = db.batch()
    batch.setData(privateFields, forDocument: db.collection("users").document(uid), merge: true)
    batch.setData(publicFields, forDocument: db.collection("users_public").document(uid), merge: true)
    try await batch.commit()

    if let user = Auth.auth().currentUser, user.uid == uid {
      let change = user.createProfileChangeRequest()
      change.displayName = name
      if let photoURL { change.photoURL = photoURL }
      try? await change.commitChanges()
    }
  }

  func uploadProfilePhoto(uid: String, jpegData: Data) async throws -> String {
    guard FirebaseApp.app() != nil else { throw ProfileRepoError.firebaseNotConfigured }
    let millis = Int64(Date().timeIntervalSince1970 * 1000)
    let ref = Storage.storage().reference(withPath: "profiles/\(uid)/avatar/\(millis)_avatar.jpg")
    let metadata = StorageMetadata()
    metadata.contentType = "image/jpeg"
    _ = try await ref.putDataAsync(jpegData, metadata: metadata)
    return try await ref.downloadURL().absoluteString
  }

  private func karma(_ value: Any?) -> [String: Double] {
    guard let map = value as? [String: Any] else { return [:] }
    return map.compactMapValues { ($0 as? NSNumber)?.doubleValue }
  }

  private func getDocumentData(
    _ ref: DocumentReference,
    allowPermissionDenied: Bool = false
  ) async throws -> [String: Any]? {
    do {
      let snapshot = try await ref.getDocument()
      return snapshot.data()
    } catch {
      if allowPermissionDenied, FirestoreValue.isPermissionDenied(error) {
        AppLog.profile.info("profile.private.permissionDenied path=\(ref.path, privacy: .private)")
        return nil
      }
      throw error
    }
  }
}

import FirebaseAuth
import FirebaseCore
import FirebaseFirestore
import Foundation

protocol UserProfileBootstrapRepo {
  /// Creates `users/{uid}` + `users_public/{uid}` for new accounts and backfills missing fields.
  func ensureCurrentUserProfile() async throws
}

enum UserProfileBootstrapRepoError: LocalizedError {
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

/// Native counterpart of `ensureUserProfile` in `src/app/providers/AuthContext.tsx`.
/// Keep both in sync: the rest of the app expects these docs to exist after sign-in.
final class FirebaseUserProfileBootstrapRepo: UserProfileBootstrapRepo {
  private let db: Firestore?

  init(db: Firestore? = nil) {
    self.db = db
  }

  func ensureCurrentUserProfile() async throws {
    guard FirebaseApp.app() != nil else { throw UserProfileBootstrapRepoError.firebaseNotConfigured }
    // Anonymous sessions are debug-only (technical login) and should not get profile docs.
    guard let user = Auth.auth().currentUser, !user.isAnonymous else { return }

    let db = self.db ?? Firestore.firestore()
    let userRef = db.collection("users").document(user.uid)
    let snapshot = try await getDocument(userRef)

    let authDisplayName = nonEmptyString(user.displayName)
    let authPhotoURL = nonEmptyString(user.photoURL?.absoluteString)
    let email = user.email
    let phoneNumber = user.phoneNumber

    let isNewUser = !snapshot.exists
    let resolvedDisplayName: String?
    let resolvedPhotoURL: String?
    let accountVisibility: String

    if isNewUser {
      resolvedDisplayName = authDisplayName
      resolvedPhotoURL = authPhotoURL
      accountVisibility = "public"

      try await setData(
        userRef,
        data: [
          "uid": user.uid,
          "displayName": nullable(authDisplayName),
          "displayNameLowercase": nullable(authDisplayName?.lowercased()),
          "email": nullable(email),
          "photoURL": nullable(authPhotoURL),
          "phoneNumber": nullable(phoneNumber),
          "reputation": 0,
          "karmaGlobal": 0,
          "karmaByInterest": [String: Any](),
          "settings": [
            "privacy": Self.defaultPrivacy,
            "notifications": Self.defaultNotifications,
          ],
          "createdAt": FieldValue.serverTimestamp(),
          "updatedAt": FieldValue.serverTimestamp(),
        ],
        merge: false
      )
    } else {
      let data = snapshot.data() ?? [:]
      let storedDisplayName = nonEmptyString(data["displayName"])
      let storedPhotoURL = nonEmptyString(data["photoURL"])
      let settings = data["settings"] as? [String: Any]
      let privacy = settings?["privacy"] as? [String: Any]
      let storedVisibility = privacy?["accountVisibility"] as? String

      resolvedDisplayName = storedDisplayName ?? authDisplayName
      resolvedPhotoURL = storedPhotoURL ?? authPhotoURL
      accountVisibility = storedVisibility == "private" ? "private" : "public"

      var updates: [String: Any] = [:]
      if storedDisplayName == nil, let authDisplayName {
        updates["displayName"] = authDisplayName
        updates["displayNameLowercase"] = authDisplayName.lowercased()
      } else if
        let storedDisplayName,
        data["displayNameLowercase"] as? String != storedDisplayName.lowercased()
      {
        updates["displayNameLowercase"] = storedDisplayName.lowercased()
      }

      if storedPhotoURL == nil, let authPhotoURL {
        updates["photoURL"] = authPhotoURL
      }

      if data["email"] as? String != email {
        updates["email"] = nullable(email)
      }

      if data["phoneNumber"] as? String != phoneNumber {
        updates["phoneNumber"] = nullable(phoneNumber)
      }

      if storedVisibility != "public" && storedVisibility != "private" {
        updates["settings.privacy"] = Self.defaultPrivacy
      } else if settings?["notifications"] == nil {
        updates["settings.notifications"] = Self.defaultNotifications
      }

      if !updates.isEmpty {
        updates["updatedAt"] = FieldValue.serverTimestamp()
        try await updateData(userRef, data: updates)
      }
    }

    var publicPayload: [String: Any] = [
      "uid": user.uid,
      "displayName": nullable(resolvedDisplayName),
      "displayNameLowercase": nullable(resolvedDisplayName?.lowercased()),
      "photoURL": nullable(resolvedPhotoURL),
      "accountVisibility": accountVisibility,
      "updatedAt": FieldValue.serverTimestamp(),
    ]

    if isNewUser {
      publicPayload["reputation"] = 0
      publicPayload["karmaGlobal"] = 0
      publicPayload["karmaByInterest"] = [String: Any]()
    }

    try await setData(
      db.collection("users_public").document(user.uid),
      data: publicPayload,
      merge: true
    )
    AppLog.profile.info("ensureUserProfile.success isNewUser=\(isNewUser, privacy: .public)")
  }

  private static let defaultPrivacy: [String: Any] = [
    "accountVisibility": "public",
    "allowDirectMessages": true,
    "showOnlineStatus": true,
    "showLastActive": true,
    "allowFriendRequests": true,
    "blockedUsers": [String](),
  ]

  private static let defaultNotifications: [String: Any] = [
    "pushEnabled": true,
    "emailEnabled": true,
    "mentionsOnly": false,
    "weeklyDigest": false,
    "productUpdates": true,
  ]

  private func getDocument(_ ref: DocumentReference) async throws -> DocumentSnapshot {
    try await withCheckedThrowingContinuation { continuation in
      ref.getDocument { snapshot, error in
        if let error {
          continuation.resume(throwing: error)
          return
        }
        guard let snapshot else {
          continuation.resume(throwing: UserProfileBootstrapRepoError.missingSnapshot)
          return
        }
        continuation.resume(returning: snapshot)
      }
    }
  }

  private func setData(_ ref: DocumentReference, data: [String: Any], merge: Bool) async throws {
    try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
      ref.setData(data, merge: merge) { error in
        if let error {
          continuation.resume(throwing: error)
          return
        }
        continuation.resume(returning: ())
      }
    }
  }

  private func updateData(_ ref: DocumentReference, data: [String: Any]) async throws {
    try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
      ref.updateData(data) { error in
        if let error {
          continuation.resume(throwing: error)
          return
        }
        continuation.resume(returning: ())
      }
    }
  }

  private func nonEmptyString(_ value: Any?) -> String? {
    guard let stringValue = value as? String else { return nil }
    let trimmed = stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
    return trimmed.isEmpty ? nil : trimmed
  }

  private func nullable(_ value: String?) -> Any {
    value ?? NSNull()
  }
}

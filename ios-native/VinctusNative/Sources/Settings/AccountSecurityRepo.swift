import FirebaseAuth
import FirebaseCore
import FirebaseFirestore
import FirebaseFunctions
import Foundation

protocol AccountSecurityRepo {
  func fetchAccountVisibility(uid: String) async throws -> ProfileAccountVisibility
  func setAccountVisibility(uid: String, visibility: ProfileAccountVisibility) async throws
  func revokeOtherSessions() async throws
}

enum AccountSecurityRepoError: LocalizedError {
  case firebaseNotConfigured
  case userNotAuthenticated
  case invalidResponse

  var errorDescription: String? {
    switch self {
    case .firebaseNotConfigured:
      return "Firebase no está configurado."
    case .userNotAuthenticated:
      return "Debes iniciar sesión."
    case .invalidResponse:
      return "Respuesta inválida del servidor."
    }
  }
}

final class FirebaseAccountSecurityRepo: AccountSecurityRepo {
  private let db: Firestore?
  private let functions: Functions?

  init(db: Firestore? = nil, functions: Functions? = nil) {
    self.db = db
    self.functions = functions
  }

  func fetchAccountVisibility(uid: String) async throws -> ProfileAccountVisibility {
    guard FirebaseApp.app() != nil else { throw AccountSecurityRepoError.firebaseNotConfigured }
    guard Auth.auth().currentUser != nil else { throw AccountSecurityRepoError.userNotAuthenticated }

    let db = self.db ?? Firestore.firestore()
    let userSnap = try await db.collection(FirestoreCollections.users).document(uid).getDocument()
    if
      let data = userSnap.data(),
      let settings = data["settings"] as? [String: Any],
      let privacy = settings["privacy"] as? [String: Any],
      let raw = privacy["accountVisibility"] as? String
    {
      return raw == ProfileAccountVisibility.private.rawValue ? .private : .public
    }

    let publicSnap = try await db.collection(FirestoreCollections.usersPublic).document(uid).getDocument()
    if let raw = publicSnap.data()?["accountVisibility"] as? String {
      return raw == ProfileAccountVisibility.private.rawValue ? .private : .public
    }

    return .public
  }

  /// Mirrors `updatePrivacySettings` in `src/shared/lib/firestore/profile.ts`: keeps both
  /// `users/{uid}.settings.privacy.accountVisibility` and `users_public/{uid}.accountVisibility` in sync.
  func setAccountVisibility(uid: String, visibility: ProfileAccountVisibility) async throws {
    guard FirebaseApp.app() != nil else { throw AccountSecurityRepoError.firebaseNotConfigured }
    guard Auth.auth().currentUser?.uid == uid else {
      throw AccountSecurityRepoError.userNotAuthenticated
    }

    let db = self.db ?? Firestore.firestore()
    let batch = db.batch()
    let userRef = db.collection(FirestoreCollections.users).document(uid)
    let publicRef = db.collection(FirestoreCollections.usersPublic).document(uid)

    batch.setData(
      [
        "settings": [
          "privacy": [
            "accountVisibility": visibility.rawValue,
          ],
        ],
        "updatedAt": FieldValue.serverTimestamp(),
      ],
      forDocument: userRef,
      merge: true
    )
    batch.setData(
      [
        "accountVisibility": visibility.rawValue,
        "updatedAt": FieldValue.serverTimestamp(),
      ],
      forDocument: publicRef,
      merge: true
    )

    try await batch.commit()
    AppLog.settings.info("privacy.visibility.updated visibility=\(visibility.rawValue, privacy: .public)")
  }

  func revokeOtherSessions() async throws {
    guard FirebaseApp.app() != nil else { throw AccountSecurityRepoError.firebaseNotConfigured }
    guard Auth.auth().currentUser != nil else { throw AccountSecurityRepoError.userNotAuthenticated }

    let callable = (functions ?? Functions.functions()).httpsCallable("revokeUserSessions")
    let result = try await callable.call()
    guard let data = result.data as? [String: Any], (data["ok"] as? Bool) == true else {
      throw AccountSecurityRepoError.invalidResponse
    }
    AppLog.settings.info("security.sessions.revoked")
  }
}

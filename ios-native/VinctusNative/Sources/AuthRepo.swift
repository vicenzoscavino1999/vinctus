import FirebaseAuth
import FirebaseCore
import Foundation

protocol AuthRepo {
  var currentUser: FirebaseAuth.User? { get }
  func signInAnonymously() async throws
  func signOut() throws
}

enum AuthRepoError: LocalizedError {
  case firebaseNotConfigured

  var errorDescription: String? {
    switch self {
    case .firebaseNotConfigured:
      return "Firebase not configured. Add GoogleService-Info plist for this environment."
    }
  }
}

final class FirebaseAuthRepo: AuthRepo {
  var currentUser: FirebaseAuth.User? {
    // FirebaseAuth will assert if Firebase isn't configured yet.
    guard FirebaseApp.app() != nil else { return nil }
    return Auth.auth().currentUser
  }

  func signInAnonymously() async throws {
    guard FirebaseApp.app() != nil else { throw AuthRepoError.firebaseNotConfigured }
    _ = try await Auth.auth().signInAnonymously()
  }

  func signOut() throws {
    guard FirebaseApp.app() != nil else { throw AuthRepoError.firebaseNotConfigured }
    try Auth.auth().signOut()
  }
}

import FirebaseAuth
import FirebaseCore
import Foundation
import GoogleSignIn
import UIKit

protocol AuthRepo {
  var currentUser: FirebaseAuth.User? { get }
  func signInAnonymously() async throws
  func signIn(email: String, password: String) async throws
  func createAccount(email: String, password: String) async throws
  @MainActor
  func signInWithGoogle(presentingViewController: UIViewController) async throws
  func signInWithApple(
    idTokenString: String,
    rawNonce: String,
    fullName: PersonNameComponents?
  ) async throws
  func sendPasswordReset(email: String) async throws
  func signOut() throws
}

enum AuthRepoError: LocalizedError {
  case firebaseNotConfigured
  case missingGoogleClientID
  case googleURLSchemeNotConfigured
  case missingGoogleIDToken
  case missingAppleIDToken
  case missingAppleNonce

  var errorDescription: String? {
    switch self {
    case .firebaseNotConfigured:
      return "Firebase not configured. Add GoogleService-Info plist for this environment."
    case .missingGoogleClientID:
      return "Google Sign-In is not configured. Missing Firebase client ID."
    case .googleURLSchemeNotConfigured:
      return "Google Sign-In URL scheme is missing. Set GOOGLE_REVERSED_CLIENT_ID from REVERSED_CLIENT_ID."
    case .missingGoogleIDToken:
      return "Google Sign-In failed to return an ID token."
    case .missingAppleIDToken:
      return "Apple Sign-In failed to return an identity token."
    case .missingAppleNonce:
      return "Apple Sign-In request nonce is missing."
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

  func signIn(email: String, password: String) async throws {
    guard FirebaseApp.app() != nil else { throw AuthRepoError.firebaseNotConfigured }

    try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
      Auth.auth().signIn(withEmail: email, password: password) { _, error in
        if let error = error {
          continuation.resume(throwing: error)
          return
        }
        continuation.resume(returning: ())
      }
    }
  }

  func createAccount(email: String, password: String) async throws {
    guard FirebaseApp.app() != nil else { throw AuthRepoError.firebaseNotConfigured }

    try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
      Auth.auth().createUser(withEmail: email, password: password) { _, error in
        if let error = error {
          continuation.resume(throwing: error)
          return
        }
        continuation.resume(returning: ())
      }
    }
  }

  @MainActor
  func signInWithGoogle(presentingViewController: UIViewController) async throws {
    guard FirebaseApp.app() != nil else { throw AuthRepoError.firebaseNotConfigured }
    guard let clientID = FirebaseApp.app()?.options.clientID, !clientID.isEmpty else {
      throw AuthRepoError.missingGoogleClientID
    }

    let reversedClientID = clientID.split(separator: ".").reversed().joined(separator: ".")
    guard hasURLScheme(reversedClientID) else {
      throw AuthRepoError.googleURLSchemeNotConfigured
    }

    GIDSignIn.sharedInstance.configuration = GIDConfiguration(clientID: clientID)
    let signInResult = try await GIDSignIn.sharedInstance.signIn(
      withPresenting: presentingViewController
    )

    guard let idToken = signInResult.user.idToken?.tokenString else {
      throw AuthRepoError.missingGoogleIDToken
    }

    let accessToken = signInResult.user.accessToken.tokenString
    let credential = GoogleAuthProvider.credential(withIDToken: idToken, accessToken: accessToken)
    _ = try await Auth.auth().signIn(with: credential)
  }

  func signInWithApple(
    idTokenString: String,
    rawNonce: String,
    fullName: PersonNameComponents?
  ) async throws {
    guard FirebaseApp.app() != nil else { throw AuthRepoError.firebaseNotConfigured }
    guard !idTokenString.isEmpty else { throw AuthRepoError.missingAppleIDToken }
    guard !rawNonce.isEmpty else { throw AuthRepoError.missingAppleNonce }

    let credential = OAuthProvider.appleCredential(
      withIDToken: idTokenString,
      rawNonce: rawNonce,
      fullName: fullName
    )
    _ = try await Auth.auth().signIn(with: credential)
  }

  func sendPasswordReset(email: String) async throws {
    guard FirebaseApp.app() != nil else { throw AuthRepoError.firebaseNotConfigured }

    try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
      Auth.auth().sendPasswordReset(withEmail: email) { error in
        if let error = error {
          continuation.resume(throwing: error)
          return
        }
        continuation.resume(returning: ())
      }
    }
  }

  func signOut() throws {
    guard FirebaseApp.app() != nil else { throw AuthRepoError.firebaseNotConfigured }
    try Auth.auth().signOut()
  }

  private func hasURLScheme(_ scheme: String) -> Bool {
    let urlTypes = Bundle.main.object(forInfoDictionaryKey: "CFBundleURLTypes") as? [[String: Any]]
      ?? []
    for type in urlTypes {
      guard let schemes = type["CFBundleURLSchemes"] as? [String] else { continue }
      if schemes.contains(where: { $0.caseInsensitiveCompare(scheme) == .orderedSame }) {
        return true
      }
    }
    return false
  }
}

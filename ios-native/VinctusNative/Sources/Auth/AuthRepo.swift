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
  /// Calls `onChange` with whether someone is signed in each time Firebase's session changes,
  /// including when Firebase ends it on its own (account disabled, deleted or tokens revoked).
  /// The observation lasts as long as the app (AuthViewModel lives for the whole app).
  func observeSession(_ onChange: @escaping (Bool) -> Void)
}

enum AuthRepoError: LocalizedError {
  case firebaseNotConfigured
  case missingGoogleClientID
  case googleURLSchemeNotConfigured
  case googleSignInCanceled
  case missingGoogleIDToken
  case missingAppleIDToken
  case missingAppleNonce

  var errorDescription: String? {
    switch self {
    case .firebaseNotConfigured:
      return "Firebase no está configurado. Falta el archivo GoogleService-Info de este entorno."
    case .missingGoogleClientID:
      return "El inicio de sesión con Google no está configurado (falta el client ID de Firebase)."
    case .googleURLSchemeNotConfigured:
      return "Falta el URL scheme de Google. Define GOOGLE_REVERSED_CLIENT_ID en Config/<Env>.local.xcconfig."
    case .googleSignInCanceled:
      return "Inicio de sesión con Google cancelado."
    case .missingGoogleIDToken:
      return "Google no devolvió un token de identidad. Intenta de nuevo."
    case .missingAppleIDToken:
      return "Apple no devolvió un token de identidad. Intenta de nuevo."
    case .missingAppleNonce:
      return "No se pudo iniciar sesión con Apple. Intenta de nuevo."
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

    _ = try await Auth.auth().signIn(withEmail: email, password: password)
  }

  func createAccount(email: String, password: String) async throws {
    guard FirebaseApp.app() != nil else { throw AuthRepoError.firebaseNotConfigured }

    _ = try await Auth.auth().createUser(withEmail: email, password: password)
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
    let signInResult: GIDSignInResult
    do {
      signInResult = try await GIDSignIn.sharedInstance.signIn(
        withPresenting: presentingViewController
      )
    } catch let error as GIDSignInError where error.code == .canceled {
      throw AuthRepoError.googleSignInCanceled
    }

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

    // The reset email follows the app's language (Spanish) instead of Firebase's default English.
    Auth.auth().languageCode = "es"
    try await Auth.auth().sendPasswordReset(withEmail: email)
  }

  func signOut() throws {
    guard FirebaseApp.app() != nil else { throw AuthRepoError.firebaseNotConfigured }
    try Auth.auth().signOut()
  }

  func observeSession(_ onChange: @escaping (Bool) -> Void) {
    guard FirebaseApp.app() != nil else { return }
    _ = Auth.auth().addStateDidChangeListener { _, user in
      onChange(user != nil)
    }
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

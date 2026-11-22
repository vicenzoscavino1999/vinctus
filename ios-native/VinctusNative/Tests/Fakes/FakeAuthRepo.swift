import FirebaseAuth
import Foundation
import UIKit
@testable import VinctusNative

final class FakeAuthRepo: AuthRepo {
  var currentUser: FirebaseAuth.User?
  var signInCalls: [(email: String, password: String)] = []
  var createAccountCalls: [(email: String, password: String)] = []
  var passwordResetEmails: [String] = []
  var signOutCount = 0
  var nextError: Error?
  var onSessionChange: ((Bool) -> Void)?

  func signInAnonymously() async throws {
    if let nextError { throw nextError }
  }

  func signIn(email: String, password: String) async throws {
    if let nextError { throw nextError }
    signInCalls.append((email: email, password: password))
  }

  func createAccount(email: String, password: String) async throws {
    if let nextError { throw nextError }
    createAccountCalls.append((email: email, password: password))
  }

  @MainActor
  func signInWithGoogle(presentingViewController: UIViewController) async throws {
    if let nextError { throw nextError }
  }

  func signInWithApple(
    idTokenString: String,
    rawNonce: String,
    fullName: PersonNameComponents?
  ) async throws {
    if let nextError { throw nextError }
  }

  func sendPasswordReset(email: String) async throws {
    passwordResetEmails.append(email)
    if let nextError { throw nextError }
  }

  func signOut() throws {
    if let nextError { throw nextError }
    signOutCount += 1
    onSessionChange?(false)
  }

  func observeSession(_ onChange: @escaping (Bool) -> Void) {
    onSessionChange = onChange
  }
}

final class FakeProfileBootstrapRepo: UserProfileBootstrapRepo {
  var ensureCalls = 0
  var fails = false

  func ensureCurrentUserProfile() async throws {
    ensureCalls += 1
    if fails { throw FakeError() }
  }
}

import Foundation
import OSLog
import UIKit

@MainActor
final class AuthViewModel: ObservableObject {
  @Published private(set) var isSignedIn = false
  @Published var errorMessage: String?
  @Published var infoMessage: String?

  private let repo: AuthRepo

  var currentUserID: String? {
    repo.currentUser?.uid
  }

  var currentUserDisplayName: String {
    if let displayName = normalizedNonEmpty(repo.currentUser?.displayName) {
      return displayName
    }
    if let email = normalizedNonEmpty(repo.currentUser?.email) {
      return email.components(separatedBy: "@").first?.capitalized ?? email
    }
    if let userID = normalizedNonEmpty(repo.currentUser?.uid) {
      return userID
    }
    return "Usuario"
  }

  var currentUserEmail: String? {
    normalizedNonEmpty(repo.currentUser?.email)
  }

  init(repo: AuthRepo) {
    self.repo = repo
    self.isSignedIn = repo.currentUser != nil
  }

  func signIn(email: String, password: String) {
    errorMessage = nil
    infoMessage = nil
    Task {
      do {
        AppLog.auth.info("signIn.email.start")
        try await repo.signIn(email: email, password: password)
        isSignedIn = true
        AppLog.auth.info("signIn.email.success")
      } catch {
        AppLog.auth.error("signIn.email.failed errorType=\(AppLog.errorType(error), privacy: .public)")
        errorMessage = error.localizedDescription
      }
    }
  }

  func createAccount(email: String, password: String) {
    errorMessage = nil
    infoMessage = nil
    Task {
      do {
        AppLog.auth.info("createAccount.email.start")
        try await repo.createAccount(email: email, password: password)
        isSignedIn = true
        AppLog.auth.info("createAccount.email.success")
      } catch {
        AppLog.auth.error(
          "createAccount.email.failed errorType=\(AppLog.errorType(error), privacy: .public)"
        )
        errorMessage = error.localizedDescription
      }
    }
  }

  func signInWithGoogle(presentingViewController: UIViewController) {
    errorMessage = nil
    infoMessage = nil
    Task {
      do {
        AppLog.auth.info("signIn.google.start")
        try await repo.signInWithGoogle(presentingViewController: presentingViewController)
        isSignedIn = true
        AppLog.auth.info("signIn.google.success")
      } catch {
        AppLog.auth.error("signIn.google.failed errorType=\(AppLog.errorType(error), privacy: .public)")
        errorMessage = error.localizedDescription
      }
    }
  }

  func signInWithApple(
    idTokenString: String,
    rawNonce: String,
    fullName: PersonNameComponents?
  ) {
    errorMessage = nil
    infoMessage = nil
    Task {
      do {
        AppLog.auth.info("signIn.apple.start")
        try await repo.signInWithApple(
          idTokenString: idTokenString,
          rawNonce: rawNonce,
          fullName: fullName
        )
        isSignedIn = true
        AppLog.auth.info("signIn.apple.success")
      } catch {
        AppLog.auth.error("signIn.apple.failed errorType=\(AppLog.errorType(error), privacy: .public)")
        errorMessage = error.localizedDescription
      }
    }
  }

  func sendPasswordReset(email: String) {
    errorMessage = nil
    infoMessage = nil
    Task {
      do {
        AppLog.auth.info("passwordReset.start")
        try await repo.sendPasswordReset(email: email)
        AppLog.auth.info("passwordReset.success")
        infoMessage = "Password reset email sent (if the account exists)."
      } catch {
        AppLog.auth.error(
          "passwordReset.failed errorType=\(AppLog.errorType(error), privacy: .public)"
        )
        errorMessage = error.localizedDescription
      }
    }
  }

  func signInAnonymously() {
    errorMessage = nil
    infoMessage = nil
    Task {
      do {
        AppLog.auth.info("signInAnonymously.start")
        try await repo.signInAnonymously()
        isSignedIn = true
        AppLog.auth.info("signInAnonymously.success")
      } catch {
        AppLog.auth.error(
          "signInAnonymously.failed errorType=\(AppLog.errorType(error), privacy: .public)"
        )
        errorMessage = error.localizedDescription
      }
    }
  }

  func signOut() {
    errorMessage = nil
    infoMessage = nil
    do {
      try repo.signOut()
      isSignedIn = false
    } catch {
      AppLog.auth.error("signOut.failed errorType=\(AppLog.errorType(error), privacy: .public)")
      errorMessage = error.localizedDescription
    }
  }

  private func normalizedNonEmpty(_ value: String?) -> String? {
    guard let value else { return nil }
    let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
    return trimmed.isEmpty ? nil : trimmed
  }
}

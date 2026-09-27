import Foundation
import OSLog
import UIKit

@MainActor
final class AuthViewModel: ObservableObject {
  @Published private(set) var isSignedIn = false
  @Published var errorMessage: String?
  @Published var infoMessage: String?

  private let repo: AuthRepo
  private let profileBootstrap: UserProfileBootstrapRepo

  var currentUserID: String? {
    repo.currentUser?.uid
  }

  /// Whether the account can sign in with Apple, so deleting it must also revoke the Apple tokens.
  var isSignedInWithApple: Bool {
    repo.currentUser?.providerData.contains { $0.providerID == "apple.com" } ?? false
  }

  init(
    repo: AuthRepo,
    profileBootstrap: UserProfileBootstrapRepo = FirebaseUserProfileBootstrapRepo()
  ) {
    self.repo = repo
    self.profileBootstrap = profileBootstrap
    self.isSignedIn = repo.currentUser != nil
    if isSignedIn {
      ensureUserProfile()
    }
  }

  func signIn(email: String, password: String) {
    errorMessage = nil
    infoMessage = nil
    Task {
      do {
        AppLog.auth.info("signIn.email.start")
        try await repo.signIn(email: email, password: password)
        isSignedIn = true
        ensureUserProfile()
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
        ensureUserProfile()
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
        ensureUserProfile()
        AppLog.auth.info("signIn.google.success")
      } catch AuthRepoError.googleSignInCanceled {
        AppLog.auth.info("signIn.google.canceled")
        infoMessage = "Inicio de sesion con Google cancelado."
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
        ensureUserProfile()
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
        infoMessage = "Si la cuenta existe, te enviamos un correo para restablecer la contrasena."
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

  /// Creates or backfills the Firestore profile docs, like the web app does on every sign-in.
  /// Runs in the background so a slow or offline write never blocks entering the app.
  private func ensureUserProfile() {
    Task {
      do {
        try await profileBootstrap.ensureCurrentUserProfile()
      } catch {
        AppLog.auth.error(
          "ensureUserProfile.failed errorType=\(AppLog.errorType(error), privacy: .public)"
        )
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
}

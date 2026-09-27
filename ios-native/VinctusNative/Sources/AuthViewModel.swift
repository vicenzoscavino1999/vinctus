import FirebaseAuth
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
        errorMessage = Self.message(for: error)
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
        errorMessage = Self.message(for: error)
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
        infoMessage = "Inicio de sesión con Google cancelado."
      } catch {
        AppLog.auth.error("signIn.google.failed errorType=\(AppLog.errorType(error), privacy: .public)")
        errorMessage = Self.message(for: error)
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
        errorMessage = Self.message(for: error)
      }
    }
  }

  /// Sends the password reset email. Returns an error message to show, or nil when it was sent.
  func requestPasswordReset(email: String) async -> String? {
    let email = email.trimmingCharacters(in: .whitespacesAndNewlines)
    guard Self.looksLikeEmail(email) else {
      return "Escribe un email válido."
    }
    do {
      AppLog.auth.info("passwordReset.start")
      try await repo.sendPasswordReset(email: email)
      AppLog.auth.info("passwordReset.success")
      return nil
    } catch {
      AppLog.auth.error(
        "passwordReset.failed errorType=\(AppLog.errorType(error), privacy: .public)"
      )
      // Don't reveal whether an account exists for this email.
      if (error as NSError).code == AuthErrorCode.userNotFound.rawValue {
        return nil
      }
      return Self.message(for: error)
    }
  }

  static func looksLikeEmail(_ value: String) -> Bool {
    value.range(of: #"^[^@\s]+@[^@\s]+\.[^@\s]+$"#, options: .regularExpression) != nil
  }

  /// Firebase Auth errors come in English; show them in Spanish.
  static func message(for error: Error) -> String {
    let nsError = error as NSError
    guard nsError.domain == AuthErrorDomain, let code = AuthErrorCode(rawValue: nsError.code) else {
      return error.localizedDescription
    }
    switch code {
    case .invalidEmail, .missingEmail:
      return "Escribe un email válido."
    case .wrongPassword, .invalidCredential, .userNotFound:
      return "Email o contraseña incorrectos."
    case .emailAlreadyInUse:
      return "Ya existe una cuenta con ese email. Inicia sesión o recupera tu contraseña."
    case .weakPassword:
      return "La contraseña debe tener al menos 6 caracteres."
    case .userDisabled:
      return "Tu cuenta fue suspendida por incumplir las normas de la comunidad. Escríbenos a \(LegalConfig.supportEmail) si crees que es un error."
    case .tooManyRequests:
      return "Demasiados intentos. Espera unos minutos e intenta de nuevo."
    case .networkError:
      return "Sin conexión a internet. Revisa tu conexión e intenta de nuevo."
    case .accountExistsWithDifferentCredential:
      return "Ya tienes una cuenta con ese email usando otro método (Apple, Google o contraseña)."
    default:
      return "No se pudo completar. Intenta de nuevo."
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
        errorMessage = Self.message(for: error)
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
      errorMessage = Self.message(for: error)
    }
  }
}

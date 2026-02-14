import AuthenticationServices
import CryptoKit
import FirebaseCore
import Foundation
import Security
import SwiftUI
import UIKit

struct AuthGateView: View {
  @EnvironmentObject private var authVM: AuthViewModel
  @State private var email = ""
  @State private var password = ""
  @State private var appleRawNonce = ""
  @State private var showDebug = false

  var body: some View {
    VStack(alignment: .leading, spacing: VinctusTokens.Spacing.lg) {
      VStack(alignment: .leading, spacing: 8) {
        Text("VinctusNative")
          .font(.largeTitle)
          .bold()

        Text("Base nativa iOS")
          .foregroundStyle(.secondary)

        HStack(spacing: 14) {
          VInlineStatus(title: "Env: \(AppEnvironment.current.rawValue)", isGood: true)
          VInlineStatus(
            title: !FirebaseBootstrap.isConfigured ? "Firebase: NOT configured" : "Firebase: configured",
            isGood: FirebaseBootstrap.isConfigured
          )
        }
      }

      if let error = authVM.errorMessage {
        VCard {
          Text(error)
            .foregroundStyle(.red)
            .font(.footnote)
        }
      }

      if let info = authVM.infoMessage {
        VCard {
          Text(info)
            .foregroundStyle(.green)
            .font(.footnote)
        }
      }

      VCard {
        VStack(alignment: .leading, spacing: VinctusTokens.Spacing.md) {
          Text("Ingresar")
            .font(.headline)

          TextField("Email", text: $email)
            .textInputAutocapitalization(.never)
            .keyboardType(.emailAddress)
            .autocorrectionDisabled()
            .textContentType(.username)
            .padding(12)
            .background(VinctusTokens.Color.surface2)
            .clipShape(RoundedRectangle(cornerRadius: VinctusTokens.Radius.sm, style: .continuous))

          SecureField("Password", text: $password)
            .textContentType(.password)
            .padding(12)
            .background(VinctusTokens.Color.surface2)
            .clipShape(RoundedRectangle(cornerRadius: VinctusTokens.Radius.sm, style: .continuous))

          VButton("Sign in", variant: .primary) {
            authVM.signIn(email: email.trimmingCharacters(in: .whitespacesAndNewlines), password: password)
          }

          VButton("Create account", variant: .secondary) {
            authVM.createAccount(
              email: email.trimmingCharacters(in: .whitespacesAndNewlines),
              password: password
            )
          }

          Button("Forgot password?") {
            authVM.sendPasswordReset(email: email.trimmingCharacters(in: .whitespacesAndNewlines))
          }
          .font(.subheadline)
          .foregroundStyle(VinctusTokens.Color.accent)

          Divider().padding(.vertical, 4)

          Text("Social login")
            .font(.subheadline)
            .foregroundStyle(.secondary)

          VButton("Continue with Google", variant: .secondary) {
            AppLog.auth.info("signIn.google.tap")
            guard let presentingViewController = topViewControllerForGoogleSignIn() else {
              authVM.errorMessage = "Could not start Google Sign-In. Please try again."
              return
            }
            authVM.signInWithGoogle(presentingViewController: presentingViewController)
          }

          SignInWithAppleButton(
            .continue,
            onRequest: configureAppleSignInRequest,
            onCompletion: handleAppleSignInCompletion
          )
          .signInWithAppleButtonStyle(.black)
          .frame(maxWidth: .infinity)
          .frame(height: 48)
          .clipShape(RoundedRectangle(cornerRadius: VinctusTokens.Radius.md, style: .continuous))
        }
      }

      Button(showDebug ? "Hide debug" : "Show debug") {
        showDebug.toggle()
      }
      .font(.footnote)
      .foregroundStyle(.secondary)

      if showDebug {
        VCard {
          VStack(alignment: .leading, spacing: VinctusTokens.Spacing.md) {
            Text("Debug")
              .font(.headline)

            Text("Acciones tecnicas (no productivo).")
              .font(.subheadline)
              .foregroundStyle(.secondary)

            VButton("Technical login (anonymous)", variant: .secondary) {
              AppLog.auth.info("signInAnonymously.tap")
              authVM.signInAnonymously()
            }
          }
        }
      }

      Spacer()
    }
    .padding(VinctusTokens.Spacing.xl)
    .background(SwiftUI.Color(uiColor: .systemBackground))
  }

  private func topViewControllerForGoogleSignIn() -> UIViewController? {
    let scenes = UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .filter { $0.activationState == .foregroundActive }

    for scene in scenes {
      guard let root = scene.windows.first(where: { $0.isKeyWindow })?.rootViewController else {
        continue
      }
      return topMostPresentedViewController(from: root)
    }

    return nil
  }

  private func topMostPresentedViewController(from root: UIViewController) -> UIViewController {
    var current = root
    while let presented = current.presentedViewController {
      current = presented
    }
    return current
  }

  private func configureAppleSignInRequest(_ request: ASAuthorizationAppleIDRequest) {
    authVM.errorMessage = nil
    authVM.infoMessage = nil
    AppLog.auth.info("signIn.apple.request.start")
    let nonce = randomNonceString()
    appleRawNonce = nonce
    request.requestedScopes = [.fullName, .email]
    request.nonce = sha256(nonce)
  }

  private func handleAppleSignInCompletion(_ result: Result<ASAuthorization, Error>) {
    switch result {
    case .success(let authorization):
      guard let appleIDCredential = authorization.credential as? ASAuthorizationAppleIDCredential else {
        authVM.errorMessage = "Apple Sign-In failed. Invalid credential type."
        return
      }
      guard !appleRawNonce.isEmpty else {
        authVM.errorMessage = "Apple Sign-In request nonce is missing."
        return
      }
      guard
        let identityToken = appleIDCredential.identityToken,
        let idTokenString = String(data: identityToken, encoding: .utf8),
        !idTokenString.isEmpty
      else {
        authVM.errorMessage = "Apple Sign-In failed to return identity token."
        return
      }

      AppLog.auth.info("signIn.apple.tap")
      authVM.signInWithApple(
        idTokenString: idTokenString,
        rawNonce: appleRawNonce,
        fullName: appleIDCredential.fullName
      )

    case .failure(let error):
      if let authError = error as? ASAuthorizationError, authError.code == .canceled {
        AppLog.auth.info("signIn.apple.canceled")
        authVM.errorMessage = nil
        authVM.infoMessage = "Apple Sign-In canceled."
        return
      }
      AppLog.auth.error("signIn.apple.failed errorType=\(AppLog.errorType(error), privacy: .public)")
      authVM.errorMessage = error.localizedDescription
    }
  }

  private func randomNonceString(length: Int = 32) -> String {
    precondition(length > 0)

    let charset = Array("0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._")
    var result = ""
    var remainingLength = length

    while remainingLength > 0 {
      var randoms = [UInt8](repeating: 0, count: 16)
      let errorCode = SecRandomCopyBytes(kSecRandomDefault, randoms.count, &randoms)
      if errorCode != errSecSuccess {
        let fallback = UUID().uuidString.replacingOccurrences(of: "-", with: "")
        return String(fallback.prefix(length))
      }

      randoms.forEach { random in
        if remainingLength == 0 { return }
        if Int(random) < charset.count {
          result.append(charset[Int(random)])
          remainingLength -= 1
        }
      }
    }

    return result
  }

  private func sha256(_ input: String) -> String {
    let digest = SHA256.hash(data: Data(input.utf8))
    return digest.map { String(format: "%02x", $0) }.joined()
  }
}

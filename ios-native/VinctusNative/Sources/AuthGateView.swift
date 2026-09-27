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
  @State private var isShowingTerms = false
  /// Sign-in action waiting for the terms to be accepted.
  @State private var pendingAction: (() -> Void)?
  // Remembered on this device so returning users aren't asked on every sign-in.
  @AppStorage("vinctus.acceptedTerms") private var acceptedTerms = false

  var body: some View {
    ScrollView {
      VStack(spacing: VinctusTokens.Spacing.xl) {
        header
          .padding(.top, 36)

        #if DEBUG
        HStack(spacing: 14) {
          VInlineStatus(title: "Env: \(AppEnvironment.current.rawValue)", isGood: true)
          VInlineStatus(
            title: FirebaseApp.app() == nil ? "Firebase: NOT configured" : "Firebase: configured",
            isGood: FirebaseApp.app() != nil
          )
        }
        #endif

        messages

        socialButtons

        orDivider

        emailForm

        termsFooter

        #if DEBUG
        debugTools
        #endif
      }
      .padding(.horizontal, VinctusTokens.Spacing.xl)
      .padding(.bottom, VinctusTokens.Spacing.xl)
    }
    .scrollDismissesKeyboard(.interactively)
    .background(background)
    .onAppear {
      // Lets the screenshot workflow (.github/workflows/ios-screenshots.yml) capture the sheet.
      if ProcessInfo.processInfo.arguments.contains("-VinctusShowTerms") {
        isShowingTerms = true
      }
    }
    .sheet(isPresented: $isShowingTerms, onDismiss: { pendingAction = nil }) {
      TermsAcceptanceSheet {
        acceptedTerms = true
        let action = pendingAction
        pendingAction = nil
        isShowingTerms = false
        if let action {
          action()
        } else {
          authVM.infoMessage = "Listo. Ahora toca Continuar con Apple."
        }
      }
      .presentationDetents([.medium, .large])
      .presentationDragIndicator(.visible)
    }
  }

  // MARK: Sections

  private var header: some View {
    VStack(spacing: VinctusTokens.Spacing.md) {
      Image("Logo")
        .resizable()
        .scaledToFill()
        .frame(width: 96, height: 96)
        .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
        .overlay(
          RoundedRectangle(cornerRadius: 24, style: .continuous)
            .stroke(.white.opacity(0.12), lineWidth: 1)
        )
        .shadow(color: logoGlow.opacity(0.25), radius: 28, y: 6)
        .accessibilityHidden(true)

      Text("Vinctus")
        .font(.system(size: 44, weight: .semibold, design: .serif))
        .tracking(1.5)
        .foregroundStyle(VinctusTokens.Color.textPrimary)

      Text("Conecta con personas que comparten tus intereses")
        .font(.subheadline)
        .multilineTextAlignment(.center)
        .foregroundStyle(VinctusTokens.Color.textMuted)
    }
    .frame(maxWidth: .infinity)
  }

  @ViewBuilder
  private var messages: some View {
    if let error = authVM.errorMessage {
      AuthBanner(text: error, systemImage: "exclamationmark.triangle.fill", tint: .red)
    }
    if let info = authVM.infoMessage {
      AuthBanner(text: info, systemImage: "checkmark.circle.fill", tint: .green)
    }
  }

  private var socialButtons: some View {
    VStack(spacing: VinctusTokens.Spacing.sm) {
      SignInWithAppleButton(
        .continue,
        onRequest: configureAppleSignInRequest,
        onCompletion: handleAppleSignInCompletion
      )
      .signInWithAppleButtonStyle(.white)
      .frame(maxWidth: .infinity)
      .frame(height: 52)
      .clipShape(RoundedRectangle(cornerRadius: VinctusTokens.Radius.md, style: .continuous))
      // Apple's button starts its flow on tap, so until the terms are accepted a transparent
      // layer asks for them first.
      .overlay {
        if !acceptedTerms {
          SwiftUI.Color.clear
            .contentShape(Rectangle())
            .onTapGesture { requireTerms(then: nil) }
            .accessibilityLabel("Continuar con Apple")
            .accessibilityAddTraits(.isButton)
        }
      }

      Button {
        guarded { signInWithGoogle() }
      } label: {
        HStack(spacing: 10) {
          Text("G")
            .font(.system(size: 20, weight: .bold, design: .rounded))
            .foregroundStyle(
              LinearGradient(
                colors: [.blue, .red, .yellow, .green],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
              )
            )
          Text("Continuar con Google")
            .font(.system(size: 19, weight: .medium))
        }
        .frame(maxWidth: .infinity)
        .frame(height: 52)
        .foregroundStyle(VinctusTokens.Color.textPrimary)
        .background(VinctusTokens.Color.surface2)
        .clipShape(RoundedRectangle(cornerRadius: VinctusTokens.Radius.md, style: .continuous))
        .overlay(
          RoundedRectangle(cornerRadius: VinctusTokens.Radius.md, style: .continuous)
            .stroke(VinctusTokens.Color.border.opacity(0.7), lineWidth: 1)
        )
      }
      .buttonStyle(.plain)
    }
  }

  private var orDivider: some View {
    HStack(spacing: 12) {
      Rectangle().fill(VinctusTokens.Color.border.opacity(0.6)).frame(height: 1)
      Text("o con tu email")
        .font(.footnote)
        .foregroundStyle(VinctusTokens.Color.textMuted)
        .fixedSize()
      Rectangle().fill(VinctusTokens.Color.border.opacity(0.6)).frame(height: 1)
    }
  }

  private var emailForm: some View {
    VStack(spacing: VinctusTokens.Spacing.sm) {
      AuthField(systemImage: "envelope") {
        TextField("Email", text: $email)
          .textInputAutocapitalization(.never)
          .keyboardType(.emailAddress)
          .autocorrectionDisabled()
          .textContentType(.username)
      }

      AuthField(systemImage: "lock") {
        SecureField("Contraseña", text: $password)
          .textContentType(.password)
      }

      HStack {
        Spacer()
        Button("¿Olvidaste tu contraseña?") {
          authVM.sendPasswordReset(email: trimmedEmail)
        }
        .font(.footnote)
        .foregroundStyle(VinctusTokens.Color.accent)
      }

      VButton("Ingresar", variant: .primary) {
        guarded { authVM.signIn(email: trimmedEmail, password: password) }
      }
      .padding(.top, 4)

      HStack(spacing: 4) {
        Text("¿No tienes cuenta?")
          .foregroundStyle(VinctusTokens.Color.textMuted)
        Button("Crear cuenta") {
          guarded { authVM.createAccount(email: trimmedEmail, password: password) }
        }
        .fontWeight(.semibold)
        .foregroundStyle(VinctusTokens.Color.accent)
      }
      .font(.subheadline)
      .padding(.top, 4)
    }
  }

  private var termsFooter: some View {
    Text(termsFooterText)
      .font(.caption)
      .multilineTextAlignment(.center)
      .foregroundStyle(VinctusTokens.Color.textMuted)
      .tint(VinctusTokens.Color.accent)
      .padding(.top, VinctusTokens.Spacing.sm)
  }

  #if DEBUG
  @ViewBuilder
  private var debugTools: some View {
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
          VButton("Technical login (anonymous)", variant: .secondary) {
            AppLog.auth.info("signInAnonymously.tap")
            authVM.signInAnonymously()
          }
        }
      }
    }
  }
  #endif

  private var background: some View {
    ZStack {
      VinctusTokens.Color.background
      RadialGradient(
        colors: [logoGlow.opacity(0.14), .clear],
        center: .top,
        startRadius: 10,
        endRadius: 420
      )
      RadialGradient(
        colors: [VinctusTokens.Color.accent.opacity(0.10), .clear],
        center: .bottomTrailing,
        startRadius: 10,
        endRadius: 380
      )
    }
    .ignoresSafeArea()
  }

  // MARK: Helpers

  /// Soft light behind the white Vinctus logo.
  private var logoGlow: SwiftUI.Color { SwiftUI.Color(red: 0.85, green: 0.88, blue: 0.95) }

  private var trimmedEmail: String {
    email.trimmingCharacters(in: .whitespacesAndNewlines)
  }

  private var termsFooterText: AttributedString {
    let markdown =
      "Al continuar aceptas los [Términos de servicio](\(LegalConfig.termsOfServiceURL.absoluteString)) y las [Normas de la comunidad](\(LegalConfig.communityGuidelinesURL.absoluteString)) de Vinctus."
    return (try? AttributedString(markdown: markdown))
      ?? AttributedString("Al continuar aceptas los Términos de servicio y las Normas de la comunidad de Vinctus.")
  }

  /// Runs a sign-in action, asking to accept the terms first if needed (App Review Guideline 1.2).
  private func guarded(_ action: @escaping () -> Void) {
    if acceptedTerms {
      action()
    } else {
      requireTerms(then: action)
    }
  }

  private func requireTerms(then action: (() -> Void)?) {
    authVM.errorMessage = nil
    authVM.infoMessage = nil
    pendingAction = action
    isShowingTerms = true
  }

  private func signInWithGoogle() {
    AppLog.auth.info("signIn.google.tap")
    guard let presentingViewController = topViewControllerForGoogleSignIn() else {
      authVM.errorMessage = "No se pudo abrir el inicio de sesión con Google. Intenta de nuevo."
      return
    }
    authVM.signInWithGoogle(presentingViewController: presentingViewController)
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
        authVM.errorMessage = "No se pudo iniciar sesión con Apple. Intenta de nuevo."
        return
      }
      guard !appleRawNonce.isEmpty else {
        authVM.errorMessage = "No se pudo iniciar sesión con Apple. Intenta de nuevo."
        return
      }
      guard
        let identityToken = appleIDCredential.identityToken,
        let idTokenString = String(data: identityToken, encoding: .utf8),
        !idTokenString.isEmpty
      else {
        authVM.errorMessage = "No se pudo iniciar sesión con Apple. Intenta de nuevo."
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
        authVM.infoMessage = "Inicio de sesión con Apple cancelado."
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

/// Asks to agree to the terms, which rule out objectionable content and abusive users
/// (App Review Guideline 1.2), before the first sign-in on this device.
private struct TermsAcceptanceSheet: View {
  let onAccept: () -> Void
  @Environment(\.dismiss) private var dismiss

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: VinctusTokens.Spacing.lg) {
        Image(systemName: "checkmark.shield.fill")
          .font(.system(size: 40))
          .foregroundStyle(VinctusTokens.Color.accent)

        Text("Antes de continuar")
          .font(.title2.bold())

        Text(
          "Vinctus es una comunidad segura. Al usarla aceptas los Términos de servicio y las Normas de la comunidad:"
        )
        .foregroundStyle(VinctusTokens.Color.textMuted)

        VStack(alignment: .leading, spacing: 10) {
          rule("No se tolera el contenido ofensivo ni los usuarios abusivos.")
          rule("Ese contenido se elimina y sus autores son expulsados.")
          rule("Puedes denunciar y bloquear a cualquier usuario desde el menú ···.")
        }

        HStack(spacing: 16) {
          Link("Términos de servicio", destination: LegalConfig.termsOfServiceURL)
          Link("Normas de la comunidad", destination: LegalConfig.communityGuidelinesURL)
        }
        .font(.footnote)
        .foregroundStyle(VinctusTokens.Color.accent)

        VButton("Acepto y continuar", variant: .primary, action: onAccept)

        Button("Cancelar") {
          dismiss()
        }
        .frame(maxWidth: .infinity)
        .foregroundStyle(VinctusTokens.Color.textMuted)
      }
      .padding(VinctusTokens.Spacing.xl)
    }
    .background(VinctusTokens.Color.surface.ignoresSafeArea())
  }

  private func rule(_ text: String) -> some View {
    HStack(alignment: .top, spacing: 10) {
      Image(systemName: "checkmark.circle.fill")
        .foregroundStyle(VinctusTokens.Color.accent)
      Text(text)
    }
  }
}

private struct AuthField<Content: View>: View {
  let systemImage: String
  @ViewBuilder let content: () -> Content

  var body: some View {
    HStack(spacing: 12) {
      Image(systemName: systemImage)
        .foregroundStyle(VinctusTokens.Color.textMuted)
        .frame(width: 20)
      content()
    }
    .padding(.horizontal, 14)
    .frame(height: 52)
    .background(VinctusTokens.Color.surface2)
    .clipShape(RoundedRectangle(cornerRadius: VinctusTokens.Radius.md, style: .continuous))
    .overlay(
      RoundedRectangle(cornerRadius: VinctusTokens.Radius.md, style: .continuous)
        .stroke(VinctusTokens.Color.border.opacity(0.6), lineWidth: 1)
    )
  }
}

private struct AuthBanner: View {
  let text: String
  let systemImage: String
  let tint: SwiftUI.Color

  var body: some View {
    HStack(alignment: .top, spacing: 10) {
      Image(systemName: systemImage)
        .foregroundStyle(tint)
      Text(text)
        .font(.footnote)
        .foregroundStyle(VinctusTokens.Color.textPrimary)
      Spacer(minLength: 0)
    }
    .padding(12)
    .background(tint.opacity(0.12))
    .clipShape(RoundedRectangle(cornerRadius: VinctusTokens.Radius.sm, style: .continuous))
  }
}

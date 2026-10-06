import AuthenticationServices
import FirebaseCore
import Foundation
import SwiftUI

struct AuthGateView: View {
  @EnvironmentObject private var authVM: AuthViewModel
  @State private var email = ""
  @State private var password = ""
  @State private var appleRawNonce = ""
  @State private var showDebug = false
  @State private var isShowingTerms = false
  @State private var isShowingPasswordReset = false
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
    .sheet(isPresented: $isShowingPasswordReset) {
      PasswordResetSheet(initialEmail: trimmedEmail)
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }
    .onAppear {
      if ProcessInfo.processInfo.arguments.contains("-VinctusShowPasswordReset") {
        isShowingPasswordReset = true
      }
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
        .font(VinctusTokens.Typography.serif(44, weight: .semibold))
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
          isShowingPasswordReset = true
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
    guard let presentingViewController = SignInPresenter.topViewController() else {
      authVM.errorMessage = "No se pudo abrir el inicio de sesión con Google. Intenta de nuevo."
      return
    }
    authVM.signInWithGoogle(presentingViewController: presentingViewController)
  }

  private func configureAppleSignInRequest(_ request: ASAuthorizationAppleIDRequest) {
    authVM.errorMessage = nil
    authVM.infoMessage = nil
    AppLog.auth.info("signIn.apple.request.start")
    let nonce = AppleSignInNonce.random()
    appleRawNonce = nonce
    request.requestedScopes = [.fullName, .email]
    request.nonce = AppleSignInNonce.sha256(nonce)
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
}

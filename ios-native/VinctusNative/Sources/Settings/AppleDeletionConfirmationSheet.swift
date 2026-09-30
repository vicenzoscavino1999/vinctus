import AuthenticationServices
import SwiftUI

/// Accounts that use Sign in with Apple confirm with Apple before being deleted, which returns
/// the authorization code needed to revoke the app's Apple tokens.
struct AppleDeletionConfirmationSheet: View {
  let onConfirmed: (String) -> Void

  @Environment(\.dismiss) private var dismiss
  @State private var errorMessage: String?

  var body: some View {
    NavigationStack {
      VStack(alignment: .leading, spacing: VinctusTokens.Spacing.lg) {
        Text(
          "Tu cuenta usa Iniciar sesión con Apple. Para eliminarla, confirma con Apple: así también quitamos el acceso de Vinctus a tu Apple ID."
        )

        Text("Esta acción es irreversible y puede tardar unos minutos en completarse.")
          .font(.footnote)
          .foregroundStyle(.secondary)

        if let errorMessage {
          Text(errorMessage)
            .font(.footnote)
            .foregroundStyle(.red)
        }

        SignInWithAppleButton(
          .continue,
          onRequest: { request in
            request.requestedScopes = []
          },
          onCompletion: handleCompletion
        )
        .signInWithAppleButtonStyle(.white)
        .frame(maxWidth: .infinity)
        .frame(height: 48)

        Spacer()
      }
      .padding(VinctusTokens.Spacing.xl)
      .navigationTitle("Eliminar cuenta")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("Cancelar") {
            dismiss()
          }
        }
      }
    }
  }

  private func handleCompletion(_ result: Result<ASAuthorization, Error>) {
    switch result {
    case .success(let authorization):
      guard
        let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
        let codeData = credential.authorizationCode,
        let code = String(data: codeData, encoding: .utf8),
        !code.isEmpty
      else {
        errorMessage = "Apple no confirmó la solicitud. Intenta de nuevo."
        return
      }
      onConfirmed(code)

    case .failure(let error):
      if let authError = error as? ASAuthorizationError, authError.code == .canceled {
        return
      }
      AppLog.settings.error(
        "deleteAccount.appleConfirm.failed errorType=\(AppLog.errorType(error), privacy: .public)"
      )
      errorMessage = "No se pudo confirmar con Apple. Intenta de nuevo."
    }
  }
}

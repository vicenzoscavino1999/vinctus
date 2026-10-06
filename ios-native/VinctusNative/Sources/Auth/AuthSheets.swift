import SwiftUI

/// Asks to agree to the terms, which rule out objectionable content and abusive users
/// (App Review Guideline 1.2), before the first sign-in on this device.
struct TermsAcceptanceSheet: View {
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

/// Asks for the account email and sends Firebase's password reset link to it.
struct PasswordResetSheet: View {
  @EnvironmentObject private var authVM: AuthViewModel
  @Environment(\.dismiss) private var dismiss
  @State private var email: String
  @State private var isSending = false
  @State private var errorMessage: String?
  @State private var sentTo: String?

  init(initialEmail: String) {
    _email = State(initialValue: initialEmail)
  }

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: VinctusTokens.Spacing.lg) {
        Image(systemName: sentTo == nil ? "key.fill" : "envelope.badge.fill")
          .font(.system(size: 36))
          .foregroundStyle(VinctusTokens.Color.accent)

        if let sentTo {
          Text("Revisa tu correo")
            .font(.title2.bold())
          Text(
            "Si existe una cuenta con \(sentTo), te enviamos un enlace para crear una contraseña nueva. Revisa también la carpeta de spam."
          )
          .foregroundStyle(VinctusTokens.Color.textMuted)
          Text("Si entras con Apple o Google, no necesitas contraseña: usa ese botón para entrar.")
            .font(.footnote)
            .foregroundStyle(VinctusTokens.Color.textMuted)

          VButton("Volver a iniciar sesión", variant: .primary) {
            dismiss()
          }
        } else {
          Text("Recuperar contraseña")
            .font(.title2.bold())
          Text("Escribe el email de tu cuenta y te enviaremos un enlace para crear una contraseña nueva.")
            .foregroundStyle(VinctusTokens.Color.textMuted)

          AuthField(systemImage: "envelope") {
            TextField("Email", text: $email)
              .textInputAutocapitalization(.never)
              .keyboardType(.emailAddress)
              .autocorrectionDisabled()
              .textContentType(.username)
              .submitLabel(.send)
              .onSubmit(send)
          }

          if let errorMessage {
            AuthBanner(text: errorMessage, systemImage: "exclamationmark.triangle.fill", tint: .red)
          }

          VButton(isSending ? "Enviando..." : "Enviar enlace", variant: .primary, action: send)
            .disabled(isSending)

          Button("Cancelar") {
            dismiss()
          }
          .frame(maxWidth: .infinity)
          .foregroundStyle(VinctusTokens.Color.textMuted)
        }
      }
      .padding(VinctusTokens.Spacing.xl)
    }
    .background(VinctusTokens.Color.surface.ignoresSafeArea())
  }

  private func send() {
    guard !isSending else { return }
    isSending = true
    errorMessage = nil
    Task {
      let target = email.trimmingCharacters(in: .whitespacesAndNewlines)
      if let error = await authVM.requestPasswordReset(email: target) {
        errorMessage = error
      } else {
        sentTo = target
      }
      isSending = false
    }
  }
}

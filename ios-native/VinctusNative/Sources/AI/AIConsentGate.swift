import SwiftUI

// MARK: - Consent

/// Shows `content` only after the user agrees to send their messages to the external AI
/// providers (App Review Guideline 5.1.2(i)). The choice is saved on the user profile, like on
/// the web, and can be withdrawn from Settings.
struct AIConsentGate<Content: View>: View {
  let content: () -> Content

  @EnvironmentObject private var authVM: AuthViewModel
  @StateObject private var vm: AIConsentViewModel

  init(
    source: AIConsentSource,
    repo: AIConsentRepo = AppRepos.aiConsent(),
    @ViewBuilder content: @escaping () -> Content
  ) {
    self.content = content
    _vm = StateObject(wrappedValue: AIConsentViewModel(source: source, repo: repo))
  }

  var body: some View {
    Group {
      if vm.isGranted {
        content()
      } else if vm.isLoading {
        ProgressView()
          .frame(maxWidth: .infinity, maxHeight: .infinity)
      } else {
        consentRequest
      }
    }
    .task(id: authVM.currentUserID) {
      await vm.load(uid: authVM.currentUserID)
    }
  }

  private var consentRequest: some View {
    ScrollView {
      VCard {
        VStack(alignment: .leading, spacing: VinctusTokens.Spacing.md) {
          Label("Antes de usar la IA", systemImage: "sparkles")
            .font(.headline)
            .foregroundStyle(VinctusTokens.Color.accent)

          Text(
            "Para responderte, lo que escribas se envía a proveedores externos de inteligencia artificial: Google (Gemini) y NVIDIA."
          )
          Text("No se envían tu correo ni tu nombre, y quitamos correos y teléfonos del texto.")
            .foregroundStyle(VinctusTokens.Color.textMuted)
          Text("Puedes retirar este permiso cuando quieras en Perfil > Ajustes > IA.")
            .foregroundStyle(VinctusTokens.Color.textMuted)

          Link("Ver la Política de privacidad", destination: LegalConfig.privacyPolicyURL)
            .font(.footnote)
            .foregroundStyle(VinctusTokens.Color.accent)

          if let errorMessage = vm.errorMessage {
            Text(errorMessage)
              .font(.footnote)
              .foregroundStyle(.red)
          }

          VButton("Acepto enviar mis mensajes a la IA") {
            Task { await vm.grant(uid: authVM.currentUserID) }
          }
          .disabled(vm.isSaving || authVM.currentUserID == nil)
        }
      }
      .padding(VinctusTokens.Spacing.lg)
    }
    .vinctusLoading(vm.isSaving)
  }
}

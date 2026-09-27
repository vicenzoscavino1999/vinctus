import AuthenticationServices
import FirebaseCore
import SwiftUI

@MainActor
struct SettingsView: View {
  @EnvironmentObject private var authVM: AuthViewModel
  @StateObject private var viewModel = SettingsViewModel(repo: FirebaseAIConsentRepo())
  @State private var deleteConfirmationText = ""
  @State private var showDeleteConfirmationDialog = false
  @State private var showAppleDeletionSheet = false

  var body: some View {
    List {
      // Developer diagnostics stay out of App Store builds
      #if DEBUG
      Section("App") {
        LabeledContent("Env") { Text(AppEnvironment.current.rawValue) }
        LabeledContent("Firebase") { Text(FirebaseApp.app() == nil ? "Not configured" : "Configured") }
      }
      #endif

      Section {
        Button {
          Task {
            await viewModel.toggleAIConsent(userID: authVM.currentUserID)
          }
        } label: {
          HStack(alignment: .top, spacing: 12) {
            Image(systemName: "sparkles")
              .foregroundStyle(VinctusTokens.Color.accent)
              .frame(width: 20)

            VStack(alignment: .leading, spacing: 4) {
              Text("Enviar mis mensajes a la IA")
                .foregroundStyle(.primary)
              Text(LegalConfig.aiConsentDescription)
                .font(.footnote)
                .foregroundStyle(.secondary)
            }

            Spacer()

            if viewModel.isLoadingConsent || viewModel.isSavingConsent {
              ProgressView()
            } else {
              Text(viewModel.aiConsent.granted ? "Permitido" : "No permitido")
                .font(.caption)
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(viewModel.aiConsent.granted ? SwiftUI.Color.green.opacity(0.15) : SwiftUI.Color.gray.opacity(0.15))
                .foregroundStyle(viewModel.aiConsent.granted ? SwiftUI.Color.green : SwiftUI.Color.secondary)
                .clipShape(Capsule())
            }
          }
        }
        .buttonStyle(.plain)
        .disabled(viewModel.isLoadingConsent || viewModel.isSavingConsent || authVM.currentUserID == nil)
      } header: {
        Text("IA")
      } footer: {
        Text("Toca para permitir o retirar el permiso. Sin permiso, Chat con IA y Arena IA no envían nada.")
      }

      Section("Privacidad") {
        NavigationLink(destination: BlockedUsersView()) {
          Label("Usuarios bloqueados", systemImage: "hand.raised")
        }
      }

      Section("Legal y soporte") {
        legalLinkRow(
          title: "Política de privacidad",
          subtitle: "Cómo usamos y protegemos datos",
          icon: "hand.raised",
          url: LegalConfig.privacyPolicyURL
        )
        legalLinkRow(
          title: "Términos de servicio",
          subtitle: "Condiciones de uso de Vinctus",
          icon: "doc.text",
          url: LegalConfig.termsOfServiceURL
        )
        legalLinkRow(
          title: "Normas de la comunidad",
          subtitle: "Reglas de comunidad y moderación",
          icon: "checkmark.shield",
          url: LegalConfig.communityGuidelinesURL
        )
        legalLinkRow(
          title: "Soporte",
          subtitle: "Centro de ayuda y contacto",
          icon: "questionmark.circle",
          url: LegalConfig.supportURL
        )

        if let supportMailURL = mailtoURL(for: LegalConfig.supportEmail) {
          Link(destination: supportMailURL) {
            LabeledContent("Correo de soporte") {
              Text(LegalConfig.supportEmail)
                .font(.footnote)
                .foregroundStyle(.secondary)
            }
          }
        }

        if let securityMailURL = mailtoURL(for: LegalConfig.securityEmail) {
          Link(destination: securityMailURL) {
            LabeledContent("Correo de seguridad") {
              Text(LegalConfig.securityEmail)
                .font(.footnote)
                .foregroundStyle(.secondary)
            }
          }
        }
      }

      Section("Zona de riesgo") {
        VStack(alignment: .leading, spacing: 6) {
          Text("Eliminar cuenta")
            .font(.headline)
          Text("Acción irreversible: se elimina perfil, posts, chats y configuraciones.")
            .font(.footnote)
            .foregroundStyle(.secondary)
        }

        LabeledContent("Estado") {
          if viewModel.isLoadingDeletionStatus {
            ProgressView()
          } else {
            Text(viewModel.deletionStatus.status.title)
              .foregroundStyle(deletionStatusColor(viewModel.deletionStatus.status))
          }
        }

        if let statusDetail = deletionStatusDetail {
          Text(statusDetail)
            .font(.footnote)
            .foregroundStyle(.secondary)
        }

        if let failureDetail = viewModel.deletionStatus.lastError,
          viewModel.deletionStatus.status == .failed
        {
          Text(failureDetail)
            .font(.footnote)
            .foregroundStyle(.red)
        }

        if let error = viewModel.deletionErrorMessage {
          Text(error)
            .font(.footnote)
            .foregroundStyle(.red)
        }

        if let info = viewModel.deletionInfoMessage {
          Text(info)
            .font(.footnote)
            .foregroundStyle(.green)
        }

        TextField("Escribe ELIMINAR para confirmar", text: $deleteConfirmationText)
          .textInputAutocapitalization(.characters)
          .autocorrectionDisabled()
          .disabled(authVM.currentUserID == nil || !viewModel.canSubmitDeletionRequest)

        Button {
          Task {
            await viewModel.refreshDeletionStatus(userID: authVM.currentUserID)
          }
        } label: {
          HStack {
            if viewModel.isLoadingDeletionStatus {
              ProgressView()
                .controlSize(.small)
            }
            Text("Refrescar estado")
          }
        }
        .disabled(authVM.currentUserID == nil || viewModel.isLoadingDeletionStatus)

        Button(role: .destructive) {
          if authVM.isSignedInWithApple {
            showAppleDeletionSheet = true
          } else {
            showDeleteConfirmationDialog = true
          }
        } label: {
          HStack {
            if viewModel.isSubmittingDeletionRequest {
              ProgressView()
                .controlSize(.small)
            }
            Text("Solicitar eliminación de cuenta")
          }
        }
        .disabled(
          authVM.currentUserID == nil ||
            viewModel.isSubmittingDeletionRequest ||
            !viewModel.canSubmitDeletionRequest ||
            !isDeleteConfirmationValid
        )

        if viewModel.shouldOfferSignOutForDeletion {
          Button(role: .destructive) {
            authVM.signOut()
          } label: {
            Text("Cerrar sesión ahora")
          }
        }
      }

      if let errorMessage = viewModel.errorMessage ?? authVM.errorMessage {
        Section("Estado") {
          Text(errorMessage)
            .font(.footnote)
            .foregroundStyle(.red)
        }
      }

      if let infoMessage = viewModel.infoMessage ?? authVM.infoMessage {
        Section("Estado") {
          Text(infoMessage)
            .font(.footnote)
            .foregroundStyle(.green)
        }
      }

      Section("Cuenta") {
        Button(role: .destructive) {
          AppLog.auth.info("signOut.tap")
          authVM.signOut()
        } label: {
          Text("Cerrar sesión")
        }
      }
    }
    .navigationTitle("Ajustes")
    .task(id: authVM.currentUserID) {
      await viewModel.refreshConsent(userID: authVM.currentUserID)
      await viewModel.refreshDeletionStatus(userID: authVM.currentUserID)
    }
    .task(id: viewModel.deletionStatus.status) {
      while !Task.isCancelled {
        guard
          viewModel.deletionStatus.status == .queued ||
            viewModel.deletionStatus.status == .processing
        else { return }

        try? await Task.sleep(nanoseconds: 5_000_000_000)
        if Task.isCancelled { return }
        await viewModel.refreshDeletionStatus(userID: authVM.currentUserID, silent: true)
      }
    }
    .confirmationDialog(
      "Confirmar eliminación de cuenta",
      isPresented: $showDeleteConfirmationDialog,
      titleVisibility: .visible
    ) {
      Button("Eliminar mi cuenta", role: .destructive) {
        deleteAccount(appleAuthorizationCode: nil)
      }
      Button("Cancelar", role: .cancel) {}
    } message: {
      Text("Esta acción es irreversible y puede tardar unos minutos en completarse.")
    }
    .sheet(isPresented: $showAppleDeletionSheet) {
      AppleDeletionConfirmationSheet { authorizationCode in
        showAppleDeletionSheet = false
        deleteAccount(appleAuthorizationCode: authorizationCode)
      }
    }
  }

  private func deleteAccount(appleAuthorizationCode: String?) {
    Task {
      let shouldSignOut = await viewModel.requestAccountDeletion(
        userID: authVM.currentUserID,
        appleAuthorizationCode: appleAuthorizationCode
      )
      if viewModel.deletionErrorMessage == nil {
        deleteConfirmationText = ""
      }
      if shouldSignOut {
        authVM.signOut()
      }
    }
  }

  private var isDeleteConfirmationValid: Bool {
    deleteConfirmationText.trimmingCharacters(in: .whitespacesAndNewlines).uppercased() == "ELIMINAR"
  }

  private var deletionStatusDetail: String? {
    if viewModel.deletionStatus.status == .queued || viewModel.deletionStatus.status == .processing {
      return "La solicitud está en proceso. Puedes cerrar sesión mientras se completa."
    }

    if viewModel.deletionStatus.status == .completed {
      return "Borrado completado. Si sigues logueado, cierra sesión."
    }

    return nil
  }

  private func deletionStatusColor(_ status: AccountDeletionStatus) -> SwiftUI.Color {
    switch status {
    case .notRequested:
      return .secondary
    case .queued, .processing:
      return .orange
    case .completed:
      return .green
    case .failed:
      return .red
    }
  }

  private func legalLinkRow(
    title: String,
    subtitle: String,
    icon: String,
    url: URL
  ) -> some View {
    Link(destination: url) {
      HStack(alignment: .center, spacing: 12) {
        Image(systemName: icon)
          .foregroundStyle(VinctusTokens.Color.accent)
          .frame(width: 20)
        VStack(alignment: .leading, spacing: 2) {
          Text(title)
            .foregroundStyle(.primary)
          Text(subtitle)
            .font(.footnote)
            .foregroundStyle(.secondary)
        }
        Spacer()
        Image(systemName: "arrow.up.right.square")
          .font(.footnote)
          .foregroundStyle(.secondary)
      }
    }
  }

  private func mailtoURL(for email: String) -> URL? {
    var components = URLComponents()
    components.scheme = "mailto"
    components.path = email
    return components.url
  }
}

/// Accounts that use Sign in with Apple confirm with Apple before being deleted, which returns
/// the authorization code needed to revoke the app's Apple tokens.
private struct AppleDeletionConfirmationSheet: View {
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

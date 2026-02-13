import Foundation

@MainActor
final class SettingsViewModel: ObservableObject {
  @Published private(set) var aiConsent: AIConsentState = .default
  @Published private(set) var isLoadingConsent = false
  @Published private(set) var isSavingConsent = false
  @Published var errorMessage: String?
  @Published var infoMessage: String?
  @Published private(set) var deletionStatus: AccountDeletionStatusState = .initial
  @Published private(set) var isLoadingDeletionStatus = false
  @Published private(set) var isSubmittingDeletionRequest = false
  @Published var deletionErrorMessage: String?
  @Published var deletionInfoMessage: String?

  private let aiConsentRepo: AIConsentRepo
  private let deleteAccountRepo: DeleteAccountRepo
  private let iso8601Formatter = ISO8601DateFormatter()

  init(
    repo: AIConsentRepo,
    deleteAccountRepo: DeleteAccountRepo = FirebaseDeleteAccountRepo()
  ) {
    self.aiConsentRepo = repo
    self.deleteAccountRepo = deleteAccountRepo
  }

  var canSubmitDeletionRequest: Bool {
    deletionStatus.status.canSubmitRequest
  }

  var shouldOfferSignOutForDeletion: Bool {
    deletionStatus.status.shouldOfferSignOut
  }

  func refreshConsent(userID: String?) async {
    guard let userID, !userID.isEmpty else {
      aiConsent = .default
      errorMessage = nil
      infoMessage = nil
      return
    }

    isLoadingConsent = true
    errorMessage = nil
    infoMessage = nil
    do {
      aiConsent = try await aiConsentRepo.getConsent(uid: userID)
      AppLog.settings.info(
        "aiConsent.refresh.success recorded=\(self.aiConsent.recorded, privacy: .public)"
      )
    } catch {
      AppLog.settings.error(
        "aiConsent.refresh.failed errorType=\(AppLog.errorType(error), privacy: .public)"
      )
      errorMessage = "No se pudo sincronizar el consentimiento de IA."
    }
    isLoadingConsent = false
  }

  func toggleAIConsent(userID: String?) async {
    guard let userID, !userID.isEmpty else {
      errorMessage = "Sesion no valida para actualizar consentimiento."
      return
    }

    let nextValue = !aiConsent.granted
    isSavingConsent = true
    errorMessage = nil
    infoMessage = nil

    do {
      try await aiConsentRepo.setConsent(uid: userID, granted: nextValue, source: .settings)
      aiConsent = AIConsentState(
        granted: nextValue,
        recorded: true,
        source: .settings,
        updatedAt: Date()
      )
      infoMessage = nextValue ? "Consentimiento de IA actualizado." : "Consentimiento de IA revocado."
      AppLog.settings.info("aiConsent.update.success granted=\(nextValue, privacy: .public)")
    } catch {
      AppLog.settings.error(
        "aiConsent.update.failed errorType=\(AppLog.errorType(error), privacy: .public)"
      )
      errorMessage = "No se pudo guardar el consentimiento de IA."
    }

    isSavingConsent = false
  }

  func refreshDeletionStatus(userID: String?, silent: Bool = false) async {
    guard let userID, !userID.isEmpty else {
      deletionStatus = .initial
      if !silent {
        deletionErrorMessage = nil
        deletionInfoMessage = nil
      }
      return
    }

    if !silent {
      isLoadingDeletionStatus = true
      deletionErrorMessage = nil
    }

    do {
      deletionStatus = try await deleteAccountRepo.getAccountDeletionStatus()
      AppLog.settings.info(
        "deleteAccount.status.refresh.success status=\(self.deletionStatus.status.rawValue, privacy: .public)"
      )
    } catch {
      AppLog.settings.error(
        "deleteAccount.status.refresh.failed errorType=\(AppLog.errorType(error), privacy: .public)"
      )
      if !silent {
        deletionErrorMessage = "No se pudo cargar el estado de eliminacion de cuenta."
      }
    }

    if !silent {
      isLoadingDeletionStatus = false
    }
  }

  @discardableResult
  func requestAccountDeletion(userID: String?) async -> Bool {
    guard let userID, !userID.isEmpty else {
      deletionErrorMessage = "Sesion no valida para eliminar cuenta."
      return false
    }

    guard canSubmitDeletionRequest else {
      deletionErrorMessage = "Ya existe una solicitud activa de eliminacion."
      return false
    }

    isSubmittingDeletionRequest = true
    deletionErrorMessage = nil
    deletionInfoMessage = nil
    defer { isSubmittingDeletionRequest = false }

    do {
      let result = try await deleteAccountRepo.startAccountDeletion()
      let nowISO8601 = iso8601Formatter.string(from: Date())

      deletionStatus = AccountDeletionStatusState(
        status: result.status,
        jobID: result.jobID,
        updatedAt: nowISO8601,
        completedAt: result.status == .completed ? nowISO8601 : nil,
        lastError: nil
      )

      if result.mode == .legacy {
        deletionInfoMessage = "Eliminacion iniciada (modo legacy). Cerraremos sesion ahora."
        AppLog.settings.info("deleteAccount.request.success mode=legacy")
        return true
      }

      if result.status == .completed {
        deletionInfoMessage = "Cuenta eliminada correctamente."
      } else {
        deletionInfoMessage = "Solicitud enviada. Puedes seguir el estado aqui."
      }

      AppLog.settings.info(
        "deleteAccount.request.success mode=async status=\(result.status.rawValue, privacy: .public)"
      )
      return false
    } catch {
      AppLog.settings.error(
        "deleteAccount.request.failed errorType=\(AppLog.errorType(error), privacy: .public)"
      )
      deletionErrorMessage = error.localizedDescription
      return false
    }
  }
}

import FirebaseAuth
import FirebaseFunctions
import Foundation

@MainActor
final class SettingsViewModel: ObservableObject {
  @Published private(set) var aiConsent: AIConsentState = .default
  @Published private(set) var isLoadingConsent = false
  @Published private(set) var isSavingConsent = false
  @Published var errorMessage: String?
  @Published var infoMessage: String?

  @Published private(set) var accountVisibility: ProfileAccountVisibility = .public
  @Published private(set) var isLoadingPrivacy = false
  @Published private(set) var isSavingPrivacy = false
  @Published var privacyErrorMessage: String?

  @Published private(set) var isRevokingSessions = false
  @Published var securityErrorMessage: String?
  @Published var securityInfoMessage: String?

  @Published private(set) var deletionStatus: AccountDeletionStatusState = .initial
  @Published private(set) var isLoadingDeletionStatus = false
  @Published private(set) var isSubmittingDeletionRequest = false
  @Published var deletionErrorMessage: String?
  @Published var deletionInfoMessage: String?

  private let aiConsentRepo: AIConsentRepo
  private let deleteAccountRepo: DeleteAccountRepo
  private let accountSecurityRepo: AccountSecurityRepo
  private let iso8601Formatter = ISO8601DateFormatter()
  private var consentGeneration = 0
  private var privacyGeneration = 0
  private var deletionGeneration = 0

  init(
    repo: AIConsentRepo,
    deleteAccountRepo: DeleteAccountRepo = AppRepos.deleteAccount(),
    accountSecurityRepo: AccountSecurityRepo = AppRepos.accountSecurity()
  ) {
    self.aiConsentRepo = repo
    self.deleteAccountRepo = deleteAccountRepo
    self.accountSecurityRepo = accountSecurityRepo
  }

  var canSubmitDeletionRequest: Bool {
    deletionStatus.status.canSubmitRequest
  }

  var shouldOfferSignOutForDeletion: Bool {
    deletionStatus.status.shouldOfferSignOut
  }

  // MARK: AI Consent

  func refreshConsent(userID: String?) async {
    consentGeneration += 1
    let generation = consentGeneration
    aiConsent = .default
    errorMessage = nil
    infoMessage = nil

    guard let userID, !userID.isEmpty else {
      isLoadingConsent = false
      return
    }

    isLoadingConsent = true
    do {
      let loaded = try await aiConsentRepo.getConsent(uid: userID)
      guard !Task.isCancelled, generation == consentGeneration else { return }
      aiConsent = loaded
      AppLog.settings.info(
        "aiConsent.refresh.success recorded=\(self.aiConsent.recorded, privacy: .public)"
      )
    } catch {
      guard !Task.isCancelled, generation == consentGeneration else { return }
      AppLog.settings.error(
        "aiConsent.refresh.failed errorType=\(AppLog.errorType(error), privacy: .public)"
      )
      errorMessage = "No se pudo sincronizar el consentimiento de IA."
    }
    if generation == consentGeneration {
      isLoadingConsent = false
    }
  }

  func toggleAIConsent(userID: String?) async {
    guard !isSavingConsent, !isLoadingConsent else { return }
    guard let userID, !userID.isEmpty else {
      errorMessage = "Sesión no válida para actualizar consentimiento."
      return
    }

    let generation = consentGeneration
    let nextValue = !aiConsent.granted
    isSavingConsent = true
    errorMessage = nil
    infoMessage = nil

    do {
      try await aiConsentRepo.setConsent(uid: userID, granted: nextValue, source: .settings)
      guard generation == consentGeneration else {
        isSavingConsent = false
        return
      }
      aiConsent = AIConsentState(
        granted: nextValue,
        recorded: true,
        source: .settings,
        updatedAt: Date()
      )
      infoMessage = nextValue ? "Permiso de IA concedido." : "Permiso de IA retirado."
      AppLog.settings.info("aiConsent.update.success granted=\(nextValue, privacy: .public)")
    } catch {
      guard generation == consentGeneration else {
        isSavingConsent = false
        return
      }
      AppLog.settings.error(
        "aiConsent.update.failed errorType=\(AppLog.errorType(error), privacy: .public)"
      )
      errorMessage = "No se pudo guardar el consentimiento de IA."
    }

    isSavingConsent = false
  }

  // MARK: Account Privacy & Security

  func refreshPrivacy(userID: String?) async {
    privacyGeneration += 1
    let generation = privacyGeneration
    privacyErrorMessage = nil
    securityErrorMessage = nil
    securityInfoMessage = nil

    guard let userID, !userID.isEmpty else {
      accountVisibility = .public
      isLoadingPrivacy = false
      return
    }

    isLoadingPrivacy = true
    do {
      let loaded = try await accountSecurityRepo.fetchAccountVisibility(uid: userID)
      guard !Task.isCancelled, generation == privacyGeneration else { return }
      accountVisibility = loaded
    } catch {
      guard !Task.isCancelled, generation == privacyGeneration else { return }
      AppLog.settings.error(
        "privacy.refresh.failed errorType=\(AppLog.errorType(error), privacy: .public)"
      )
      privacyErrorMessage = "No se pudo cargar la privacidad de tu cuenta."
    }
    if generation == privacyGeneration {
      isLoadingPrivacy = false
    }
  }

  func setAccountPrivate(_ isPrivate: Bool, userID: String?) async {
    guard !isSavingPrivacy, !isLoadingPrivacy, privacyErrorMessage == nil else { return }
    guard let userID, !userID.isEmpty else {
      privacyErrorMessage = "Sesión no válida para actualizar privacidad."
      return
    }

    let nextVisibility: ProfileAccountVisibility = isPrivate ? .private : .public
    guard nextVisibility != accountVisibility else { return }

    let generation = privacyGeneration
    let previousVisibility = accountVisibility
    accountVisibility = nextVisibility
    isSavingPrivacy = true
    securityErrorMessage = nil
    securityInfoMessage = nil

    do {
      try await accountSecurityRepo.setAccountVisibility(uid: userID, visibility: nextVisibility)
      guard generation == privacyGeneration else {
        isSavingPrivacy = false
        return
      }
      securityInfoMessage = isPrivate
        ? "Tu cuenta ahora es privada."
        : "Tu cuenta ahora es pública."
    } catch {
      guard generation == privacyGeneration else {
        isSavingPrivacy = false
        return
      }
      accountVisibility = previousVisibility
      AppLog.settings.error(
        "privacy.update.failed errorType=\(AppLog.errorType(error), privacy: .public)"
      )
      securityErrorMessage = "No se pudo guardar el cambio de privacidad."
    }

    isSavingPrivacy = false
  }

  func revokeOtherSessions(userID: String?) async {
    guard !isRevokingSessions else { return }
    guard let userID, !userID.isEmpty else {
      securityErrorMessage = "Sesión no válida para revocar dispositivos."
      return
    }

    isRevokingSessions = true
    securityErrorMessage = nil
    securityInfoMessage = nil
    defer { isRevokingSessions = false }

    do {
      try await accountSecurityRepo.revokeOtherSessions()
      securityInfoMessage = "Sesiones revocadas en otros dispositivos. Puede tardar unos minutos."
    } catch {
      AppLog.settings.error(
        "security.revokeSessions.failed errorType=\(AppLog.errorType(error), privacy: .public)"
      )
      securityErrorMessage = Self.friendlyFunctionsError(
        for: error,
        fallback: "No se pudieron cerrar las sesiones en otros dispositivos."
      )
    }
  }

  // MARK: Account Deletion

  func refreshDeletionStatus(userID: String?, silent: Bool = false) async {
    guard let userID, !userID.isEmpty else {
      deletionGeneration += 1
      deletionStatus = .initial
      isLoadingDeletionStatus = false
      if !silent {
        deletionErrorMessage = nil
        deletionInfoMessage = nil
      }
      return
    }

    if !silent {
      deletionGeneration += 1
      isLoadingDeletionStatus = true
      deletionErrorMessage = nil
    }
    let generation = deletionGeneration

    do {
      let fetched = try await deleteAccountRepo.getAccountDeletionStatus()
      guard !Task.isCancelled, generation == deletionGeneration else { return }
      deletionStatus = fetched
      AppLog.settings.info(
        "deleteAccount.status.refresh.success status=\(self.deletionStatus.status.rawValue, privacy: .public)"
      )
    } catch {
      guard !Task.isCancelled, generation == deletionGeneration else { return }
      let wasActiveDeletion =
        deletionStatus.status == .queued || deletionStatus.status == .processing
      if wasActiveDeletion && Self.isUnauthenticatedError(error) {
        let nowISO8601 = iso8601Formatter.string(from: Date())
        deletionStatus = AccountDeletionStatusState(
          status: .completed,
          jobID: deletionStatus.jobID,
          updatedAt: nowISO8601,
          completedAt: nowISO8601,
          lastError: nil
        )
        deletionErrorMessage = nil
        deletionInfoMessage = "Tu cuenta fue eliminada. Cierra sesión para salir."
        if !silent {
          isLoadingDeletionStatus = false
        }
        return
      }
      AppLog.settings.error(
        "deleteAccount.status.refresh.failed errorType=\(AppLog.errorType(error), privacy: .public)"
      )
      if !silent {
        deletionErrorMessage = "No se pudo cargar el estado de eliminación de cuenta."
      }
    }

    if !silent && generation == deletionGeneration {
      isLoadingDeletionStatus = false
    }
  }

  /// `appleAuthorizationCode` comes from confirming with Apple; it is set for accounts that use
  /// Sign in with Apple, whose tokens are revoked before the deletion starts.
  @discardableResult
  func requestAccountDeletion(userID: String?, appleAuthorizationCode: String? = nil) async -> Bool {
    guard !isSubmittingDeletionRequest else { return false }
    guard let userID, !userID.isEmpty else {
      deletionErrorMessage = "Sesión no válida para eliminar cuenta."
      return false
    }

    guard canSubmitDeletionRequest else {
      deletionErrorMessage = "Ya existe una solicitud activa de eliminación."
      return false
    }

    deletionGeneration += 1
    let generation = deletionGeneration
    isSubmittingDeletionRequest = true
    deletionErrorMessage = nil
    deletionInfoMessage = nil
    defer { isSubmittingDeletionRequest = false }

    if let appleAuthorizationCode {
      do {
        try await deleteAccountRepo.revokeAppleToken(authorizationCode: appleAuthorizationCode)
        AppLog.settings.info("deleteAccount.appleRevoke.success")
      } catch {
        // A failed revocation must not block the deletion itself.
        AppLog.settings.error(
          "deleteAccount.appleRevoke.failed errorType=\(AppLog.errorType(error), privacy: .public)"
        )
      }
    }

    do {
      let result = try await deleteAccountRepo.startAccountDeletion()
      guard generation == deletionGeneration else { return false }
      let nowISO8601 = iso8601Formatter.string(from: Date())

      deletionStatus = AccountDeletionStatusState(
        status: result.status,
        jobID: result.jobID,
        updatedAt: nowISO8601,
        completedAt: result.status == .completed ? nowISO8601 : nil,
        lastError: nil
      )

      if result.mode == .legacy {
        deletionInfoMessage = "Eliminación iniciada (modo legacy). Cerraremos sesión ahora."
        AppLog.settings.info("deleteAccount.request.success mode=legacy")
        return true
      }

      if result.status == .completed {
        deletionInfoMessage = "Cuenta eliminada correctamente."
      } else {
        deletionInfoMessage = "Solicitud enviada. Puedes seguir el estado aquí."
      }

      AppLog.settings.info(
        "deleteAccount.request.success mode=async status=\(result.status.rawValue, privacy: .public)"
      )
      return false
    } catch {
      guard generation == deletionGeneration else { return false }
      AppLog.settings.error(
        "deleteAccount.request.failed errorType=\(AppLog.errorType(error), privacy: .public)"
      )
      deletionErrorMessage = Self.friendlyFunctionsError(
        for: error,
        fallback: "No se pudo iniciar la eliminación de cuenta. Intenta de nuevo."
      )
      return false
    }
  }

  nonisolated static func isUnauthenticatedError(_ error: Error) -> Bool {
    let nsError = error as NSError
    if nsError.domain == FunctionsErrorDomain,
      let code = FunctionsErrorCode(rawValue: nsError.code)
    {
      return code == .unauthenticated
    }
    if nsError.domain == AuthErrorDomain,
      let code = AuthErrorCode(rawValue: nsError.code)
    {
      return code == .userTokenExpired || code == .userNotFound || code == .userDisabled
    }
    let lower = nsError.localizedDescription.lowercased()
    return lower.contains("unauthenticated") || lower.contains("user-not-found")
  }

  private nonisolated static func friendlyFunctionsError(for error: Error, fallback: String) -> String {
    if let localized = error as? LocalizedError,
      error is DeleteAccountRepoError || error is AccountSecurityRepoError,
      let message = localized.errorDescription
    {
      return message
    }
    let nsError = error as NSError
    if nsError.domain == FunctionsErrorDomain,
      let code = FunctionsErrorCode(rawValue: nsError.code)
    {
      switch code {
      case .unauthenticated:
        return "Tu sesión expiró. Vuelve a iniciar sesión."
      case .unavailable, .deadlineExceeded:
        return "Sin conexión con el servidor. Intenta de nuevo."
      case .resourceExhausted:
        return "Demasiados intentos. Espera unos minutos e intenta de nuevo."
      default:
        return fallback
      }
    }
    return fallback
  }
}

import FirebaseAuth
import FirebaseFunctions
import XCTest
@testable import VinctusNative

@MainActor
final class AccountSecurityAuthTests: XCTestCase {
  func testSignInAndCreateAccountValidateInputBeforeCallingRepo() {
    let repo = FakeAuthRepo()
    let vm = AuthViewModel(repo: repo, profileBootstrap: FakeProfileBootstrapRepo())

    vm.signIn(email: "not-an-email", password: "password123")
    XCTAssertEqual(vm.errorMessage, "Escribe un email válido.")
    XCTAssertTrue(repo.signInCalls.isEmpty)

    vm.signIn(email: "ana@vinctus.app", password: "")
    XCTAssertEqual(vm.errorMessage, "Escribe tu contraseña.")
    XCTAssertTrue(repo.signInCalls.isEmpty)

    vm.createAccount(email: "ana@vinctus.app", password: "123")
    XCTAssertEqual(vm.errorMessage, "La contraseña debe tener al menos 6 caracteres.")
    XCTAssertTrue(repo.createAccountCalls.isEmpty)
  }

  func testPasswordResetSuppressesUserNotFoundAndTrimsEmail() async {
    let repo = FakeAuthRepo()
    repo.nextError = NSError(domain: AuthErrorDomain, code: AuthErrorCode.userNotFound.rawValue)
    let vm = AuthViewModel(repo: repo, profileBootstrap: FakeProfileBootstrapRepo())

    let error = await vm.requestPasswordReset(email: "  ghost@vinctus.app  ")

    XCTAssertNil(error)
    XCTAssertEqual(repo.passwordResetEmails, ["ghost@vinctus.app"])
  }

  func testExplicitSignOutDoesNotShowForcedSessionEndedBanner() async {
    let repo = FakeAuthRepo()
    let vm = AuthViewModel(repo: repo, profileBootstrap: FakeProfileBootstrapRepo())

    vm.signOut()
    await Task.yield()

    XCTAssertEqual(repo.signOutCount, 1)
    XCTAssertFalse(vm.isSignedIn)
    XCTAssertNil(vm.infoMessage)
  }

  func testErrorTranslatorCoversExpiredTokenAndReauthErrors() {
    let expired = NSError(domain: AuthErrorDomain, code: AuthErrorCode.userTokenExpired.rawValue)
    let recent = NSError(domain: AuthErrorDomain, code: AuthErrorCode.requiresRecentLogin.rawValue)

    XCTAssertEqual(AuthViewModel.message(for: expired), "Tu sesión expiró. Vuelve a iniciar sesión.")
    XCTAssertEqual(
      AuthViewModel.message(for: recent),
      "Por seguridad, vuelve a iniciar sesión para continuar."
    )
  }
}

@MainActor
final class AccountSecurityModerationTests: XCTestCase {
  func testReportViewModelAccountsForTargetPrefixAndExcerptBudget() async {
    let repo = FakeModerationRepo()
    let target = ReportTarget.aiResponse(contextID: "chat", excerpt: String(repeating: "x", count: 1200))
    let vm = ReportViewModel(target: target, repo: repo)

    let maxAllowed = ReportFields.maxUserDetailsLength(for: target)
    XCTAssertLessThan(maxAllowed, ReportViewModel.detailsLimit)

    vm.details = String(repeating: "a", count: maxAllowed)
    XCTAssertTrue(vm.canSubmit)
    XCTAssertTrue(ReportFields(target: target, details: vm.details).fitsRules)

    vm.details = String(repeating: "a", count: maxAllowed + 1)
    XCTAssertFalse(vm.canSubmit)
    XCTAssertLessThan(vm.detailsCharactersLeft, 0)

    await vm.submit()
    XCTAssertTrue(repo.reports.isEmpty)
  }

  func testBlockedUsersStoreClearsOnSignOutAndSurfacesLoadFailureWithRetry() async {
    let moderation = FakeModerationRepo()
    moderation.blocked = ["u1"]
    let store = BlockedUsersStore(repo: moderation)
    let vm = BlockedUsersViewModel(profileRepo: FakeProfileRepo())

    await store.refresh(for: "me")
    XCTAssertEqual(store.blockedUserIDs, ["u1"])

    await store.refresh(for: nil)
    XCTAssertTrue(store.blockedUserIDs.isEmpty)
    XCTAssertNil(store.lastLoadError)

    moderation.fetchFails = true
    await vm.reload(store)
    XCTAssertEqual(vm.loadError, "No se pudo cargar la lista de bloqueados.")
    XCTAssertFalse(vm.isLoading)

    moderation.fetchFails = false
    await vm.reload(store)
    XCTAssertNil(vm.loadError)
    XCTAssertEqual(store.blockedUserIDs, ["u1"])
  }
}

@MainActor
final class AccountSecuritySettingsTests: XCTestCase {
  func testPrivacyToggleUpdatesAndRollsBackOnFailure() async {
    let securityRepo = FakeAccountSecurityRepo()
    let vm = SettingsViewModel(
      repo: FakeAIConsentRepo(),
      deleteAccountRepo: FakeDeleteAccountRepo(),
      accountSecurityRepo: securityRepo
    )

    await vm.refreshPrivacy(userID: "u1")
    XCTAssertEqual(vm.accountVisibility, .public)
    XCTAssertNil(vm.privacyErrorMessage)

    await vm.setAccountPrivate(true, userID: "u1")
    XCTAssertEqual(vm.accountVisibility, .private)
    XCTAssertEqual(securityRepo.updatedVisibilities, [.private])

    securityRepo.updateError = FakeError()
    await vm.setAccountPrivate(false, userID: "u1")
    XCTAssertEqual(vm.accountVisibility, .private)
    XCTAssertEqual(vm.securityErrorMessage, "No se pudo guardar el cambio de privacidad.")
  }

  func testRevokeOtherSessionsReportsSuccessAndError() async {
    let securityRepo = FakeAccountSecurityRepo()
    let vm = SettingsViewModel(
      repo: FakeAIConsentRepo(),
      deleteAccountRepo: FakeDeleteAccountRepo(),
      accountSecurityRepo: securityRepo
    )

    await vm.revokeOtherSessions(userID: "u1")
    XCTAssertEqual(securityRepo.revokeCalls, 1)
    XCTAssertNil(vm.securityErrorMessage)
    XCTAssertNotNil(vm.securityInfoMessage)

    securityRepo.revokeError = FakeError()
    await vm.revokeOtherSessions(userID: "u1")
    XCTAssertNotNil(vm.securityErrorMessage)
  }

  func testSilentDeletionPollingMarksCompletedWhenAuthUserIsDeleted() async {
    let deleteRepo = FakeDeleteAccountRepo()
    deleteRepo.startResult = AccountDeletionStartResult(mode: .async, status: .processing, jobID: "u1")
    let vm = SettingsViewModel(
      repo: FakeAIConsentRepo(),
      deleteAccountRepo: deleteRepo,
      accountSecurityRepo: FakeAccountSecurityRepo()
    )

    let shouldSignOut = await vm.requestAccountDeletion(userID: "u1", appleAuthorizationCode: "code_1")
    XCTAssertFalse(shouldSignOut)
    XCTAssertEqual(deleteRepo.revokedAppleCodes, ["code_1"])
    XCTAssertEqual(vm.deletionStatus.status, .processing)

    // Server deleted the Auth user so the next silent poll receives unauthenticated.
    deleteRepo.statusError = NSError(
      domain: FunctionsErrorDomain,
      code: FunctionsErrorCode.unauthenticated.rawValue
    )
    await vm.refreshDeletionStatus(userID: "u1", silent: true)

    XCTAssertEqual(vm.deletionStatus.status, .completed)
    XCTAssertNil(vm.deletionErrorMessage)
    XCTAssertTrue(vm.shouldOfferSignOutForDeletion)

    let expiredToken = NSError(
      domain: AuthErrorDomain,
      code: AuthErrorCode.userTokenExpired.rawValue
    )
    XCTAssertTrue(SettingsViewModel.isUnauthenticatedError(expiredToken))
  }

  func testLegacyDeletionModeRequestsImmediateSignOut() async {
    let deleteRepo = FakeDeleteAccountRepo()
    deleteRepo.startResult = AccountDeletionStartResult(mode: .legacy, status: .processing, jobID: nil)
    let vm = SettingsViewModel(
      repo: FakeAIConsentRepo(),
      deleteAccountRepo: deleteRepo,
      accountSecurityRepo: FakeAccountSecurityRepo()
    )

    let shouldSignOut = await vm.requestAccountDeletion(userID: "u1")
    XCTAssertTrue(shouldSignOut)
    XCTAssertEqual(deleteRepo.startCalls, 1)
  }
}

import Foundation
@testable import VinctusNative

final class FakeDeleteAccountRepo: DeleteAccountRepo {
  var statusResult: AccountDeletionStatusState = .initial
  var startResult = AccountDeletionStartResult(mode: .async, status: .queued, jobID: "u1")
  var statusError: Error?
  var startError: Error?
  var revokeAppleError: Error?
  var revokedAppleCodes: [String] = []
  var startCalls = 0
  var statusCalls = 0

  func startAccountDeletion() async throws -> AccountDeletionStartResult {
    startCalls += 1
    if let startError { throw startError }
    return startResult
  }

  func getAccountDeletionStatus() async throws -> AccountDeletionStatusState {
    statusCalls += 1
    if let statusError { throw statusError }
    return statusResult
  }

  func revokeAppleToken(authorizationCode: String) async throws {
    revokedAppleCodes.append(authorizationCode)
    if let revokeAppleError { throw revokeAppleError }
  }
}

final class FakeAccountSecurityRepo: AccountSecurityRepo {
  var visibility: ProfileAccountVisibility = .public
  var fetchError: Error?
  var updateError: Error?
  var revokeError: Error?
  var updatedVisibilities: [ProfileAccountVisibility] = []
  var revokeCalls = 0

  func fetchAccountVisibility(uid: String) async throws -> ProfileAccountVisibility {
    if let fetchError { throw fetchError }
    return visibility
  }

  func setAccountVisibility(uid: String, visibility: ProfileAccountVisibility) async throws {
    if let updateError { throw updateError }
    self.visibility = visibility
    updatedVisibilities.append(visibility)
  }

  func revokeOtherSessions() async throws {
    revokeCalls += 1
    if let revokeError { throw revokeError }
  }
}

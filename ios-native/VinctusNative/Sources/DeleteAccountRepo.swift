import FirebaseCore
import FirebaseFunctions
import Foundation

enum AccountDeletionStatus: String {
  case notRequested = "not_requested"
  case queued
  case processing
  case completed
  case failed

  var title: String {
    switch self {
    case .notRequested:
      return "Sin solicitud"
    case .queued:
      return "Solicitud en cola"
    case .processing:
      return "Eliminando cuenta"
    case .completed:
      return "Cuenta eliminada"
    case .failed:
      return "Solicitud fallida"
    }
  }

  var canSubmitRequest: Bool {
    self == .notRequested || self == .failed
  }

  var shouldOfferSignOut: Bool {
    self == .queued || self == .processing || self == .completed
  }
}

enum AccountDeletionStartMode {
  case async
  case legacy
}

struct AccountDeletionStartResult {
  let mode: AccountDeletionStartMode
  let status: AccountDeletionStatus
  let jobID: String?
}

struct AccountDeletionStatusState {
  let status: AccountDeletionStatus
  let jobID: String?
  let updatedAt: String?
  let completedAt: String?
  let lastError: String?

  static let initial = AccountDeletionStatusState(
    status: .notRequested,
    jobID: nil,
    updatedAt: nil,
    completedAt: nil,
    lastError: nil
  )
}

protocol DeleteAccountRepo {
  func startAccountDeletion() async throws -> AccountDeletionStartResult
  func getAccountDeletionStatus() async throws -> AccountDeletionStatusState
}

enum DeleteAccountRepoError: LocalizedError {
  case firebaseNotConfigured
  case invalidResponse
  case requestNotAccepted
  case legacyDeleteFailed

  var errorDescription: String? {
    switch self {
    case .firebaseNotConfigured:
      return "Firebase no esta configurado."
    case .invalidResponse:
      return "Respuesta invalida del servidor para eliminar cuenta."
    case .requestNotAccepted:
      return "La solicitud de eliminacion no fue aceptada."
    case .legacyDeleteFailed:
      return "No se pudo iniciar la eliminacion de cuenta."
    }
  }
}

final class FirebaseDeleteAccountRepo: DeleteAccountRepo {
  private let functions: Functions?

  init(functions: Functions? = nil) {
    self.functions = functions
  }

  func startAccountDeletion() async throws -> AccountDeletionStartResult {
    do {
      let result = try await requestAccountDeletion()
      return AccountDeletionStartResult(
        mode: .async,
        status: result.status,
        jobID: result.jobID
      )
    } catch {
      if !isMissingFunctionError(error) {
        throw error
      }
    }

    let legacyData = try await callCallable(named: "deleteUserAccount")
    let success = legacyData["success"] as? Bool ?? false
    guard success else { throw DeleteAccountRepoError.legacyDeleteFailed }

    return AccountDeletionStartResult(mode: .legacy, status: .processing, jobID: nil)
  }

  func getAccountDeletionStatus() async throws -> AccountDeletionStatusState {
    let data = try await callCallable(named: "getAccountDeletionStatus")
    let status = parseStatus(data["status"]) ?? .failed

    return AccountDeletionStatusState(
      status: status,
      jobID: optionalString(data["jobId"]),
      updatedAt: optionalString(data["updatedAt"]),
      completedAt: optionalString(data["completedAt"]),
      lastError: optionalString(data["lastError"])
    )
  }

  private func requestAccountDeletion() async throws
    -> (status: AccountDeletionStatus, jobID: String?)
  {
    let data = try await callCallable(named: "requestAccountDeletion")
    let accepted = data["accepted"] as? Bool ?? false
    guard accepted else { throw DeleteAccountRepoError.requestNotAccepted }

    guard
      let status = parseStatus(data["status"]),
      status != .notRequested
    else {
      throw DeleteAccountRepoError.invalidResponse
    }

    return (status: status, jobID: optionalString(data["jobId"]))
  }

  private func callCallable(named name: String) async throws -> [String: Any] {
    guard FirebaseApp.app() != nil else { throw DeleteAccountRepoError.firebaseNotConfigured }

    let callable = (functions ?? Functions.functions()).httpsCallable(name)
    let result = try await callable.call()
    guard let data = result.data as? [String: Any] else {
      throw DeleteAccountRepoError.invalidResponse
    }
    return data
  }

  private func parseStatus(_ value: Any?) -> AccountDeletionStatus? {
    guard let rawValue = value as? String else { return nil }
    return AccountDeletionStatus(rawValue: rawValue)
  }

  private func optionalString(_ value: Any?) -> String? {
    guard let value, !(value is NSNull), let string = value as? String, !string.isEmpty else {
      return nil
    }
    return string
  }

  private func isMissingFunctionError(_ error: Error) -> Bool {
    let nsError = error as NSError

    if nsError.domain == FunctionsErrorDomain,
      let code = FunctionsErrorCode(rawValue: nsError.code)
    {
      return code == .notFound || code == .unimplemented
    }

    let codeFromUserInfo = (nsError.userInfo["code"] as? String)?.lowercased() ?? ""
    if codeFromUserInfo.contains("not-found") || codeFromUserInfo.contains("unimplemented") {
      return true
    }

    let description = nsError.localizedDescription.lowercased()
    return description.contains("not-found") || description.contains("unimplemented")
  }
}

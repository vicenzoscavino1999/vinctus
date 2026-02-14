import FirebaseCore
import FirebaseFirestore
import Foundation

enum AIConsentSource: String {
  case settings
  case aiChat = "ai_chat"
  case arena
  case migration
}

struct AIConsentState: Equatable {
  let granted: Bool
  let recorded: Bool
  let source: AIConsentSource?
  let updatedAt: Date?

  static let `default` = AIConsentState(
    granted: false,
    recorded: false,
    source: nil,
    updatedAt: nil
  )
}

protocol AIConsentRepo {
  func getConsent(uid: String) async throws -> AIConsentState
  func setConsent(uid: String, granted: Bool, source: AIConsentSource) async throws
}

enum AIConsentRepoError: LocalizedError {
  case firebaseNotConfigured
  case invalidUserID
  case missingSnapshot

  var errorDescription: String? {
    switch self {
    case .firebaseNotConfigured:
      return "Firebase not configured."
    case .invalidUserID:
      return "Invalid user session."
    case .missingSnapshot:
      return "Failed to load AI consent."
    }
  }
}

final class FirebaseAIConsentRepo: AIConsentRepo {
  private let db: Firestore?

  init(db: Firestore? = nil) {
    self.db = db
  }

  func getConsent(uid: String) async throws -> AIConsentState {
    guard FirebaseApp.app() != nil else { throw AIConsentRepoError.firebaseNotConfigured }
    guard !uid.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
      throw AIConsentRepoError.invalidUserID
    }

    let snapshot = try await getUserDocument(uid: uid)
    guard snapshot.exists, let data = snapshot.data() else {
      return .default
    }

    let settings = data["settings"] as? [String: Any]
    let ai = settings?["ai"] as? [String: Any]
    let grantedValue = ai?["consentGranted"] as? Bool
    let sourceValue = ai?["consentSource"] as? String
    let updatedAtValue = ai?["consentUpdatedAt"]

    let parsedSource = sourceValue.flatMap(AIConsentSource.init(rawValue:))
    let updatedAt: Date? = {
      if let timestamp = updatedAtValue as? Timestamp { return timestamp.dateValue() }
      if let date = updatedAtValue as? Date { return date }
      return nil
    }()

    return AIConsentState(
      granted: grantedValue == true,
      recorded: grantedValue != nil,
      source: parsedSource,
      updatedAt: updatedAt
    )
  }

  func setConsent(uid: String, granted: Bool, source: AIConsentSource) async throws {
    guard FirebaseApp.app() != nil else { throw AIConsentRepoError.firebaseNotConfigured }
    guard !uid.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
      throw AIConsentRepoError.invalidUserID
    }

    let db = self.db ?? Firestore.firestore()
    let ref = db.collection("users").document(uid)
    let payload: [String: Any] = [
      "settings": [
        "ai": [
          "consentGranted": granted,
          "consentSource": source.rawValue,
          "consentUpdatedAt": FieldValue.serverTimestamp(),
        ]
      ],
      "updatedAt": FieldValue.serverTimestamp(),
    ]

    try await setData(
      ref: ref,
      payload: payload,
      mergeFields: [
        "settings.ai.consentGranted",
        "settings.ai.consentSource",
        "settings.ai.consentUpdatedAt",
        "updatedAt",
      ]
    )
  }

  private func getUserDocument(uid: String) async throws -> DocumentSnapshot {
    let db = self.db ?? Firestore.firestore()
    let ref = db.collection("users").document(uid)

    return try await withCheckedThrowingContinuation {
      (continuation: CheckedContinuation<DocumentSnapshot, Error>) in
      ref.getDocument { snapshot, error in
        if let error = error {
          continuation.resume(throwing: error)
          return
        }
        guard let snapshot = snapshot else {
          continuation.resume(throwing: AIConsentRepoError.missingSnapshot)
          return
        }
        continuation.resume(returning: snapshot)
      }
    }
  }

  private func setData(
    ref: DocumentReference,
    payload: [String: Any],
    mergeFields: [Any]
  ) async throws {
    try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
      ref.setData(payload, mergeFields: mergeFields) { error in
        if let error = error {
          continuation.resume(throwing: error)
          return
        }
        continuation.resume(returning: ())
      }
    }
  }
}

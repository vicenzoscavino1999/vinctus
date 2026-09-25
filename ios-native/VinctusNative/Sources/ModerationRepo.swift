import FirebaseAuth
import FirebaseCore
import FirebaseFirestore
import Foundation

/// Reasons accepted by `isValidUserReportCreate` in firestore.rules. Titles match the web
/// report modal (`src/features/posts/components/ContentReportModal.tsx`).
enum ReportReason: String, CaseIterable, Identifiable {
  case spam
  case harassment
  case abuse
  case fake
  case other

  var id: String { rawValue }

  var title: String {
    switch self {
    case .spam:
      return "Spam o publicidad"
    case .harassment:
      return "Acoso"
    case .abuse:
      return "Abuso"
    case .fake:
      return "Suplantacion"
    case .other:
      return "Otro"
    }
  }
}

enum ReportTarget: Hashable {
  case post(postID: String, authorID: String?)
  case comment(postID: String, commentID: String, authorID: String?)
  case user(userID: String)

  var title: String {
    switch self {
    case .post:
      return "Denunciar publicacion"
    case .comment:
      return "Denunciar comentario"
    case .user:
      return "Denunciar usuario"
    }
  }
}

/// The target-dependent fields of a `reports/{id}` document. Built exactly like
/// `src/shared/lib/firestore/reports.ts`, so moderators get the same shape from web and native.
struct ReportFields: Equatable {
  /// `isValidUserReportCreate` caps `details` at 2000 characters.
  static let maxDetailsLength = 2000

  let reportedUID: String
  let details: String?
  let conversationID: String?

  init(target: ReportTarget, details rawDetails: String?) {
    let details = trimmedNonEmpty(rawDetails)

    switch target {
    case let .post(postID, authorID):
      reportedUID = trimmedNonEmpty(authorID) ?? postID
      self.details = details.map { "[Post \(postID)] \($0)" } ?? "Reporte de publicacion \(postID)"
      conversationID = "post_\(postID)"
    case let .comment(postID, commentID, authorID):
      reportedUID = trimmedNonEmpty(authorID) ?? commentID
      self.details = details.map { "[Post \(postID)][Comment \(commentID)] \($0)" }
        ?? "Reporte de comentario \(commentID) en post \(postID)"
      conversationID = "post_\(postID)_comment_\(commentID)"
    case let .user(userID):
      reportedUID = userID
      self.details = details
      conversationID = nil
    }
  }

  /// UTF-8 length is never below the rules' character count, so this check is conservative.
  var fitsRules: Bool {
    !reportedUID.isEmpty && (details?.utf8.count ?? 0) <= Self.maxDetailsLength
  }
}

protocol ModerationRepo {
  func report(_ target: ReportTarget, reason: ReportReason, details: String?) async throws
  func fetchBlockedUserIDs() async throws -> Set<String>
  func blockUser(_ blockedUID: String) async throws
  func unblockUser(_ blockedUID: String) async throws
}

enum ModerationRepoError: LocalizedError {
  case firebaseNotConfigured
  case userNotAuthenticated
  case invalidReport
  case invalidUserID
  case cannotBlockSelf
  case missingSnapshot

  var errorDescription: String? {
    switch self {
    case .firebaseNotConfigured:
      return "Firebase no esta configurado."
    case .userNotAuthenticated:
      return "Debes iniciar sesion."
    case .invalidReport:
      return "El detalle de la denuncia es demasiado largo."
    case .invalidUserID:
      return "No se pudo identificar al usuario."
    case .cannotBlockSelf:
      return "No puedes bloquearte a ti mismo."
    case .missingSnapshot:
      return "No se pudo cargar la lista de bloqueados."
    }
  }
}

final class FirebaseModerationRepo: ModerationRepo {
  /// Same cap the web uses when reading user subcollections.
  private static let blockedUsersFetchLimit = 1000

  private let db: Firestore?

  init(db: Firestore? = nil) {
    self.db = db
  }

  func report(_ target: ReportTarget, reason: ReportReason, details: String?) async throws {
    let (db, uid) = try firestoreAndUser()
    let fields = ReportFields(target: target, details: details)
    guard fields.fitsRules else { throw ModerationRepoError.invalidReport }

    let payload: [String: Any] = [
      "reporterUid": uid,
      "reportedUid": fields.reportedUID,
      "reason": reason.rawValue,
      "details": fields.details ?? NSNull(),
      "conversationId": fields.conversationID ?? NSNull(),
      "status": "open",
      "createdAt": FieldValue.serverTimestamp(),
    ]
    try await setData(db.collection("reports").document(), data: payload)
    AppLog.moderation.info("report.created reason=\(reason.rawValue, privacy: .public)")
  }

  func fetchBlockedUserIDs() async throws -> Set<String> {
    let (db, uid) = try firestoreAndUser()
    let query = db.collection("users").document(uid).collection("blockedUsers")
      .limit(to: Self.blockedUsersFetchLimit)
    let snapshot = try await getDocuments(query)
    return Set(snapshot.documents.map(\.documentID))
  }

  /// Mirrors `blockUser` in `src/shared/lib/firestore/blockedUsers.ts`.
  func blockUser(_ blockedUID: String) async throws {
    let (db, uid) = try firestoreAndUser()
    guard let blocked = trimmedNonEmpty(blockedUID) else { throw ModerationRepoError.invalidUserID }
    guard blocked != uid else { throw ModerationRepoError.cannotBlockSelf }

    let users = db.collection("users")
    let batch = db.batch()
    batch.setData(
      [
        "blockedUid": blocked,
        "status": "active",
        "blockedAt": FieldValue.serverTimestamp(),
      ],
      forDocument: users.document(uid).collection("blockedUsers").document(blocked)
    )

    // Follow relationships the rules let the blocker delete, in both directions
    batch.deleteDocument(users.document(uid).collection("following").document(blocked))
    batch.deleteDocument(users.document(uid).collection("followers").document(blocked))
    batch.deleteDocument(users.document(blocked).collection("followers").document(uid))

    // Hide the direct conversation from the blocker (index only)
    let conversationID = "dm_" + [uid, blocked].sorted().joined(separator: "_")
    batch.deleteDocument(
      users.document(uid).collection("directConversations").document(conversationID)
    )

    try await commit(batch)
    AppLog.moderation.info("block.created")

    // Outside the batch so a denied cleanup can't undo the block (a batch is all-or-nothing):
    // the blocked user's following edge needs the rule that lets the followed user remove it,
    // and follow requests may only be deleted by a participant once they exist.
    _ = try? await deleteDocument(users.document(blocked).collection("following").document(uid))
    for requestID in ["\(uid)_\(blocked)", "\(blocked)_\(uid)"] {
      let requestRef = db.collection("follow_requests").document(requestID)
      if let snapshot = try? await getDocument(requestRef), snapshot.exists {
        _ = try? await deleteDocument(requestRef)
      }
    }
  }

  func unblockUser(_ blockedUID: String) async throws {
    let (db, uid) = try firestoreAndUser()
    guard let blocked = trimmedNonEmpty(blockedUID) else { throw ModerationRepoError.invalidUserID }
    try await deleteDocument(
      db.collection("users").document(uid).collection("blockedUsers").document(blocked)
    )
    AppLog.moderation.info("block.removed")
  }

  private func firestoreAndUser() throws -> (Firestore, String) {
    guard FirebaseApp.app() != nil else { throw ModerationRepoError.firebaseNotConfigured }
    guard let uid = Auth.auth().currentUser?.uid else {
      throw ModerationRepoError.userNotAuthenticated
    }
    return (db ?? Firestore.firestore(), uid)
  }

  private func setData(_ ref: DocumentReference, data: [String: Any]) async throws {
    try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
      ref.setData(data) { error in
        if let error {
          continuation.resume(throwing: error)
          return
        }
        continuation.resume(returning: ())
      }
    }
  }

  private func deleteDocument(_ ref: DocumentReference) async throws {
    try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
      ref.delete { error in
        if let error {
          continuation.resume(throwing: error)
          return
        }
        continuation.resume(returning: ())
      }
    }
  }

  private func commit(_ batch: WriteBatch) async throws {
    try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
      batch.commit { error in
        if let error {
          continuation.resume(throwing: error)
          return
        }
        continuation.resume(returning: ())
      }
    }
  }

  private func getDocument(_ ref: DocumentReference) async throws -> DocumentSnapshot {
    try await withCheckedThrowingContinuation { continuation in
      ref.getDocument { snapshot, error in
        if let error {
          continuation.resume(throwing: error)
          return
        }
        guard let snapshot else {
          continuation.resume(throwing: ModerationRepoError.missingSnapshot)
          return
        }
        continuation.resume(returning: snapshot)
      }
    }
  }

  private func getDocuments(_ query: Query) async throws -> QuerySnapshot {
    try await withCheckedThrowingContinuation { continuation in
      query.getDocuments { snapshot, error in
        if let error {
          continuation.resume(throwing: error)
          return
        }
        guard let snapshot else {
          continuation.resume(throwing: ModerationRepoError.missingSnapshot)
          return
        }
        continuation.resume(returning: snapshot)
      }
    }
  }
}

private func trimmedNonEmpty(_ value: String?) -> String? {
  guard let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines), !trimmed.isEmpty else {
    return nil
  }
  return trimmed
}

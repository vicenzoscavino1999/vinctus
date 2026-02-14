import FirebaseAuth
import FirebaseFirestore
import FirebaseStorage
import Foundation

enum FirestoreAsyncBridgeError: LocalizedError {
  case missingSnapshot

  var errorDescription: String? {
    switch self {
    case .missingSnapshot:
      return "No se pudo leer el documento en Firestore."
    }
  }
}

enum FirestoreAsyncBridge {
  static func getDocument(
    _ ref: DocumentReference,
    source: FirestoreSource = .default
  ) async throws -> DocumentSnapshot {
    try await withCheckedThrowingContinuation { continuation in
      ref.getDocument(source: source) { snapshot, error in
        if let error {
          continuation.resume(throwing: error)
          return
        }
        guard let snapshot else {
          continuation.resume(throwing: FirestoreAsyncBridgeError.missingSnapshot)
          return
        }
        continuation.resume(returning: snapshot)
      }
    }
  }

  static func setData(
    _ ref: DocumentReference,
    data: [String: Any],
    merge: Bool = false
  ) async throws {
    try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
      ref.setData(data, merge: merge) { error in
        if let error {
          continuation.resume(throwing: error)
          return
        }
        continuation.resume(returning: ())
      }
    }
  }

  static func setData(
    _ ref: DocumentReference,
    data: [String: Any],
    mergeFields: [Any]
  ) async throws {
    try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
      ref.setData(data, mergeFields: mergeFields) { error in
        if let error {
          continuation.resume(throwing: error)
          return
        }
        continuation.resume(returning: ())
      }
    }
  }

  static func updateData(_ ref: DocumentReference, data: [String: Any]) async throws {
    try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
      ref.updateData(data) { error in
        if let error {
          continuation.resume(throwing: error)
          return
        }
        continuation.resume(returning: ())
      }
    }
  }

  static func getDocuments(
    _ query: Query,
    source: FirestoreSource = .default
  ) async throws -> QuerySnapshot {
    try await withCheckedThrowingContinuation { continuation in
      query.getDocuments(source: source) { snapshot, error in
        if let error {
          continuation.resume(throwing: error)
          return
        }
        guard let snapshot else {
          continuation.resume(throwing: FirestoreAsyncBridgeError.missingSnapshot)
          return
        }
        continuation.resume(returning: snapshot)
      }
    }
  }

  static func getDocumentsWithFallback(_ query: Query) async throws -> (QuerySnapshot, Bool) {
    do {
      let snapshot = try await getDocuments(query, source: .server)
      return (snapshot, false)
    } catch {
      let cachedSnapshot = try await getDocuments(query, source: .cache)
      return (cachedSnapshot, true)
    }
  }

  static func getDocumentWithFallback(_ ref: DocumentReference) async throws -> (DocumentSnapshot, Bool) {
    do {
      let snapshot = try await getDocument(ref, source: .server)
      return (snapshot, false)
    } catch {
      let cachedSnapshot = try await getDocument(ref, source: .cache)
      return (cachedSnapshot, true)
    }
  }

  static func commit(_ batch: WriteBatch) async throws {
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

  static func deleteDocument(_ ref: DocumentReference) async throws {
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
}

enum StorageAsyncBridge {
  static func deleteObject(_ ref: StorageReference) async throws {
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
}

enum AuthAsyncBridge {
  static func signIn(
    auth: Auth = Auth.auth(),
    email: String,
    password: String
  ) async throws {
    try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
      auth.signIn(withEmail: email, password: password) { _, error in
        if let error {
          continuation.resume(throwing: error)
          return
        }
        continuation.resume(returning: ())
      }
    }
  }

  static func createUser(
    auth: Auth = Auth.auth(),
    email: String,
    password: String
  ) async throws {
    try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
      auth.createUser(withEmail: email, password: password) { _, error in
        if let error {
          continuation.resume(throwing: error)
          return
        }
        continuation.resume(returning: ())
      }
    }
  }

  static func sendPasswordReset(
    auth: Auth = Auth.auth(),
    email: String
  ) async throws {
    try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
      auth.sendPasswordReset(withEmail: email) { error in
        if let error {
          continuation.resume(throwing: error)
          return
        }
        continuation.resume(returning: ())
      }
    }
  }
}

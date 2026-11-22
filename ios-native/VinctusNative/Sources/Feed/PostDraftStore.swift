import CryptoKit
import Foundation

struct PostDraftScope: Codable, Equatable, Sendable {
  let uid: String
  let groupID: String?
  var directoryName: String {
    let parts = [uid, groupID == nil ? "0" : "1", groupID ?? ""]
    let data = Data(parts.map { "\($0.utf8.count):\($0)" }.joined().utf8)
    return SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
  }
}

struct NativePostDraftIdentity: Codable, Equatable, Sendable {
  let title: String?
  let text: String
  let fileIDs: [String]
  let youtubeID: String?
}

struct PostDraftSnapshot: Sendable {
  var title = ""
  var text = ""
  var youtubeURL = ""
  var files: [ChatPendingAttachment] = []
  var pendingPostID: String?
  var pendingIdentity: NativePostDraftIdentity?
  var isEmpty: Bool { title.isEmpty && text.isEmpty && youtubeURL.isEmpty && files.isEmpty && pendingPostID == nil }
}

enum PostDraftStoreError: LocalizedError {
  case changedInAnotherEditor, invalidDraft, missingFile, notLoaded, wrongAccount
  var errorDescription: String? {
    switch self {
    case .changedInAnotherEditor: return "El borrador cambió en otro editor. Conserva tus cambios y vuelve a abrirlo."
    case .invalidDraft: return "No se pudo recuperar este borrador. Reintenta; tus datos guardados no se sobrescribieron."
    case .missingFile: return "No se pudo recuperar un adjunto del borrador. Reintenta antes de cerrar el editor."
    case .notLoaded: return "Espera a recuperar el borrador."
    case .wrongAccount: return "La cuenta cambió. Vuelve a abrir el editor."
    }
  }
}

/// All filesystem work runs off the main actor. A manifest commits atomically
/// after its private file copies exist; revisions also protect other windows.
actor PostDraftStore {
  static let shared = PostDraftStore()
  struct Loaded: Sendable { let revision: String?; let snapshot: PostDraftSnapshot? }
  private struct StoredFile: Codable {
    let id: String
    let storageName: String
    let name: String
    let type: String
    let size: Int
    let kind: String
  }
  private struct Payload: Codable {
    let title: String
    let text: String
    let youtubeURL: String
    let files: [StoredFile]
    let pendingPostID: String?
    let pendingIdentity: NativePostDraftIdentity?
  }
  private struct Manifest: Codable {
    let version: Int
    let scope: PostDraftScope
    let revision: String
    let payload: Payload?
  }
  private let root: URL?
  init(root: URL? = nil) { self.root = root }

  private func directory(_ scope: PostDraftScope) throws -> URL {
    guard !scope.uid.isEmpty else { throw PostDraftStoreError.wrongAccount }
    let manager = FileManager.default
    var base = try root ?? manager.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
      .appendingPathComponent("PostDrafts-v1", isDirectory: true)
    try manager.createDirectory(at: base, withIntermediateDirectories: true, attributes: [.protectionKey: FileProtectionType.complete])
    var values = URLResourceValues(); values.isExcludedFromBackup = true
    try base.setResourceValues(values)
    let folder = base.appendingPathComponent(scope.directoryName, isDirectory: true)
    try manager.createDirectory(at: folder.appendingPathComponent("files"), withIntermediateDirectories: true, attributes: [.protectionKey: FileProtectionType.complete])
    return folder
  }
  private func manifest(_ scope: PostDraftScope, folder: URL) throws -> Manifest? {
    let path = folder.appendingPathComponent("draft.json")
    guard FileManager.default.fileExists(atPath: path.path) else { return nil }
    let value = try JSONDecoder().decode(Manifest.self, from: Data(contentsOf: path))
    guard value.version == 1, value.scope == scope else { throw PostDraftStoreError.invalidDraft }
    return value
  }
  private func fileURL(_ stored: StoredFile, folder: URL) throws -> URL {
    guard UUID(uuidString: stored.storageName) != nil, !stored.id.isEmpty, !stored.id.contains("/"), stored.id.count <= 100 else { throw PostDraftStoreError.invalidDraft }
    return folder.appendingPathComponent("files").appendingPathComponent(stored.storageName)
  }
  func load(_ scope: PostDraftScope) throws -> Loaded {
    let folder = try directory(scope)
    guard let value = try manifest(scope, folder: folder) else { return Loaded(revision: nil, snapshot: nil) }
    guard let data = value.payload else { return Loaded(revision: value.revision, snapshot: nil) }
    guard data.title.count <= 4096, data.text.count <= 100_000, data.youtubeURL.count <= 8192,
      data.files.count <= 10, Set(data.files.map(\.id)).count == data.files.count,
      (data.pendingPostID == nil) == (data.pendingIdentity == nil),
      data.pendingPostID.map({ !$0.isEmpty && !$0.contains("/") && $0.count <= 200 }) ?? true
    else { throw PostDraftStoreError.invalidDraft }
    let files = try data.files.map { stored -> ChatPendingAttachment in
      let url = try fileURL(stored, folder: folder)
      guard FileManager.default.fileExists(atPath: url.path), let kind = ChatMediaKind(rawValue: stored.kind),
        let size = try FileManager.default.attributesOfItem(atPath: url.path)[.size] as? NSNumber,
        size.intValue == stored.size else { throw PostDraftStoreError.missingFile }
      try PostFiles.validate(contentType: stored.type, size: stored.size)
      return ChatPendingAttachment(fileURL: url, fileName: stored.name, contentType: stored.type, size: stored.size, kind: kind, id: stored.id)
    }
    return Loaded(revision: value.revision, snapshot: PostDraftSnapshot(title: data.title, text: data.text, youtubeURL: data.youtubeURL, files: files, pendingPostID: data.pendingPostID, pendingIdentity: data.pendingIdentity))
  }

  func save(_ snapshot: PostDraftSnapshot?, scope: PostDraftScope, expectedRevision: String?) throws -> String {
    let folder = try directory(scope)
    let previous = try manifest(scope, folder: folder)
    guard previous?.revision == expectedRevision else { throw PostDraftStoreError.changedInAnotherEditor }
    var created: [URL] = []
    do {
      var payload: Payload?
      if let snapshot, !snapshot.isEmpty {
        guard snapshot.files.count <= 10, Set(snapshot.files.map(\.id)).count == snapshot.files.count else { throw PostDraftStoreError.invalidDraft }
        let oldFiles = previous?.payload?.files ?? []
        let stored = try snapshot.files.map { file -> StoredFile in
          try PostFiles.validate(contentType: file.contentType, size: file.size)
          if let old = oldFiles.first(where: { $0.id == file.id && $0.size == file.size && $0.type == file.contentType && $0.name == file.fileName }),
            FileManager.default.fileExists(atPath: try fileURL(old, folder: folder).path) { return old }
          let entry = StoredFile(id: file.id, storageName: UUID().uuidString, name: file.fileName, type: file.contentType, size: file.size, kind: file.kind.rawValue)
          let destination = try fileURL(entry, folder: folder)
          created.append(destination)
          try FileManager.default.copyItem(at: file.fileURL, to: destination)
          guard (try FileManager.default.attributesOfItem(atPath: destination.path)[.size] as? NSNumber)?.intValue == file.size else { throw PostDraftStoreError.missingFile }
          try FileManager.default.setAttributes([.protectionKey: FileProtectionType.complete], ofItemAtPath: destination.path)
          return entry
        }
        payload = Payload(title: snapshot.title, text: snapshot.text, youtubeURL: snapshot.youtubeURL, files: stored, pendingPostID: snapshot.pendingPostID, pendingIdentity: snapshot.pendingIdentity)
      }
      // Keep a tombstone revision after success/discard: a stale window cannot
      // recreate the cleared operation or remove a newer draft.
      let next = Manifest(version: 1, scope: scope, revision: UUID().uuidString, payload: payload)
      try JSONEncoder().encode(next).write(to: folder.appendingPathComponent("draft.json"), options: [.atomic, .completeFileProtection])
      let kept = Set(payload?.files.map(\.storageName) ?? [])
      let filesFolder = folder.appendingPathComponent("files")
      for file in (try? FileManager.default.contentsOfDirectory(at: filesFolder, includingPropertiesForKeys: nil)) ?? [] where UUID(uuidString: file.lastPathComponent) != nil && !kept.contains(file.lastPathComponent) {
        try? FileManager.default.removeItem(at: file)
      }
      return next.revision
    } catch {
      for file in created { try? FileManager.default.removeItem(at: file) }
      throw error
    }
  }
}

@MainActor
final class PostDraftSession {
  let scope: PostDraftScope
  private let store: PostDraftStore
  private var revision: String?
  private var loaded = false
  private var previous: Task<Void, Error>?
  private var failure: Error?
  private var generation = 0
  private var latest: PostDraftSnapshot?
  var onState: ((Bool, String?) -> Void)?
  init(uid: String, groupID: String?, store: PostDraftStore = .shared) {
    self.scope = PostDraftScope(uid: uid, groupID: groupID); self.store = store
  }
  func load() async throws -> PostDraftSnapshot? {
    let value = try await store.load(scope)
    revision = value.revision; loaded = true; failure = nil; latest = value.snapshot
    return value.snapshot
  }
  func save(_ snapshot: PostDraftSnapshot?, retry: Bool = false) {
    latest = snapshot; generation += 1
    let request = generation; let before = previous
    onState?(true, failure?.localizedDescription)
    previous = Task { [self] in
      _ = try? await before?.value
      do {
        guard loaded else { throw PostDraftStoreError.notLoaded }
        if let failure, !retry { throw failure }
        revision = try await store.save(snapshot, scope: scope, expectedRevision: revision)
        failure = nil
        if generation == request { onState?(false, nil) }
      } catch {
        failure = error
        if generation == request { onState?(false, (error as? PostDraftStoreError)?.errorDescription ?? "No se pudo guardar el borrador en este dispositivo. Reintenta o libera espacio antes de cerrar.") }
        throw error
      }
    }
  }
  func flush() async throws { try await previous?.value }
  func retry() async throws { save(latest, retry: true); try await flush() }
}

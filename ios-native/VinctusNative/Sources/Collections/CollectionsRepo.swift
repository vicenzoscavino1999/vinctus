import FirebaseAuth
import FirebaseCore
import FirebaseFirestore
import FirebaseStorage
import Foundation
import UniformTypeIdentifiers

/// Icons of `COLLECTION_ICON_OPTIONS` in `src/features/collections/components/collectionIcons.tsx`.
enum CollectionIcon: String, CaseIterable, Identifiable {
  case folder
  case book
  case music
  case idea
  case notes

  var id: String { rawValue }

  var title: String {
    switch self {
    case .folder: return "Carpeta"
    case .book: return "Libro"
    case .music: return "Música"
    case .idea: return "Idea"
    case .notes: return "Notas"
    }
  }

  var systemImage: String {
    switch self {
    case .folder: return "folder"
    case .book: return "book"
    case .music: return "music.note"
    case .idea: return "lightbulb"
    case .notes: return "doc.text"
    }
  }

  static func from(_ value: String?) -> CollectionIcon {
    value.flatMap(CollectionIcon.init(rawValue:)) ?? .folder
  }
}

struct UserCollection: Identifiable, Hashable {
  let id: String
  let name: String
  let icon: CollectionIcon
  let itemCount: Int
  let updatedAt: Date
}

enum CollectionItemType: String {
  case link
  case note
  case file
}

struct CollectionItem: Identifiable, Hashable {
  let id: String
  let type: CollectionItemType
  let title: String
  let url: String?
  let text: String?
  let fileName: String?
  let createdAt: Date
  var fileSize: Int? = nil
  var storagePath: String? = nil
}

/// File payload validated against `storage.rules` (`collectionFile`, `< 25 MB`) and
/// `isValidCollectionItemCreate` in `firestore.rules`.
struct CollectionUploadFile: Equatable {
  let data: Data
  let fileName: String
  let contentType: String

  var size: Int { data.count }

  private static let extensionMimeFallbacks: [String: String] = [
    "pdf": "application/pdf",
    "txt": "text/plain",
    "md": "text/markdown",
    "markdown": "text/markdown",
    "json": "application/json",
    "zip": "application/zip",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "mp3": "audio/mpeg",
    "wav": "audio/wav",
    "ogg": "audio/ogg",
    "mp4": "video/mp4",
    "webm": "video/webm",
    "mov": "video/quicktime",
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "png": "image/png",
    "gif": "image/gif",
    "webp": "image/webp",
  ]

  static func normalizedContentType(_ raw: String) -> String {
    raw
      .split(separator: ";", maxSplits: 1)
      .first?
      .trimmingCharacters(in: .whitespacesAndNewlines)
      .lowercased() ?? ""
  }

  static func sanitizedStorageFileName(_ raw: String) -> String {
    let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
    let base = trimmed.isEmpty ? "archivo" : trimmed
    let replaced = base.replacingOccurrences(
      of: "[^a-zA-Z0-9._-]",
      with: "_",
      options: .regularExpression
    )
    let clean = replaced.trimmingCharacters(in: CharacterSet(charactersIn: "."))
    return String((clean.isEmpty ? "archivo" : clean).prefix(120))
  }

  static func mimeType(for url: URL, resourceContentType: UTType? = nil) -> String {
    let ext = url.pathExtension.lowercased()
    let candidates = [
      resourceContentType?.preferredMIMEType,
      UTType(filenameExtension: ext)?.preferredMIMEType,
      extensionMimeFallbacks[ext],
    ]
    for candidate in candidates {
      guard let candidate else { continue }
      let normalized = normalizedContentType(candidate)
      if StorageContentTypes.collectionFile.contains(normalized) {
        return normalized
      }
    }
    return normalizedContentType(
      resourceContentType?.preferredMIMEType
        ?? UTType(filenameExtension: ext)?.preferredMIMEType
        ?? ""
    )
  }

  static func load(from url: URL) throws -> CollectionUploadFile {
    let scoped = url.startAccessingSecurityScopedResource()
    defer { if scoped { url.stopAccessingSecurityScopedResource() } }

    let values = try url.resourceValues(forKeys: [.fileSizeKey, .contentTypeKey, .isRegularFileKey])
    if values.isRegularFile == false {
      throw CollectionsRepoError.invalidFile
    }
    if let fileSize = values.fileSize {
      guard fileSize > 0, fileSize < StorageMaxBytes.file else {
        throw CollectionsRepoError.invalidFile
      }
    }
    let contentType = mimeType(for: url, resourceContentType: values.contentType)
    guard StorageContentTypes.collectionFile.contains(contentType) else {
      throw CollectionsRepoError.unsupportedFileType
    }
    let data = try Data(contentsOf: url)
    let upload = CollectionUploadFile(
      data: data,
      fileName: url.lastPathComponent,
      contentType: contentType
    )
    _ = try upload.validated()
    return upload
  }

  func validated() throws -> (fileName: String, contentType: String, storageFileName: String) {
    guard !data.isEmpty, data.count < StorageMaxBytes.file else {
      throw CollectionsRepoError.invalidFile
    }
    let normalizedType = Self.normalizedContentType(contentType)
    guard !normalizedType.isEmpty,
          normalizedType.count <= 120,
          StorageContentTypes.collectionFile.contains(normalizedType) else {
      throw CollectionsRepoError.unsupportedFileType
    }
    let trimmedName = fileName.trimmingCharacters(in: .whitespacesAndNewlines)
    let safeDisplayName = String((trimmedName.isEmpty ? "archivo" : trimmedName).prefix(200))
    let storageFileName = Self.sanitizedStorageFileName(safeDisplayName)
    return (fileName: safeDisplayName, contentType: normalizedType, storageFileName: storageFileName)
  }
}

/// A link, note, or file to add to a private collection.
struct NewCollectionItem {
  enum Kind: String, CaseIterable, Identifiable {
    case link
    case note
    case file

    var id: String { rawValue }
    var title: String {
      switch self {
      case .link: return "Enlace"
      case .note: return "Nota"
      case .file: return "Archivo"
      }
    }
  }

  struct ValidatedFields {
    let type: CollectionItemType
    let title: String
    let url: String?
    let text: String?
    let file: CollectionUploadFile?
  }

  var kind: Kind = .link
  var title = ""
  var url = ""
  var text = ""
  var file: CollectionUploadFile?

  /// Accepts only http/https URLs with a non-empty host.
  static func safeHTTPURL(_ raw: String?) -> URL? {
    guard let raw else { return nil }
    let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty,
          let parsed = URL(string: trimmed),
          let scheme = parsed.scheme?.lowercased(),
          scheme == "http" || scheme == "https",
          let host = parsed.host,
          !host.isEmpty else {
      return nil
    }
    return parsed
  }

  /// The Firestore fields for `isValidCollectionItemCreate` in firestore.rules (title 1-160,
  /// link up to 600 and http or https, note 1-2000, file under 25 MB with allowed MIME type),
  /// or an error explaining what is wrong.
  func validatedFields() throws -> ValidatedFields {
    let title = title.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !title.isEmpty, title.count <= Limits.CollectionItems.titleMaxLength else {
      throw CollectionsRepoError.invalidItem
    }
    switch kind {
    case .link:
      let url = url.trimmingCharacters(in: .whitespacesAndNewlines)
      guard !url.isEmpty,
            url.count <= Limits.CollectionItems.urlMaxLength,
            Self.safeHTTPURL(url) != nil else {
        throw CollectionsRepoError.invalidItem
      }
      return ValidatedFields(type: .link, title: title, url: url, text: nil, file: nil)
    case .note:
      let text = text.trimmingCharacters(in: .whitespacesAndNewlines)
      guard !text.isEmpty, text.count <= Limits.CollectionItems.noteMaxLength else {
        throw CollectionsRepoError.invalidItem
      }
      return ValidatedFields(type: .note, title: title, url: nil, text: text, file: nil)
    case .file:
      guard let file else {
        throw CollectionsRepoError.invalidFile
      }
      _ = try file.validated()
      return ValidatedFields(type: .file, title: title, url: nil, text: nil, file: file)
    }
  }
}

/// Private collections of links, notes and files, over the same data as the web
/// (`src/shared/lib/firestore/collections.ts`): `users/{uid}/collections/{id}/items/{itemId}`.
protocol CollectionsRepo {
  func fetchCollections() async throws -> [UserCollection]
  func createCollection(name: String, icon: CollectionIcon) async throws
  func updateCollection(id: String, name: String, icon: CollectionIcon) async throws
  func deleteCollection(id: String) async throws
  func fetchItems(collectionID: String) async throws -> [CollectionItem]
  func addItem(_ item: NewCollectionItem, to collection: UserCollection) async throws
  func deleteItem(id: String, from collectionID: String) async throws
}

enum CollectionsRepoError: LocalizedError {
  case firebaseNotConfigured
  case userNotAuthenticated
  case invalidName
  case invalidItem
  case invalidFile
  case unsupportedFileType
  case collectionNotFound

  var errorDescription: String? {
    switch self {
    case .firebaseNotConfigured:
      return "Firebase no está configurado."
    case .userNotAuthenticated:
      return "Debes iniciar sesión."
    case .invalidName:
      return "El nombre debe tener entre 1 y \(Limits.Collections.nameMaxLength) caracteres."
    case .invalidItem:
      return "Revisa el título (máximo \(Limits.CollectionItems.titleMaxLength)), el enlace (http o https) "
        + "o la nota (máximo \(Limits.CollectionItems.noteMaxLength))."
    case .invalidFile:
      return "Selecciona un archivo válido de hasta \(StorageMaxBytes.file / 1024 / 1024) MB."
    case .unsupportedFileType:
      return "Formato de archivo no permitido para colecciones."
    case .collectionNotFound:
      return "La colección ya no existe."
    }
  }
}

final class FirebaseCollectionsRepo: CollectionsRepo {
  private static let collectionsLimit = 50
  private static let itemsLimit = 100

  private func collectionsRef() throws -> CollectionReference {
    guard FirebaseApp.app() != nil else { throw CollectionsRepoError.firebaseNotConfigured }
    guard let uid = Auth.auth().currentUser?.uid else { throw CollectionsRepoError.userNotAuthenticated }
    return Firestore.firestore().collection(FirestoreCollections.users).document(uid)
      .collection(FirestoreSubcollections.collections)
  }

  static func validatedName(_ name: String) throws -> String {
    let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty, trimmed.count <= Limits.Collections.nameMaxLength else {
      throw CollectionsRepoError.invalidName
    }
    return trimmed
  }

  /// Mirrors `getUserCollections`.
  func fetchCollections() async throws -> [UserCollection] {
    let snapshot = try await collectionsRef()
      .order(by: "createdAt", descending: true)
      .limit(to: Self.collectionsLimit)
      .getDocuments()
    return snapshot.documents.map { document in
      let data = document.data()
      return UserCollection(
        id: document.documentID,
        name: FirestoreValue.string(data["name"]) ?? "Colección",
        icon: CollectionIcon.from(data["icon"] as? String),
        itemCount: max(FirestoreValue.int(data["itemCount"]) ?? 0, 0),
        updatedAt: FirestoreValue.date(data["updatedAt"]) ?? Date()
      )
    }
  }

  /// Mirrors `createCollection`.
  func createCollection(name: String, icon: CollectionIcon) async throws {
    let name = try Self.validatedName(name)
    try await collectionsRef().document().setData([
      "name": name,
      "icon": icon.rawValue,
      "itemCount": 0,
      "createdAt": FieldValue.serverTimestamp(),
      "updatedAt": FieldValue.serverTimestamp(),
    ])
  }

  /// Mirrors `updateCollection`.
  func updateCollection(id: String, name: String, icon: CollectionIcon) async throws {
    let name = try Self.validatedName(name)
    try await collectionsRef().document(id).updateData([
      "name": name,
      "icon": icon.rawValue,
      "updatedAt": FieldValue.serverTimestamp(),
    ])
  }

  private static let deleteBatchLimit = 400

  /// Mirrors `deleteCollection`: deletes all items in paginated batches plus the parent collection,
  /// then removes any associated Storage files best-effort.
  func deleteCollection(id: String) async throws {
    let collection = try collectionsRef().document(id)
    let itemsRef = collection.collection(FirestoreSubcollections.items)
    let db = Firestore.firestore()
    var storagePaths: [String] = []

    while true {
      let snapshot = try await itemsRef.limit(to: Self.deleteBatchLimit).getDocuments()
      for doc in snapshot.documents {
        if let path = FirestoreValue.string(doc.data()["storagePath"]), !path.isEmpty {
          storagePaths.append(path)
        }
      }
      let batch = db.batch()
      snapshot.documents.forEach { batch.deleteDocument($0.reference) }
      let isLastPage = snapshot.documents.count < Self.deleteBatchLimit
      if isLastPage {
        batch.deleteDocument(collection)
      }
      try await batch.commit()
      if isLastPage {
        break
      }
    }

    await Self.deleteStoragePaths(storagePaths)
  }

  /// Mirrors `getCollectionItems`.
  func fetchItems(collectionID: String) async throws -> [CollectionItem] {
    let snapshot = try await collectionsRef().document(collectionID).collection(FirestoreSubcollections.items)
      .order(by: "createdAt", descending: true)
      .limit(to: Self.itemsLimit)
      .getDocuments()
    return snapshot.documents.map { document in
      let data = document.data()
      return CollectionItem(
        id: document.documentID,
        type: CollectionItemType(rawValue: data["type"] as? String ?? "") ?? .note,
        title: FirestoreValue.string(data["title"]) ?? "Sin título",
        url: FirestoreValue.string(data["url"]),
        text: FirestoreValue.string(data["text"]),
        fileName: FirestoreValue.string(data["fileName"]),
        createdAt: FirestoreValue.date(data["createdAt"]) ?? Date(),
        fileSize: FirestoreValue.int(data["fileSize"]),
        storagePath: FirestoreValue.string(data["storagePath"])
      )
    }
  }

  /// Mirrors `createCollectionItem`: validates inputs, uploads file media to Storage when needed
  /// (cleaning up the uploaded object if the Firestore transaction fails), and updates `itemCount`
  /// transactionally.
  func addItem(_ item: NewCollectionItem, to collection: UserCollection) async throws {
    let fields = try item.validatedFields()
    let collectionRef = try collectionsRef().document(collection.id)
    guard let uid = Auth.auth().currentUser?.uid else { throw CollectionsRepoError.userNotAuthenticated }
    let db = Firestore.firestore()
    let itemRef = collectionRef.collection(FirestoreSubcollections.items).document()
    let trimmedCollectionName = collection.name.trimmingCharacters(in: .whitespacesAndNewlines)
    let safeCollectionName = String(
      (trimmedCollectionName.isEmpty ? "Colección" : trimmedCollectionName)
        .prefix(Limits.CollectionItems.collectionNameMaxLength)
    )

    var uploadedRef: StorageReference?
    var urlValue: Any = fields.url ?? NSNull()
    var fileNameValue: Any = NSNull()
    var fileSizeValue: Any = NSNull()
    var contentTypeValue: Any = NSNull()
    var storagePathValue: Any = NSNull()

    if let upload = fields.file {
      let validatedFile = try upload.validated()
      let millis = Int64(Date().timeIntervalSince1970 * 1000)
      let path = StoragePaths.collectionFile(
        userID: uid,
        collectionID: collection.id,
        itemID: itemRef.documentID,
        filename: "\(millis)_\(validatedFile.storageFileName)"
      )
      guard path.count <= 600 else { throw CollectionsRepoError.invalidFile }
      let fileRef = Storage.storage().reference(withPath: path)
      let metadata = StorageMetadata()
      metadata.contentType = validatedFile.contentType
      metadata.cacheControl = "private, max-age=3600"
      _ = try await fileRef.putDataAsync(upload.data, metadata: metadata)
      uploadedRef = fileRef

      do {
        let downloadURL = try await fileRef.downloadURL().absoluteString
        guard downloadURL.count <= Limits.CollectionItems.urlMaxLength,
              NewCollectionItem.safeHTTPURL(downloadURL) != nil else {
          throw CollectionsRepoError.invalidFile
        }
        urlValue = downloadURL
        fileNameValue = validatedFile.fileName
        fileSizeValue = upload.data.count
        contentTypeValue = validatedFile.contentType
        storagePathValue = path
      } catch {
        try? await fileRef.delete()
        throw error
      }
    }

    let payload: [String: Any] = [
      "ownerId": uid,
      "collectionId": collection.id,
      "collectionName": safeCollectionName,
      "type": fields.type.rawValue,
      "title": fields.title,
      "url": urlValue,
      "text": fields.text ?? NSNull(),
      "fileName": fileNameValue,
      "fileSize": fileSizeValue,
      "contentType": contentTypeValue,
      "storagePath": storagePathValue,
      "createdAt": FieldValue.serverTimestamp(),
    ]

    do {
      _ = try await db.runTransaction { transaction, errorPointer -> Any? in
        do {
          let collectionSnap = try transaction.getDocument(collectionRef)
          guard collectionSnap.exists else { throw CollectionsRepoError.collectionNotFound }
          let currentCount = max(FirestoreValue.int(collectionSnap.data()?["itemCount"]) ?? 0, 0)
          transaction.setData(payload, forDocument: itemRef)
          transaction.updateData(
            ["itemCount": currentCount + 1, "updatedAt": FieldValue.serverTimestamp()],
            forDocument: collectionRef
          )
          return nil
        } catch {
          errorPointer?.pointee = error as NSError
          return nil
        }
      }
    } catch {
      if let uploadedRef {
        try? await uploadedRef.delete()
      }
      throw error
    }
  }

  /// Mirrors `deleteCollectionItem`: deletes the item and clamps `itemCount` at >= 0 inside a
  /// transaction, then removes any associated Storage file best-effort.
  func deleteItem(id: String, from collectionID: String) async throws {
    let collectionRef = try collectionsRef().document(collectionID)
    let itemRef = collectionRef.collection(FirestoreSubcollections.items).document(id)
    let db = Firestore.firestore()

    let deletedPath = try await db.runTransaction { transaction, errorPointer -> Any? in
      do {
        let itemSnap = try transaction.getDocument(itemRef)
        let collectionSnap = try transaction.getDocument(collectionRef)
        let path = FirestoreValue.string(itemSnap.data()?["storagePath"]) ?? ""
        if itemSnap.exists {
          transaction.deleteDocument(itemRef)
        }
        if collectionSnap.exists {
          let currentCount = max(FirestoreValue.int(collectionSnap.data()?["itemCount"]) ?? 0, 0)
          let nextCount = itemSnap.exists ? max(0, currentCount - 1) : currentCount
          transaction.updateData(
            ["itemCount": nextCount, "updatedAt": FieldValue.serverTimestamp()],
            forDocument: collectionRef
          )
        }
        return path
      } catch {
        errorPointer?.pointee = error as NSError
        return nil
      }
    } as? String

    if let deletedPath, !deletedPath.isEmpty {
      await Self.deleteStoragePaths([deletedPath])
    }
  }

  private static func deleteStoragePaths(_ paths: [String]) async {
    let uniquePaths = Array(Set(paths.filter { !$0.isEmpty }))
    guard !uniquePaths.isEmpty else { return }
    for path in uniquePaths {
      try? await Storage.storage().reference(withPath: path).delete()
    }
  }
}

import FirebaseAuth
import FirebaseCore
import FirebaseFirestore
import Foundation

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
}

/// A link or note to add. Files are uploaded from the web.
struct NewCollectionItem {
  enum Kind: String, CaseIterable, Identifiable {
    case link
    case note

    var id: String { rawValue }
    var title: String { self == .link ? "Enlace" : "Nota" }
  }

  var kind: Kind = .link
  var title = ""
  var url = ""
  var text = ""

  /// The Firestore fields for `isValidCollectionItemCreate` in firestore.rules (title 1-160,
  /// link up to 600 and http or https, note 1-2000), or an error explaining what is wrong.
  func validatedFields() throws -> (type: CollectionItemType, title: String, url: String?, text: String?) {
    let title = title.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !title.isEmpty, title.count <= 160 else { throw CollectionsRepoError.invalidItem }
    switch kind {
    case .link:
      let url = url.trimmingCharacters(in: .whitespacesAndNewlines)
      let scheme = URL(string: url)?.scheme?.lowercased()
      guard !url.isEmpty, url.count <= 600, scheme == "http" || scheme == "https" else {
        throw CollectionsRepoError.invalidItem
      }
      return (.link, title, url, nil)
    case .note:
      let text = text.trimmingCharacters(in: .whitespacesAndNewlines)
      guard !text.isEmpty, text.count <= 2000 else { throw CollectionsRepoError.invalidItem }
      return (.note, title, nil, text)
    }
  }
}

/// Private collections of links and notes, over the same data as the web
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

  var errorDescription: String? {
    switch self {
    case .firebaseNotConfigured:
      return "Firebase no está configurado."
    case .userNotAuthenticated:
      return "Debes iniciar sesión."
    case .invalidName:
      return "El nombre debe tener entre 1 y 80 caracteres."
    case .invalidItem:
      return "Revisa el título (máximo 160), el enlace (http o https) o la nota (máximo 2000)."
    }
  }
}

final class FirebaseCollectionsRepo: CollectionsRepo {
  private static let collectionsLimit = 50
  private static let itemsLimit = 100

  private func collectionsRef() throws -> CollectionReference {
    guard FirebaseApp.app() != nil else { throw CollectionsRepoError.firebaseNotConfigured }
    guard let uid = Auth.auth().currentUser?.uid else { throw CollectionsRepoError.userNotAuthenticated }
    return Firestore.firestore().collection("users").document(uid).collection("collections")
  }

  static func validatedName(_ name: String) throws -> String {
    let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty, trimmed.count <= 80 else { throw CollectionsRepoError.invalidName }
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

  /// Mirrors `deleteCollection`, and also removes the items so none are left behind.
  func deleteCollection(id: String) async throws {
    let collection = try collectionsRef().document(id)
    let items = try await collection.collection("items").limit(to: 400).getDocuments()
    let batch = Firestore.firestore().batch()
    items.documents.forEach { batch.deleteDocument($0.reference) }
    batch.deleteDocument(collection)
    try await batch.commit()
  }

  /// Mirrors `getCollectionItems`.
  func fetchItems(collectionID: String) async throws -> [CollectionItem] {
    let snapshot = try await collectionsRef().document(collectionID).collection("items")
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
        createdAt: FirestoreValue.date(data["createdAt"]) ?? Date()
      )
    }
  }

  /// Mirrors `createCollectionItem` (item plus the collection's counter, in one batch).
  func addItem(_ item: NewCollectionItem, to collection: UserCollection) async throws {
    let fields = try item.validatedFields()
    let collectionRef = try collectionsRef().document(collection.id)
    guard let uid = Auth.auth().currentUser?.uid else { throw CollectionsRepoError.userNotAuthenticated }
    let batch = Firestore.firestore().batch()
    batch.setData(
      [
        "ownerId": uid,
        "collectionId": collection.id,
        "collectionName": String(collection.name.prefix(120)),
        "type": fields.type.rawValue,
        "title": fields.title,
        "url": fields.url ?? NSNull(),
        "text": fields.text ?? NSNull(),
        "fileName": NSNull(),
        "fileSize": NSNull(),
        "contentType": NSNull(),
        "storagePath": NSNull(),
        "createdAt": FieldValue.serverTimestamp(),
      ],
      forDocument: collectionRef.collection("items").document()
    )
    batch.updateData(
      ["itemCount": FieldValue.increment(Int64(1)), "updatedAt": FieldValue.serverTimestamp()],
      forDocument: collectionRef
    )
    try await batch.commit()
  }

  /// Mirrors `deleteCollectionItem`.
  func deleteItem(id: String, from collectionID: String) async throws {
    let collectionRef = try collectionsRef().document(collectionID)
    let batch = Firestore.firestore().batch()
    batch.deleteDocument(collectionRef.collection("items").document(id))
    batch.updateData(
      ["itemCount": FieldValue.increment(Int64(-1)), "updatedAt": FieldValue.serverTimestamp()],
      forDocument: collectionRef
    )
    try await batch.commit()
  }
}

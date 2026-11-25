import FirebaseAuth
import FirebaseCore
import FirebaseFirestore
import Foundation

// The web's Conexiones tab (`src/features/projects/pages/ProjectsPage.tsx`): collaborations people
// publish to find someone for a project, and encounters (events) they can attend.
// Mirrors `src/shared/lib/firestore/collaborations.ts` and `src/shared/lib/firestore/events.ts`:
// keep field names identical and check `firestore.rules` (`isValidCollaborationCreate`,
// `isValidCollaborationRequestCreate`, `isValidEventCreate`, `events/{id}/attendees`) when writing.

enum CollaborationMode: String, CaseIterable, Identifiable {
  case virtual
  case presencial

  var id: String { rawValue }
  var label: String { self == .virtual ? "Virtual" : "Presencial" }
}

enum CollaborationLevel: String, CaseIterable, Identifiable {
  case principiante
  case intermedio
  case experto

  var id: String { rawValue }
  var label: String {
    switch self {
    case .principiante: return "Principiante"
    case .intermedio: return "Intermedio"
    case .experto: return "Experto"
    }
  }
}

struct Collaboration: Identifiable, Hashable {
  let id: String
  let title: String
  let context: String
  let seekingRole: String
  let mode: CollaborationMode
  let location: String?
  let level: CollaborationLevel
  let topic: String?
  let tags: [String]
  let authorID: String
  let authorName: String
  let authorPhotoURL: String?
  let createdAt: Date
}

/// A new collaboration, validated with the limits of `isValidCollaborationData` in firestore.rules
/// (and `createCollaborationInputSchema` on the web).
struct CollaborationDraft: Equatable {
  static let titleLimit = 120
  static let contextLimit = 120
  static let seekingRoleLimit = 80
  static let locationLimit = 120
  static let topicLimit = 160
  static let tagLimit = 40
  static let maxTags = 6

  var title = ""
  var context = ""
  var seekingRole = ""
  var mode: CollaborationMode = .virtual
  var location = ""
  var level: CollaborationLevel = .intermedio
  var topic = ""
  /// Comma separated, like the web form.
  var tagsText = ""

  var tags: [String] {
    var seen = Set<String>()
    return tagsText
      .split(separator: ",")
      .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
      .filter { !$0.isEmpty && seen.insert($0.lowercased()).inserted }
  }

  /// The trimmed draft, or nil when the rules would reject it.
  func validated() -> CollaborationDraft? {
    var copy = self
    copy.title = title.trimmingCharacters(in: .whitespacesAndNewlines)
    copy.context = context.trimmingCharacters(in: .whitespacesAndNewlines)
    copy.seekingRole = seekingRole.trimmingCharacters(in: .whitespacesAndNewlines)
    copy.location = location.trimmingCharacters(in: .whitespacesAndNewlines)
    copy.topic = topic.trimmingCharacters(in: .whitespacesAndNewlines)
    let tags = copy.tags
    guard !copy.title.isEmpty, copy.title.count <= Self.titleLimit,
          !copy.context.isEmpty, copy.context.count <= Self.contextLimit,
          !copy.seekingRole.isEmpty, copy.seekingRole.count <= Self.seekingRoleLimit,
          copy.location.count <= Self.locationLimit,
          copy.topic.count <= Self.topicLimit,
          tags.count <= Self.maxTags,
          tags.allSatisfy({ $0.count <= Self.tagLimit })
    else { return nil }
    return copy
  }
}

/// An encounter, the web's event (`events/{id}`).
struct Encounter: Identifiable, Hashable {
  let id: String
  let title: String
  let description: String?
  let startAt: Date?
  let city: String?
  let venue: String?
  let capacity: Int?
  let attendeesCount: Int?
  let createdBy: String
  let isPublic: Bool

  var isFull: Bool {
    guard let capacity, capacity > 0, let attendeesCount else { return false }
    return attendeesCount >= capacity
  }
}

/// A new encounter, with the limits of `isValidEventCreate` in firestore.rules.
struct EncounterDraft: Equatable {
  static let titleLimit = 120
  static let descriptionLimit = 2000
  static let cityLimit = 80
  static let venueLimit = 120
  static let capacityLimit = 100_000

  var title = ""
  var description = ""
  var startAt = Date().addingTimeInterval(24 * 60 * 60)
  var city = ""
  var venue = ""
  /// Empty means no limit.
  var capacityText = ""

  var capacity: Int? {
    let trimmed = capacityText.trimmingCharacters(in: .whitespacesAndNewlines)
    return trimmed.isEmpty ? nil : Int(trimmed)
  }

  func validated(now: Date = Date()) -> EncounterDraft? {
    var copy = self
    copy.title = title.trimmingCharacters(in: .whitespacesAndNewlines)
    copy.description = description.trimmingCharacters(in: .whitespacesAndNewlines)
    copy.city = city.trimmingCharacters(in: .whitespacesAndNewlines)
    copy.venue = venue.trimmingCharacters(in: .whitespacesAndNewlines)
    let capacityIsValid: Bool = {
      if capacityText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { return true }
      guard let capacity else { return false }
      return capacity >= 1 && capacity <= Self.capacityLimit
    }()
    guard !copy.title.isEmpty, copy.title.count <= Self.titleLimit,
          copy.description.count <= Self.descriptionLimit,
          copy.city.count <= Self.cityLimit,
          copy.venue.count <= Self.venueLimit,
          capacityIsValid,
          startAt > now
    else { return nil }
    return copy
  }
}

struct ConnectionsAuthor: Equatable {
  let uid: String
  let displayName: String
  let photoURL: String?
}

protocol ConnectionsRepo {
  /// Open collaborations, newest first, like the web's `getCollaborations`.
  func fetchCollaborations(limit: Int) async throws -> [Collaboration]
  /// Collaborations the user already asked to join (pending or accepted), like `getSentCollaborationRequestIds`.
  func fetchRequestedCollaborationIDs(uid: String) async throws -> Set<String>
  func currentAuthor() async throws -> ConnectionsAuthor
  func createCollaboration(_ draft: CollaborationDraft, author: ConnectionsAuthor) async throws -> String
  /// Rejects pending requests and deletes the collaboration, like the web's `deleteCollaboration`.
  func deleteCollaboration(id: String, authorID: String) async throws
  func sendCollaborationRequest(to collaboration: Collaboration, from author: ConnectionsAuthor, message: String?) async throws

  /// Upcoming public encounters, soonest first, like the web's `getUpcomingEvents`.
  func fetchUpcomingEncounters(limit: Int) async throws -> [Encounter]
  /// Creates the encounter and signs its creator up, like the web's `createEvent`.
  func createEncounter(_ draft: EncounterDraft, ownerID: String) async throws -> String
  func isAttending(encounterID: String, uid: String) async throws -> Bool
  func joinEncounter(encounterID: String, uid: String) async throws
  func leaveEncounter(encounterID: String, uid: String) async throws
  func deleteEncounter(encounterID: String) async throws
}

enum ConnectionsRepoError: LocalizedError, Equatable {
  case firebaseNotConfigured
  case notSignedIn
  case invalidDraft
  case requestAlreadySent
  case requestAlreadyAccepted
  case encounterNotFound
  case privateEncounter

  var errorDescription: String? {
    switch self {
    case .firebaseNotConfigured: return "Firebase no está configurado."
    case .notSignedIn: return "Inicia sesión para continuar."
    case .invalidDraft: return "Revisa los campos obligatorios y su longitud."
    case .requestAlreadySent: return "Ya enviaste una solicitud para este proyecto."
    case .requestAlreadyAccepted: return "Esta solicitud ya fue aceptada."
    case .encounterNotFound: return "Encuentro no encontrado."
    case .privateEncounter: return "Este encuentro es privado."
    }
  }
}

final class FirebaseConnectionsRepo: ConnectionsRepo {
  private let injectedDB: Firestore?

  init(db: Firestore? = nil) {
    self.injectedDB = db
  }

  private func db() throws -> Firestore {
    guard FirebaseApp.app() != nil else { throw ConnectionsRepoError.firebaseNotConfigured }
    return injectedDB ?? Firestore.firestore()
  }

  // MARK: Collaborations

  func fetchCollaborations(limit: Int) async throws -> [Collaboration] {
    let snapshot = try await db().collection(FirestoreCollections.collaborations)
      .order(by: "createdAt", descending: true)
      .limit(to: max(1, min(50, limit)))
      .getDocuments()
    return snapshot.documents.compactMap { Self.collaboration(id: $0.documentID, data: $0.data()) }
  }

  static func collaboration(id: String, data: [String: Any]) -> Collaboration? {
    guard (data["status"] as? String) != "closed" else { return nil }
    let author = data["authorSnapshot"] as? [String: Any] ?? [:]
    return Collaboration(
      id: id,
      title: FirestoreValue.string(data["title"]) ?? "",
      context: FirestoreValue.string(data["context"]) ?? "",
      seekingRole: FirestoreValue.string(data["seekingRole"]) ?? "",
      mode: CollaborationMode(rawValue: data["mode"] as? String ?? "") ?? .virtual,
      location: FirestoreValue.string(data["location"]),
      level: CollaborationLevel(rawValue: data["level"] as? String ?? "") ?? .principiante,
      topic: FirestoreValue.string(data["topic"]),
      tags: (data["tags"] as? [Any] ?? []).compactMap { FirestoreValue.string($0) },
      authorID: FirestoreValue.string(data["authorId"]) ?? "",
      authorName: FirestoreValue.string(author["displayName"]) ?? "Usuario",
      authorPhotoURL: FirestoreValue.string(author["photoURL"]),
      createdAt: FirestoreValue.date(data["createdAt"]) ?? Date()
    )
  }

  func fetchRequestedCollaborationIDs(uid: String) async throws -> Set<String> {
    let snapshot = try await db().collection(FirestoreCollections.collaborationRequests)
      .whereField("fromUid", isEqualTo: uid)
      .limit(to: 50)
      .getDocuments()
    var ids = Set<String>()
    for doc in snapshot.documents {
      let data = doc.data()
      let status = data["status"] as? String
      if let id = FirestoreValue.string(data["collaborationId"]), status == "pending" || status == "accepted" {
        ids.insert(id)
      }
    }
    return ids
  }

  func currentAuthor() async throws -> ConnectionsAuthor {
    guard let user = Auth.auth().currentUser else { throw ConnectionsRepoError.notSignedIn }
    let profile = (try? await db().collection(FirestoreCollections.usersPublic).document(user.uid).getDocument().data()) ?? [:]
    let name = FirestoreValue.string(profile["displayName"]) ?? FirestoreValue.string(user.displayName) ?? "Usuario"
    let photo = FirestoreValue.string(profile["photoURL"]) ?? user.photoURL?.absoluteString
    return ConnectionsAuthor(uid: user.uid, displayName: name, photoURL: photo)
  }

  /// `null` for an empty or missing value, as the web writes it.
  static func orNull(_ value: String?) -> Any {
    guard let value, !value.isEmpty else { return NSNull() }
    return value
  }

  static func orNull(_ value: Int?) -> Any {
    guard let value else { return NSNull() }
    return value
  }

  /// The document `createCollaboration` writes, exactly the keys `isValidCollaborationCreate` allows.
  static func collaborationPayload(_ draft: CollaborationDraft, author: ConnectionsAuthor) -> [String: Any] {
    let authorSnapshot: [String: Any] = [
      "displayName": author.displayName,
      "photoURL": orNull(author.photoURL),
    ]
    return [
      "title": draft.title,
      "context": draft.context,
      "seekingRole": draft.seekingRole,
      "mode": draft.mode.rawValue,
      "location": orNull(draft.location),
      "level": draft.level.rawValue,
      "topic": orNull(draft.topic),
      "tags": draft.tags,
      "authorId": author.uid,
      "authorSnapshot": authorSnapshot,
      "status": "open",
      "createdAt": FieldValue.serverTimestamp(),
      "updatedAt": FieldValue.serverTimestamp(),
    ]
  }

  func createCollaboration(_ draft: CollaborationDraft, author: ConnectionsAuthor) async throws -> String {
    guard let valid = draft.validated() else { throw ConnectionsRepoError.invalidDraft }
    let ref = try db().collection(FirestoreCollections.collaborations).document()
    try await ref.setData(Self.collaborationPayload(valid, author: author))
    return ref.documentID
  }

  func deleteCollaboration(id: String, authorID: String) async throws {
    let db = try db()
    let pending = try await db.collection(FirestoreCollections.collaborationRequests)
      .whereField("collaborationId", isEqualTo: id)
      .whereField("toUid", isEqualTo: authorID)
      .whereField("status", isEqualTo: "pending")
      .getDocuments()
    let batch = db.batch()
    for doc in pending.documents {
      batch.updateData(["status": "rejected", "updatedAt": FieldValue.serverTimestamp()], forDocument: doc.reference)
    }
    batch.deleteDocument(db.collection(FirestoreCollections.collaborations).document(id))
    try await batch.commit()
  }

  /// The document `sendCollaborationRequest` writes (keys of `isValidCollaborationRequestCreate`).
  static func requestPayload(to collaboration: Collaboration, from author: ConnectionsAuthor, message: String?) -> [String: Any] {
    let trimmedMessage = message?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    return [
      "collaborationId": collaboration.id,
      "collaborationTitle": String(collaboration.title.prefix(140)),
      "fromUid": author.uid,
      "toUid": collaboration.authorID,
      "status": "pending",
      "message": orNull(String(trimmedMessage.prefix(1000))),
      "fromUserName": orNull(String(author.displayName.prefix(80))),
      "fromUserPhoto": orNull(author.photoURL.map { String($0.prefix(600)) }),
      "createdAt": FieldValue.serverTimestamp(),
      "updatedAt": FieldValue.serverTimestamp(),
    ]
  }

  func sendCollaborationRequest(to collaboration: Collaboration, from author: ConnectionsAuthor, message: String?) async throws {
    let db = try db()
    let existing = try await db.collection(FirestoreCollections.collaborationRequests)
      .whereField("fromUid", isEqualTo: author.uid)
      .whereField("collaborationId", isEqualTo: collaboration.id)
      .limit(to: 20)
      .getDocuments()
    let statuses = existing.documents.compactMap { $0.data()["status"] as? String }
    if statuses.contains("pending") { throw ConnectionsRepoError.requestAlreadySent }
    if statuses.contains("accepted") { throw ConnectionsRepoError.requestAlreadyAccepted }

    try await db.collection(FirestoreCollections.collaborationRequests).document()
      .setData(Self.requestPayload(to: collaboration, from: author, message: message))
  }

  // MARK: Encounters

  func fetchUpcomingEncounters(limit: Int) async throws -> [Encounter] {
    let db = try db()
    let pageSize = max(1, min(30, limit))
    let upcoming = try await db.collection(FirestoreCollections.events)
      .whereField("visibility", isEqualTo: "public")
      .whereField("startAt", isGreaterThanOrEqualTo: Timestamp(date: Date()))
      .order(by: "startAt")
      .limit(to: pageSize)
      .getDocuments()
    if !upcoming.isEmpty {
      return upcoming.documents.map { Self.encounter(id: $0.documentID, data: $0.data()) }
    }
    // Like the web: with nothing upcoming, show the latest public ones.
    let recent = try await db.collection(FirestoreCollections.events)
      .whereField("visibility", isEqualTo: "public")
      .order(by: "startAt")
      .limit(toLast: pageSize)
      .getDocuments()
    return recent.documents.map { Self.encounter(id: $0.documentID, data: $0.data()) }
  }

  static func encounter(id: String, data: [String: Any]) -> Encounter {
    Encounter(
      id: id,
      title: FirestoreValue.string(data["title"]) ?? "Encuentro",
      description: FirestoreValue.string(data["description"]),
      startAt: FirestoreValue.date(data["startAt"]),
      city: FirestoreValue.string(data["city"]),
      venue: FirestoreValue.string(data["venue"]),
      capacity: FirestoreValue.int(data["capacity"]),
      attendeesCount: FirestoreValue.int(data["attendeesCount"]),
      createdBy: FirestoreValue.string(data["createdBy"]) ?? "",
      isPublic: (data["visibility"] as? String ?? "public") == "public"
    )
  }

  /// The document `createEvent` writes (keys of `isValidEventCreate`). The app only creates public ones.
  static func encounterPayload(_ draft: EncounterDraft, ownerID: String) -> [String: Any] {
    [
      "title": draft.title,
      "description": orNull(draft.description),
      "startAt": Timestamp(date: draft.startAt),
      "endAt": NSNull(),
      "city": orNull(draft.city),
      "venue": orNull(draft.venue),
      "capacity": orNull(draft.capacity),
      "visibility": "public",
      "createdBy": ownerID,
      "coverUrl": NSNull(),
      "createdAt": FieldValue.serverTimestamp(),
      "updatedAt": FieldValue.serverTimestamp(),
    ]
  }

  func createEncounter(_ draft: EncounterDraft, ownerID: String) async throws -> String {
    guard let valid = draft.validated() else { throw ConnectionsRepoError.invalidDraft }
    let db = try db()
    let ref = db.collection(FirestoreCollections.events).document()
    try await ref.setData(Self.encounterPayload(valid, ownerID: ownerID))
    do {
      try await ref.collection(FirestoreSubcollections.attendees).document(ownerID)
        .setData(["uid": ownerID, "joinedAt": FieldValue.serverTimestamp()])
    } catch {
      try? await ref.delete()
      throw error
    }
    return ref.documentID
  }

  func isAttending(encounterID: String, uid: String) async throws -> Bool {
    try await db().collection(FirestoreCollections.events).document(encounterID)
      .collection(FirestoreSubcollections.attendees).document(uid)
      .getDocument().exists
  }

  func joinEncounter(encounterID: String, uid: String) async throws {
    let eventRef = try db().collection(FirestoreCollections.events).document(encounterID)
    let event = try await eventRef.getDocument()
    guard let data = event.data() else { throw ConnectionsRepoError.encounterNotFound }
    if (data["visibility"] as? String ?? "public") != "public", (data["createdBy"] as? String) != uid {
      throw ConnectionsRepoError.privateEncounter
    }
    let attendeeRef = eventRef.collection(FirestoreSubcollections.attendees).document(uid)
    if try await attendeeRef.getDocument().exists { return }
    try await attendeeRef.setData(["uid": uid, "joinedAt": FieldValue.serverTimestamp()])
  }

  func leaveEncounter(encounterID: String, uid: String) async throws {
    try await db().collection(FirestoreCollections.events).document(encounterID)
      .collection(FirestoreSubcollections.attendees).document(uid)
      .delete()
  }

  func deleteEncounter(encounterID: String) async throws {
    try await db().collection(FirestoreCollections.events).document(encounterID).delete()
  }
}

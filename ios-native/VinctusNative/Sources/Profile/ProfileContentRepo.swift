import FirebaseAuth
import FirebaseCore
import FirebaseFirestore
import Foundation

/// Interest categories, same ids and names as `CATEGORIES` in `src/shared/constants/mockData.ts`.
struct InterestCategory: Identifiable, Hashable {
  let id: String
  let title: String
  let icon: String

  static let all: [InterestCategory] = [
    InterestCategory(id: "science", title: "Ciencia & Materia", icon: "atom"),
    InterestCategory(id: "music", title: "Acústica & Arte", icon: "music.note"),
    InterestCategory(id: "history", title: "Legado & Tiempo", icon: "building.columns"),
    InterestCategory(id: "technology", title: "Código & Futuro", icon: "cpu"),
    InterestCategory(id: "literature", title: "Palabra & Pluma", icon: "book"),
    InterestCategory(id: "nature", title: "Vida & Ecosistema", icon: "leaf"),
  ]

  static func title(for id: String) -> String {
    all.first { $0.id == id }?.title ?? id
  }
}

enum FollowListKind: String, CaseIterable, Identifiable {
  case followers
  case following

  var id: String { rawValue }
  var title: String { self == .followers ? "Seguidores" : "Siguiendo" }
}

struct ProfileUserSummary: Identifiable, Hashable {
  let id: String
  let name: String
  let photoURL: String?
  let username: String?
}

/// Where the next page of a profile list starts. Opaque outside the repo.
struct ProfileListCursor {
  fileprivate let lastDocument: DocumentSnapshot
}

/// One page of a profile list; `next` is nil on the last page.
struct ProfileListPage<Item> {
  let items: [Item]
  let next: ProfileListCursor?
}

struct IncomingFollowRequest: Identifiable, Hashable {
  let id: String
  let from: ProfileUserSummary
}

enum ContributionType: String, CaseIterable, Identifiable {
  case project
  case paper
  case cv
  case certificate
  case other

  var id: String { rawValue }

  /// Labels of `CONTRIBUTION_TYPES` in `src/features/profile/components/ContributionsSection.tsx`.
  var title: String {
    switch self {
    case .project: return "Proyecto"
    case .paper: return "Paper"
    case .cv: return "CV"
    case .certificate: return "Certificación"
    case .other: return "Otro"
    }
  }

  var icon: String {
    switch self {
    case .project: return "hammer"
    case .paper: return "doc.text"
    case .cv: return "person.text.rectangle"
    case .certificate: return "rosette"
    case .other: return "sparkles"
    }
  }
}

struct Contribution: Identifiable, Hashable {
  let id: String
  let type: ContributionType
  let title: String
  let description: String?
  let link: String?
  let fileURL: String?
  let fileName: String?
  let categoryID: String?
  let createdAt: Date
}

struct NewContribution {
  var type: ContributionType = .project
  var title = ""
  var description = ""
  var link = ""
  var categoryID: String?

  /// Trimmed fields that pass `isValidContributionCreate` in firestore.rules (title 1-140,
  /// description up to 2000, link up to 500 and http or https). Empty optional fields become nil.
  func validated() throws -> (title: String, description: String?, link: String?) {
    let title = title.trimmingCharacters(in: .whitespacesAndNewlines)
    let description = description.trimmingCharacters(in: .whitespacesAndNewlines)
    let link = link.trimmingCharacters(in: .whitespacesAndNewlines)
    let scheme = URL(string: link)?.scheme?.lowercased()
    guard
      !title.isEmpty, title.count <= 140, description.count <= 2000, link.count <= 500,
      link.isEmpty || scheme == "http" || scheme == "https"
    else {
      throw ProfileContentRepoError.invalidContribution
    }
    return (title, description.isEmpty ? nil : description, link.isEmpty ? nil : link)
  }
}

struct SavedDebate: Identifiable, Hashable {
  let id: String
  let topic: String
  let personaA: String
  let personaB: String
  let summary: String?
  let winner: String?
  let createdAt: Date?

  /// Persona names of `ARENA_PERSONAS` in `src/features/arena/types.ts`.
  static func personaName(_ id: String) -> String {
    [
      "scientist": "El Científico",
      "philosopher": "El Filósofo",
      "pragmatist": "El Pragmático",
      "skeptic": "El Escéptico",
      "optimist": "El Optimista",
      "devil": "Abogado del Diablo",
    ][id] ?? id
  }
}

/// Everything the profile shows besides the profile document itself, over the same Firestore
/// data as the web profile (`src/features/profile`).
protocol ProfileContentRepo {
  func fetchPosts(uid: String, limit: Int, after cursor: ProfileListCursor?) async throws -> ProfileListPage<FeedItem>
  func fetchFollowList(
    uid: String, kind: FollowListKind, limit: Int, after cursor: ProfileListCursor?
  ) async throws -> ProfileListPage<ProfileUserSummary>
  func fetchIncomingFollowRequests() async throws -> [IncomingFollowRequest]
  /// Whether `fromUID` asked to follow the signed-in user and is waiting for an answer.
  func hasPendingFollowRequest(from fromUID: String) async throws -> Bool
  func answerFollowRequest(from fromUID: String, accept: Bool) async throws
  func fetchContributions(uid: String) async throws -> [Contribution]
  func createContribution(_ contribution: NewContribution) async throws
  func deleteContribution(id: String) async throws
  func fetchFollowedCategories() async throws -> [String]
  func setCategoryFollowed(_ followed: Bool, categoryID: String) async throws
  func fetchSavedDebates() async throws -> [SavedDebate]
  func saveDebate(_ debate: SavedDebate) async throws
  func removeSavedDebate(id: String) async throws
}

enum ProfileContentRepoError: LocalizedError {
  case firebaseNotConfigured
  case userNotAuthenticated
  case invalidContribution

  var errorDescription: String? {
    switch self {
    case .firebaseNotConfigured:
      return "Firebase no está configurado."
    case .userNotAuthenticated:
      return "Debes iniciar sesión."
    case .invalidContribution:
      return "Revisa el título (máximo 140 caracteres) y el enlace."
    }
  }
}

final class FirebaseProfileContentRepo: ProfileContentRepo {
  private var userCache: [String: ProfileUserSummary] = [:]

  private func database() throws -> Firestore {
    guard FirebaseApp.app() != nil else { throw ProfileContentRepoError.firebaseNotConfigured }
    return Firestore.firestore()
  }

  private func context() throws -> (Firestore, String) {
    let db = try database()
    guard let uid = Auth.auth().currentUser?.uid else { throw ProfileContentRepoError.userNotAuthenticated }
    return (db, uid)
  }

  // MARK: Posts

  /// Mirrors `getPostsByUser` in `src/shared/lib/firestore/posts.ts`.
  func fetchPosts(uid: String, limit: Int, after cursor: ProfileListCursor?) async throws -> ProfileListPage<FeedItem> {
    let query = try database().collection("posts")
      .whereField("authorId", isEqualTo: uid)
      .order(by: "createdAt", descending: true)
    let snapshot = try await page(query, limit: limit, after: cursor).getDocuments()
    return ProfileListPage(
      items: snapshot.documents.map(FirebaseFeedRepo.feedItem(from:)),
      next: Self.nextCursor(snapshot, limit: limit)
    )
  }

  // MARK: Follows

  /// Mirrors `getFollowList` in `src/shared/lib/firestore/follows.ts`.
  func fetchFollowList(
    uid: String, kind: FollowListKind, limit: Int, after cursor: ProfileListCursor?
  ) async throws -> ProfileListPage<ProfileUserSummary> {
    let db = try database()
    let query = db.collection("users").document(uid).collection(kind.rawValue)
      .order(by: "createdAt", descending: true)
    let snapshot = try await page(query, limit: limit, after: cursor).getDocuments()
    var users: [ProfileUserSummary] = []
    for document in snapshot.documents {
      users.append(await user(document.documentID, db: db))
    }
    return ProfileListPage(items: users, next: Self.nextCursor(snapshot, limit: limit))
  }

  /// Mirrors `getIncomingFollowRequests` in `src/shared/lib/firestore/follows.ts`.
  func fetchIncomingFollowRequests() async throws -> [IncomingFollowRequest] {
    let (db, uid) = try context()
    let snapshot = try await db.collection("follow_requests")
      .whereField("toUid", isEqualTo: uid)
      .whereField("status", isEqualTo: "pending")
      .order(by: "createdAt", descending: true)
      .limit(to: 50)
      .getDocuments()
    var requests: [IncomingFollowRequest] = []
    for document in snapshot.documents {
      guard let fromUID = document.data()["fromUid"] as? String else { continue }
      requests.append(IncomingFollowRequest(id: document.documentID, from: await user(fromUID, db: db)))
    }
    return requests
  }

  func hasPendingFollowRequest(from fromUID: String) async throws -> Bool {
    let (db, uid) = try context()
    let request = try? await db.collection("follow_requests")
      .document(FirebaseEngagementRepo.requestID(from: fromUID, to: uid)).getDocument()
    return request?.exists == true && request?.data()?["status"] as? String == "pending"
  }

  /// Mirrors `acceptFollowRequest` / `declineFollowRequest`; a Cloud Function adds the follow.
  func answerFollowRequest(from fromUID: String, accept: Bool) async throws {
    let (db, uid) = try context()
    try await db.collection("follow_requests")
      .document(FirebaseEngagementRepo.requestID(from: fromUID, to: uid))
      .updateData([
        "status": accept ? "accepted" : "declined",
        "updatedAt": FieldValue.serverTimestamp(),
      ])
  }

  // MARK: Contributions

  /// Mirrors `getUserContributions` in `src/shared/lib/firestore/contributions.ts`.
  func fetchContributions(uid: String) async throws -> [Contribution] {
    let snapshot = try await database().collection("contributions")
      .whereField("userId", isEqualTo: uid)
      .limit(to: 50)
      .getDocuments()
    return snapshot.documents
      .map { document in
        let data = document.data()
        return Contribution(
          id: document.documentID,
          type: ContributionType(rawValue: data["type"] as? String ?? "") ?? .other,
          title: data["title"] as? String ?? "Sin título",
          description: FirestoreValue.string(data["description"]),
          link: FirestoreValue.string(data["link"]),
          fileURL: FirestoreValue.string(data["fileUrl"]),
          fileName: FirestoreValue.string(data["fileName"]),
          categoryID: FirestoreValue.string(data["categoryId"]),
          createdAt: (data["createdAt"] as? Timestamp)?.dateValue() ?? Date(timeIntervalSince1970: 0)
        )
      }
      .sorted { $0.createdAt > $1.createdAt }
  }

  /// Mirrors `createContribution`; files are uploaded from the web.
  func createContribution(_ contribution: NewContribution) async throws {
    let (db, uid) = try context()
    let (title, description, link) = try contribution.validated()
    try await db.collection("contributions").document().setData([
      "userId": uid,
      "type": contribution.type.rawValue,
      "title": title,
      "description": description ?? NSNull(),
      "categoryId": contribution.categoryID ?? NSNull(),
      "link": link ?? NSNull(),
      "fileUrl": NSNull(),
      "filePath": NSNull(),
      "fileName": NSNull(),
      "fileSize": NSNull(),
      "fileType": NSNull(),
      "createdAt": FieldValue.serverTimestamp(),
      "updatedAt": FieldValue.serverTimestamp(),
    ])
  }

  func deleteContribution(id: String) async throws {
    try await database().collection("contributions").document(id).delete()
  }

  // MARK: Followed categories

  func fetchFollowedCategories() async throws -> [String] {
    let (db, uid) = try context()
    let snapshot = try await db.collection("users").document(uid).collection("followedCategories")
      .getDocuments()
    return snapshot.documents.map(\.documentID)
  }

  /// Mirrors `followCategoryWithSync` / `unfollowCategoryWithSync` in `savedItems.ts`.
  func setCategoryFollowed(_ followed: Bool, categoryID: String) async throws {
    let (db, uid) = try context()
    let ref = db.collection("users").document(uid).collection("followedCategories").document(categoryID)
    if followed {
      try await ref.setData(["categoryId": categoryID, "createdAt": FieldValue.serverTimestamp()])
    } else {
      try await ref.delete()
    }
  }

  // MARK: Saved Arena debates

  /// Mirrors `getSavedArenaDebates` in `src/shared/lib/firestore/savedItems.ts`.
  func fetchSavedDebates() async throws -> [SavedDebate] {
    let (db, uid) = try context()
    let snapshot = try await db.collection("users").document(uid).collection("savedArenaDebates")
      .order(by: "createdAt", descending: true)
      .limit(to: 20)
      .getDocuments()
    return snapshot.documents.map { document in
      let data = document.data()
      return SavedDebate(
        id: document.documentID,
        topic: data["topic"] as? String ?? "Debate",
        personaA: data["personaA"] as? String ?? "",
        personaB: data["personaB"] as? String ?? "",
        summary: FirestoreValue.string(data["summary"]),
        winner: FirestoreValue.string(data["verdictWinner"]),
        createdAt: (data["createdAt"] as? Timestamp)?.dateValue()
      )
    }
  }

  /// Mirrors `saveArenaDebateWithSync`.
  func saveDebate(_ debate: SavedDebate) async throws {
    let (db, uid) = try context()
    let winner = debate.winner.flatMap { ["A", "B", "draw"].contains($0) ? $0 : nil }
    try await db.collection("users").document(uid).collection("savedArenaDebates").document(debate.id)
      .setData([
        "debateId": debate.id,
        "topic": String(debate.topic.prefix(240)),
        "personaA": debate.personaA,
        "personaB": debate.personaB,
        "summary": debate.summary.map { String($0.prefix(3000)) } ?? NSNull(),
        "verdictWinner": winner ?? NSNull(),
        "createdAt": FieldValue.serverTimestamp(),
      ])
  }

  func removeSavedDebate(id: String) async throws {
    let (db, uid) = try context()
    try await db.collection("users").document(uid).collection("savedArenaDebates").document(id).delete()
  }

  // MARK: Helpers

  private func page(_ query: Query, limit: Int, after cursor: ProfileListCursor?) -> Query {
    let limited = query.limit(to: limit)
    guard let cursor else { return limited }
    return limited.start(afterDocument: cursor.lastDocument)
  }

  /// A full page may have more after it; a short one is the last.
  private static func nextCursor(_ snapshot: QuerySnapshot, limit: Int) -> ProfileListCursor? {
    guard snapshot.documents.count == limit, let last = snapshot.documents.last else { return nil }
    return ProfileListCursor(lastDocument: last)
  }

  private func user(_ uid: String, db: Firestore) async -> ProfileUserSummary {
    if let cached = userCache[uid] { return cached }
    let data = (try? await db.collection("users_public").document(uid).getDocument().data()) ?? [:]
    let summary = ProfileUserSummary(
      id: uid,
      name: FirestoreValue.string(data["displayName"]) ?? FirestoreValue.string(data["username"]) ?? "Usuario",
      photoURL: FirestoreValue.string(data["photoURL"]),
      username: FirestoreValue.string(data["username"])
    )
    userCache[uid] = summary
    return summary
  }
}

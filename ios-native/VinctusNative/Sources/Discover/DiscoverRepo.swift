import FirebaseCore
import FirebaseFirestore
import Foundation

struct DiscoverUser: Identifiable, Hashable {
  let uid: String
  let displayName: String
  let photoURL: String?
  let accountVisibility: ProfileAccountVisibility

  var id: String { uid }
}

struct DiscoverSubgroup: Identifiable, Hashable {
  let id: String
  let name: String
  let apiQuery: String
}

/// Interest categories aligned with `CATEGORIES` in `src/shared/constants/mockData.ts`.
struct DiscoverCategory: Identifiable, Hashable {
  let id: String
  let title: String
  let subtitle: String
  let icon: String
  let apiSource: String
  let subgroups: [DiscoverSubgroup]

  var defaultQuery: String { subgroups.first?.apiQuery ?? id }

  static let all: [DiscoverCategory] = [
    DiscoverCategory(
      id: "science",
      title: "Ciencia & Materia",
      subtitle: "La búsqueda de la verdad fundamental.",
      icon: "atom",
      apiSource: "arxiv",
      subgroups: [
        DiscoverSubgroup(id: "quantum", name: "Mecánica Cuántica", apiQuery: "quant-ph"),
        DiscoverSubgroup(id: "cosmology", name: "Cosmología", apiQuery: "astro-ph.CO"),
        DiscoverSubgroup(id: "physics", name: "Física General", apiQuery: "physics.gen-ph"),
      ]
    ),
    DiscoverCategory(
      id: "music",
      title: "Acústica & Arte",
      subtitle: "Frecuencias que definen la experiencia humana.",
      icon: "music.note",
      apiSource: "lastfm",
      subgroups: [
        DiscoverSubgroup(id: "salsa", name: "Ritmos Afro-Caribeños", apiQuery: "salsa"),
        DiscoverSubgroup(id: "jazz", name: "Jazz Modal", apiQuery: "jazz"),
        DiscoverSubgroup(id: "classical", name: "Composición Barroca", apiQuery: "classical"),
      ]
    ),
    DiscoverCategory(
      id: "history",
      title: "Legado & Tiempo",
      subtitle: "Ecos de civilizaciones pasadas.",
      icon: "building.columns",
      apiSource: "wikipedia",
      subgroups: [
        DiscoverSubgroup(id: "rome", name: "Antigüedad Clásica", apiQuery: "Ancient_Rome"),
        DiscoverSubgroup(id: "medieval", name: "Edad Media", apiQuery: "Middle_Ages"),
        DiscoverSubgroup(id: "modern", name: "Historia Moderna", apiQuery: "Modern_history"),
      ]
    ),
    DiscoverCategory(
      id: "technology",
      title: "Código & Futuro",
      subtitle: "Donde la lógica construye el mañana.",
      icon: "cpu",
      apiSource: "hackernews",
      subgroups: [
        DiscoverSubgroup(id: "ai", name: "Inteligencia Artificial", apiQuery: "top"),
        DiscoverSubgroup(id: "webdev", name: "Desarrollo Web", apiQuery: "new"),
        DiscoverSubgroup(id: "startups", name: "Startups & Tech", apiQuery: "best"),
      ]
    ),
    DiscoverCategory(
      id: "literature",
      title: "Palabra & Pluma",
      subtitle: "El universo contenido en páginas.",
      icon: "book",
      apiSource: "openlibrary",
      subgroups: [
        DiscoverSubgroup(id: "fiction", name: "Ficción Literaria", apiQuery: "fiction"),
        DiscoverSubgroup(id: "poetry", name: "Poesía", apiQuery: "poetry"),
        DiscoverSubgroup(id: "philosophy", name: "Filosofía", apiQuery: "philosophy"),
      ]
    ),
    DiscoverCategory(
      id: "nature",
      title: "Vida & Ecosistema",
      subtitle: "La red infinita de lo viviente.",
      icon: "leaf",
      apiSource: "inaturalist",
      subgroups: [
        DiscoverSubgroup(id: "plants", name: "Botánica", apiQuery: "plants"),
        DiscoverSubgroup(id: "birds", name: "Ornitología", apiQuery: "birds"),
        DiscoverSubgroup(id: "insects", name: "Entomología", apiQuery: "insects"),
      ]
    ),
  ]

  static func normalizedSearch(_ value: String) -> String {
    value
      .trimmingCharacters(in: .whitespacesAndNewlines)
      .folding(options: [.diacriticInsensitive, .caseInsensitive], locale: .current)
  }

  func matches(query: String) -> Bool {
    let needle = Self.normalizedSearch(query)
    guard !needle.isEmpty else { return true }
    if Self.normalizedSearch(id).contains(needle)
      || Self.normalizedSearch(title).contains(needle)
      || Self.normalizedSearch(subtitle).contains(needle)
    {
      return true
    }
    return subgroups.contains { Self.normalizedSearch($0.name).contains(needle) }
  }
}

struct DiscoverLiveItem: Identifiable, Hashable {
  let id: String
  let badge: String
  let title: String
  let subtitle: String
  let meta: String
  let linkURL: URL?
  let imageURL: URL?
}

struct DiscoverLibraryItem: Identifiable, Hashable {
  let id: String
  let userID: String
  let type: ContributionType
  let title: String
  let description: String?
  let authorName: String
  let linkURL: URL?
  let fileURL: URL?
  let fileName: String?
  let createdAt: Date
}

protocol DiscoverRepo {
  func fetchRecentUsers(limit: Int, excluding uid: String?) async throws -> [DiscoverUser]
  func searchUsers(prefix: String, limit: Int, excluding uid: String?) async throws -> [DiscoverUser]
  func fetchLiveContent(source: String, query: String, limit: Int) async throws -> [DiscoverLiveItem]
  func fetchCategoryGroups(categoryID: String, limit: Int) async throws -> [GroupSummary]
  func fetchCategoryLibrary(categoryID: String, limit: Int) async throws -> [DiscoverLibraryItem]
}

extension DiscoverRepo {
  func fetchLiveContent(source: String, query: String, limit: Int) async throws -> [DiscoverLiveItem] { [] }
  func fetchCategoryGroups(categoryID: String, limit: Int) async throws -> [GroupSummary] { [] }
  func fetchCategoryLibrary(categoryID: String, limit: Int) async throws -> [DiscoverLibraryItem] { [] }
}

enum DiscoverRepoError: LocalizedError {
  case firebaseNotConfigured
  case missingSnapshot
  case invalidLiveResponse

  var errorDescription: String? {
    switch self {
    case .firebaseNotConfigured:
      return "Firebase no está configurado."
    case .missingSnapshot:
      return "No se pudieron cargar usuarios."
    case .invalidLiveResponse:
      return "No se pudo cargar contenido en vivo en este momento."
    }
  }
}

final class FirebaseDiscoverRepo: DiscoverRepo {
  private let db: Firestore?
  private let session: URLSession

  init(db: Firestore? = nil, session: URLSession = .shared) {
    self.db = db
    self.session = session
  }

  func fetchRecentUsers(limit: Int, excluding uid: String?) async throws -> [DiscoverUser] {
    guard FirebaseApp.app() != nil else { throw DiscoverRepoError.firebaseNotConfigured }

    let db = self.db ?? Firestore.firestore()
    let pageSize = max(1, min(30, limit))

    let query = db.collection(FirestoreCollections.usersPublic)
      .order(by: "updatedAt", descending: true)
      .limit(to: pageSize + 1)

    do {
      let snapshot = try await query.getDocuments()
      return mapUsers(from: snapshot, excluding: uid, limit: pageSize)
    } catch {
      guard !FirestoreValue.isPermissionDenied(error) else { throw error }
      let snapshot = try await query.getDocuments(source: .cache)
      return mapUsers(from: snapshot, excluding: uid, limit: pageSize)
    }
  }

  func searchUsers(prefix: String, limit: Int, excluding uid: String?) async throws -> [DiscoverUser] {
    guard FirebaseApp.app() != nil else { throw DiscoverRepoError.firebaseNotConfigured }

    let normalized = prefix.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    guard !normalized.isEmpty else { return [] }

    let db = self.db ?? Firestore.firestore()
    let pageSize = max(1, min(30, limit))

    let query = db.collection(FirestoreCollections.usersPublic)
      .order(by: "displayNameLowercase")
      .start(at: [normalized])
      .end(at: ["\(normalized)\u{f8ff}"])
      .limit(to: pageSize + 1)

    do {
      let snapshot = try await query.getDocuments()
      return mapUsers(from: snapshot, excluding: uid, limit: pageSize)
    } catch {
      guard !FirestoreValue.isPermissionDenied(error) else { throw error }
      let snapshot = try await query.getDocuments(source: .cache)
      return mapUsers(from: snapshot, excluding: uid, limit: pageSize)
    }
  }

  func fetchLiveContent(source: String, query: String, limit: Int = 8) async throws -> [DiscoverLiveItem] {
    let clampedLimit = max(1, min(20, limit))
    var components = URLComponents(
      url: LegalConfig.apiBaseURL.appendingPathComponent("api/discover"),
      resolvingAgainstBaseURL: false
    )
    components?.queryItems = [
      URLQueryItem(name: "source", value: source),
      URLQueryItem(name: "query", value: query),
      URLQueryItem(name: "limit", value: String(clampedLimit)),
    ]
    guard let url = components?.url else { throw DiscoverRepoError.invalidLiveResponse }

    var request = URLRequest(url: url)
    request.timeoutInterval = 12
    request.setValue("application/json", forHTTPHeaderField: "Accept")

    let (data, response) = try await session.data(for: request)
    guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
      throw DiscoverRepoError.invalidLiveResponse
    }
    return try Self.decodeLiveItems(from: data, source: source)
  }

  func fetchCategoryGroups(categoryID: String, limit: Int = 50) async throws -> [GroupSummary] {
    guard FirebaseApp.app() != nil else { throw DiscoverRepoError.firebaseNotConfigured }

    let db = self.db ?? Firestore.firestore()
    let pageSize = max(1, min(50, limit))
    let query = db.collection(FirestoreCollections.groups)
      .whereField("categoryId", isEqualTo: categoryID)
      .limit(to: pageSize)

    let snapshot: QuerySnapshot
    do {
      snapshot = try await query.getDocuments()
    } catch {
      guard !FirestoreValue.isPermissionDenied(error) else { throw error }
      snapshot = try await query.getDocuments(source: .cache)
    }

    return snapshot.documents.map { doc in
      let data = doc.data()
      let visibility = (data["visibility"] as? String) == ProfileAccountVisibility.private.rawValue
        ? ProfileAccountVisibility.private
        : ProfileAccountVisibility.public
      return GroupSummary(
        id: doc.documentID,
        name: FirestoreValue.string(data["name"]) ?? "Grupo",
        description: FirestoreValue.string(data["description"]) ?? "",
        categoryID: FirestoreValue.string(data["categoryId"]),
        ownerID: FirestoreValue.string(data["ownerId"]),
        visibility: visibility,
        iconURL: FirestoreValue.string(data["iconUrl"]),
        memberCount: max(0, FirestoreValue.int(data["memberCount"]) ?? 0),
        updatedAt: FirestoreValue.date(data["updatedAt"])
          ?? FirestoreValue.date(data["createdAt"])
          ?? Date(timeIntervalSince1970: 0)
      )
    }
    .sorted { lhs, rhs in
      if lhs.memberCount != rhs.memberCount { return lhs.memberCount > rhs.memberCount }
      return lhs.updatedAt > rhs.updatedAt
    }
  }

  func fetchCategoryLibrary(categoryID: String, limit: Int = 16) async throws -> [DiscoverLibraryItem] {
    guard FirebaseApp.app() != nil else { throw DiscoverRepoError.firebaseNotConfigured }

    let db = self.db ?? Firestore.firestore()
    let pageSize = max(1, min(30, limit))
    let snapshot = try await db.collection(FirestoreCollections.contributions)
      .whereField("categoryId", isEqualTo: categoryID)
      .order(by: "createdAt", descending: true)
      .limit(to: pageSize)
      .getDocuments()

    let docs = snapshot.documents
    let authorIDs = Set(docs.compactMap { FirestoreValue.string($0.data()["userId"]) })
    var authorNames: [String: String] = [:]
    for uid in authorIDs {
      if let profileDoc = try? await db.collection(FirestoreCollections.usersPublic).document(uid).getDocument(),
         let data = profileDoc.data() {
        authorNames[uid] = FirestoreValue.string(data["displayName"])
          ?? FirestoreValue.string(data["username"])
          ?? "Usuario"
      }
    }

    return docs.compactMap { doc in
      let data = doc.data()
      guard let userID = FirestoreValue.string(data["userId"]) else { return nil }
      let type = ContributionType(rawValue: data["type"] as? String ?? "") ?? .other
      return DiscoverLibraryItem(
        id: doc.documentID,
        userID: userID,
        type: type,
        title: FirestoreValue.string(data["title"]) ?? "Sin título",
        description: FirestoreValue.string(data["description"]),
        authorName: authorNames[userID] ?? "Usuario",
        linkURL: Self.safeHTTPURL(FirestoreValue.string(data["link"])),
        fileURL: Self.safeHTTPURL(FirestoreValue.string(data["fileUrl"])),
        fileName: FirestoreValue.string(data["fileName"]),
        createdAt: FirestoreValue.date(data["createdAt"]) ?? Date(timeIntervalSince1970: 0)
      )
    }
  }

  static func safeHTTPURL(_ raw: String?) -> URL? {
    guard let raw = raw?.trimmingCharacters(in: .whitespacesAndNewlines), !raw.isEmpty,
          let url = URL(string: raw),
          let scheme = url.scheme?.lowercased(),
          scheme == "http" || scheme == "https"
    else { return nil }
    return url
  }

  /// Parses `/api/discover` responses across all 6 upstream sources.
  static func decodeLiveItems(from data: Data, source: String) throws -> [DiscoverLiveItem] {
    guard let root = try JSONSerialization.jsonObject(with: data) as? [String: Any],
          let rows = root["data"] as? [[String: Any]]
    else {
      throw DiscoverRepoError.invalidLiveResponse
    }

    return rows.enumerated().compactMap { index, row in
      let rawID: String = {
        if let stringID = row["id"] as? String, !stringID.isEmpty { return stringID }
        if let numberID = row["id"] as? NSNumber { return numberID.stringValue }
        return "\(source)-\(index)"
      }()
      let badge = FirestoreValue.string(row["type"]) ?? "En vivo"

      switch source {
      case "arxiv":
        let title = FirestoreValue.string(row["title"]) ?? "Sin título"
        let authors = FirestoreValue.string(row["authors"]) ?? "Anónimo"
        let summary = FirestoreValue.string(row["summary"]) ?? ""
        let published = FirestoreValue.string(row["published"]) ?? "arXiv"
        return DiscoverLiveItem(
          id: rawID, badge: badge, title: title,
          subtitle: summary.isEmpty ? authors : summary,
          meta: "\(authors) · \(published)",
          linkURL: safeHTTPURL(FirestoreValue.string(row["link"])),
          imageURL: nil
        )
      case "wikipedia":
        let title = FirestoreValue.string(row["title"]) ?? "Sin título"
        let summary = FirestoreValue.string(row["summary"]) ?? ""
        return DiscoverLiveItem(
          id: rawID, badge: badge, title: title,
          subtitle: summary,
          meta: "Wikipedia",
          linkURL: safeHTTPURL(FirestoreValue.string(row["link"])),
          imageURL: safeHTTPURL(FirestoreValue.string(row["thumbnail"]))
        )
      case "hackernews":
        let title = FirestoreValue.string(row["title"]) ?? "Sin título"
        let score = FirestoreValue.int(row["score"]) ?? 0
        let comments = FirestoreValue.int(row["comments"]) ?? 0
        let time = FirestoreValue.string(row["time"]) ?? "Hacker News"
        return DiscoverLiveItem(
          id: rawID, badge: badge, title: title,
          subtitle: "\(score) puntos · \(comments) comentarios",
          meta: time,
          linkURL: safeHTTPURL(FirestoreValue.string(row["url"])),
          imageURL: nil
        )
      case "openlibrary":
        let title = FirestoreValue.string(row["title"]) ?? "Sin título"
        let authors = FirestoreValue.string(row["authors"]) ?? "Anónimo"
        let firstPublished = FirestoreValue.string(row["firstPublished"])
          ?? FirestoreValue.int(row["firstPublished"]).map(String.init)
          ?? ""
        return DiscoverLiveItem(
          id: rawID, badge: badge, title: title,
          subtitle: authors,
          meta: firstPublished.isEmpty ? "Open Library" : firstPublished,
          linkURL: safeHTTPURL(FirestoreValue.string(row["link"])),
          imageURL: safeHTTPURL(FirestoreValue.string(row["cover"]))
        )
      case "inaturalist":
        let species = FirestoreValue.string(row["species"]) ?? "Especie desconocida"
        let scientific = FirestoreValue.string(row["scientificName"]) ?? ""
        let location = FirestoreValue.string(row["location"]) ?? "Ubicación desconocida"
        let observer = FirestoreValue.string(row["observer"]) ?? "iNaturalist"
        return DiscoverLiveItem(
          id: rawID, badge: badge, title: species,
          subtitle: scientific.isEmpty ? location : "\(scientific) · \(location)",
          meta: observer,
          linkURL: safeHTTPURL(FirestoreValue.string(row["link"])),
          imageURL: safeHTTPURL(FirestoreValue.string(row["photo"]))
        )
      case "lastfm":
        let title = FirestoreValue.string(row["title"]) ?? "Sin título"
        let artist = FirestoreValue.string(row["artist"]) ?? "Desconocido"
        return DiscoverLiveItem(
          id: rawID, badge: badge, title: title,
          subtitle: artist,
          meta: "Música en vivo",
          linkURL: safeHTTPURL(FirestoreValue.string(row["link"])),
          imageURL: nil
        )
      default:
        let title = FirestoreValue.string(row["title"]) ?? "Sin título"
        return DiscoverLiveItem(
          id: rawID, badge: badge, title: title,
          subtitle: FirestoreValue.string(row["summary"]) ?? "",
          meta: source,
          linkURL: safeHTTPURL(FirestoreValue.string(row["link"]) ?? FirestoreValue.string(row["url"])),
          imageURL: nil
        )
      }
    }
  }

  private func mapUsers(
    from snapshot: QuerySnapshot,
    excluding uid: String?,
    limit: Int
  ) -> [DiscoverUser] {
    let excludedUID = uid?.trimmingCharacters(in: .whitespacesAndNewlines)
    let users = snapshot.documents.compactMap { doc -> DiscoverUser? in
      if let excludedUID, doc.documentID == excludedUID { return nil }

      let data = doc.data()
      let displayName = FirestoreValue.string(data["displayName"])
        ?? FirestoreValue.string(data["username"])
        ?? "Usuario"

      let accountVisibility = (data["accountVisibility"] as? String) == ProfileAccountVisibility.private.rawValue
        ? ProfileAccountVisibility.private
        : ProfileAccountVisibility.public

      return DiscoverUser(
        uid: doc.documentID,
        displayName: displayName,
        photoURL: FirestoreValue.string(data["photoURL"]),
        accountVisibility: accountVisibility
      )
    }

    return Array(users.prefix(limit))
  }
}

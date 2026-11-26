import FirebaseCore
import FirebaseFirestore
import Foundation

/// A public Arena debate as Discover lists it (`getPublicArenaDebates` on the web).
struct PublicDebate: Identifiable, Hashable {
  let id: String
  let topic: String
  let personaA: String
  let personaB: String
  let summary: String?
  let winner: String?
  let status: String
  let sourceCount: Int
  let likesCount: Int
  /// Hosts of the cited sources, at most two (e.g. "iaea.org").
  let sourceHosts: [String]
  let createdAt: Date?

  init(
    id: String,
    topic: String,
    personaA: String,
    personaB: String,
    summary: String?,
    winner: String?,
    status: String,
    sourceCount: Int,
    likesCount: Int,
    sourceHosts: [String],
    createdAt: Date?
  ) {
    self.id = id
    self.topic = topic
    self.personaA = personaA
    self.personaB = personaB
    self.summary = summary
    self.winner = winner
    self.status = status
    self.sourceCount = sourceCount
    self.likesCount = likesCount
    self.sourceHosts = sourceHosts
    self.createdAt = createdAt
  }

  /// Reads an `arenaDebates` document; nil when it has no topic.
  init?(id: String, data: [String: Any]) {
    guard let topic = FirestoreValue.string(data["topic"]) else { return nil }
    let links = (data["sourceLinks"] as? [Any] ?? []).compactMap { $0 as? String }
    var hosts: [String] = []
    for link in links {
      guard let url = URL(string: link), ["http", "https"].contains(url.scheme?.lowercased() ?? ""),
        var host = url.host?.lowercased()
      else { continue }
      if host.hasPrefix("www.") { host.removeFirst(4) }
      if !hosts.contains(host) { hosts.append(host) }
      if hosts.count == 2 { break }
    }
    self.init(
      id: id,
      topic: topic,
      personaA: FirestoreValue.string(data["personaA"]) ?? "",
      personaB: FirestoreValue.string(data["personaB"]) ?? "",
      summary: FirestoreValue.string(data["summary"]),
      winner: FirestoreValue.string((data["verdict"] as? [String: Any])?["winner"]),
      status: FirestoreValue.string(data["status"]) ?? "",
      sourceCount: max(0, FirestoreValue.int(data["sourceCount"]) ?? FirestoreValue.int(data["linkCount"]) ?? 0),
      likesCount: max(0, FirestoreValue.int(data["likesCount"]) ?? 0),
      sourceHosts: hosts,
      createdAt: FirestoreValue.date(data["createdAt"])
    )
  }

  /// The same debate for `SavedDebateView`, which shows its turns.
  var asSavedDebate: SavedDebate {
    SavedDebate(
      id: id, topic: topic, personaA: personaA, personaB: personaB,
      summary: summary, winner: winner, createdAt: createdAt
    )
  }

  /// Finished debates that cite sources, the best sourced and most liked first (`curateDebates`
  /// in `src/features/discover/model/discoverCatalog.ts`).
  static func curated(_ debates: [PublicDebate], limit: Int = 4) -> [PublicDebate] {
    let score = { (debate: PublicDebate) in debate.sourceCount * 3 + debate.likesCount * 2 }
    let finished = debates.filter { $0.status == "done" && $0.sourceCount > 0 }
    let ordered = finished.sorted { lhs, rhs in
      if score(lhs) != score(rhs) { return score(lhs) > score(rhs) }
      if lhs.sourceCount != rhs.sourceCount { return lhs.sourceCount > rhs.sourceCount }
      if lhs.likesCount != rhs.likesCount { return lhs.likesCount > rhs.likesCount }
      return (lhs.createdAt ?? .distantPast) > (rhs.createdAt ?? .distantPast)
    }
    return Array(ordered.prefix(limit))
  }
}

protocol PublicDebatesRepo {
  func fetchPublicDebates(limit: Int) async throws -> [PublicDebate]
}

final class FirebasePublicDebatesRepo: PublicDebatesRepo {
  /// Same query as the web; Discover picks the best ones on the client (`curated`).
  func fetchPublicDebates(limit: Int = 80) async throws -> [PublicDebate] {
    guard FirebaseApp.app() != nil else { throw AIRepoError.firebaseNotConfigured }
    let snapshot = try await Firestore.firestore()
      .collection(FirestoreCollections.arenaDebates)
      .whereField("visibility", isEqualTo: "public")
      .limit(to: max(1, min(80, limit)))
      .getDocuments()
    return snapshot.documents.compactMap { PublicDebate(id: $0.documentID, data: $0.data()) }
  }
}

#if SCREENSHOTS
// Screenshot builds only (see App/DemoData.swift).
struct SamplePublicDebatesRepo: PublicDebatesRepo {
  func fetchPublicDebates(limit: Int) async throws -> [PublicDebate] {
    [
      PublicDebate(
        id: "demo-debate-1",
        topic: "¿La energía nuclear es clave para la transición energética?",
        personaA: "scientist",
        personaB: "skeptic",
        summary: "Ambas posturas analizaron costos, seguridad y densidad energética.",
        winner: "A",
        status: "done",
        sourceCount: 4,
        likesCount: 3,
        sourceHosts: ["iaea.org", "iea.org"],
        createdAt: Date().addingTimeInterval(-86_400)
      ),
      PublicDebate(
        id: "demo-debate-2",
        topic: "¿La IA va a reemplazar el trabajo creativo humano?",
        personaA: "pragmatist",
        personaB: "philosopher",
        summary: "Datos de contratación frente a la pregunta por la autoría.",
        winner: "draw",
        status: "done",
        sourceCount: 2,
        likesCount: 1,
        sourceHosts: ["oecd.org"],
        createdAt: Date().addingTimeInterval(-3 * 86_400)
      ),
    ]
  }
}
#endif

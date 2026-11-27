import Foundation

// Screenshot builds only (see App/DemoData.swift).

#if SCREENSHOTS
struct SampleConnectionsRepo: ConnectionsRepo {
  private static let day: TimeInterval = 24 * 60 * 60

  func fetchCollaborations(limit: Int) async throws -> [Collaboration] {
    [
      Collaboration(
        id: "c1", title: "Cuarteto de jazz para los viernes", context: "Proyecto de jazz",
        seekingRole: "Bajista", mode: .presencial, location: "Lima", level: .intermedio,
        topic: "Standards en un café de Barranco",
        tags: ["jazz", "contrabajo"], authorID: "u2", authorName: "Mateo Rojas", authorPhotoURL: nil,
        createdAt: Date().addingTimeInterval(-3 * Self.day)
      ),
      Collaboration(
        id: "c2", title: "Podcast de divulgación científica", context: "Ciencia",
        seekingRole: "Editor de audio", mode: .virtual, location: nil, level: .principiante,
        topic: "Un episodio al mes sobre física moderna",
        tags: ["podcast", "audio"], authorID: AppRepos.demoUserID, authorName: "Lucía Fernández", authorPhotoURL: nil,
        createdAt: Date().addingTimeInterval(-6 * Self.day)
      ),
      Collaboration(
        id: "c3", title: "Robot seguidor de línea", context: "Hardware",
        seekingRole: "Programador de Arduino", mode: .presencial, location: "Miraflores", level: .experto,
        topic: "Para la feria de ciencias de diciembre",
        tags: ["arduino", "robótica"], authorID: "u4", authorName: "Diego Salazar", authorPhotoURL: nil,
        createdAt: Date().addingTimeInterval(-10 * Self.day)
      ),
    ].prefix(limit).map { $0 }
  }

  func fetchRequestedCollaborationIDs(uid: String) async throws -> Set<String> { ["c3"] }

  func currentAuthor() async throws -> ConnectionsAuthor {
    ConnectionsAuthor(uid: AppRepos.demoUserID, displayName: "Lucía Fernández", photoURL: nil)
  }

  func createCollaboration(_ draft: CollaborationDraft, author: ConnectionsAuthor) async throws -> String { "new" }
  func deleteCollaboration(id: String, authorID: String) async throws {}
  func sendCollaborationRequest(to collaboration: Collaboration, from author: ConnectionsAuthor, message: String?) async throws {}

  func fetchUpcomingEncounters(limit: Int) async throws -> [Encounter] {
    [
      Encounter(
        id: "e1", title: "Noche de observación astronómica", description: "Llevamos telescopios; trae abrigo.",
        startAt: Date().addingTimeInterval(4 * Self.day), city: "Lima", venue: "Parque del Amor",
        capacity: 30, attendeesCount: 18, createdBy: "u3", isPublic: true
      ),
      Encounter(
        id: "e2", title: "Club de lectura: Borges", description: nil,
        startAt: Date().addingTimeInterval(9 * Self.day), city: "Lima", venue: "Barranco",
        capacity: nil, attendeesCount: 7, createdBy: "u5", isPublic: true
      ),
      Encounter(
        id: "e3", title: "Taller de impresión 3D", description: nil,
        startAt: Date().addingTimeInterval(15 * Self.day), city: "Arequipa", venue: nil,
        capacity: 12, attendeesCount: 12, createdBy: "u4", isPublic: true
      ),
    ].prefix(limit).map { $0 }
  }

  func createEncounter(_ draft: EncounterDraft, ownerID: String) async throws -> String { "new" }
  func isAttending(encounterID: String, uid: String) async throws -> Bool { encounterID == "e2" }
  func joinEncounter(encounterID: String, uid: String) async throws {}
  func leaveEncounter(encounterID: String, uid: String) async throws {}
  func deleteEncounter(encounterID: String) async throws {}
}
#endif

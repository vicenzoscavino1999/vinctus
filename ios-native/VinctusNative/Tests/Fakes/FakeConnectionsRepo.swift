import Foundation
@testable import VinctusNative

final class FakeConnectionsRepo: ConnectionsRepo {
  var collaborations: [Collaboration] = []
  var encounters: [Encounter] = []
  var requestedIDs: Set<String> = []
  var attending: Set<String> = []
  var failsToList = false
  var failsToWrite = false
  var duplicateRequestError: ConnectionsRepoError?

  private(set) var createdCollaborations: [CollaborationDraft] = []
  private(set) var createdEncounters: [EncounterDraft] = []
  private(set) var sentRequests: [(collaborationID: String, message: String?)] = []
  private(set) var deletedCollaborations: [String] = []
  private(set) var joinCalls = 0
  private(set) var leaveCalls = 0

  func fetchCollaborations(limit: Int) async throws -> [Collaboration] {
    if failsToList { throw FakeError() }
    return Array(collaborations.prefix(limit))
  }

  func fetchRequestedCollaborationIDs(uid: String) async throws -> Set<String> { requestedIDs }

  func currentAuthor() async throws -> ConnectionsAuthor {
    ConnectionsAuthor(uid: "me", displayName: "Yo", photoURL: nil)
  }

  func createCollaboration(_ draft: CollaborationDraft, author: ConnectionsAuthor) async throws -> String {
    if failsToWrite { throw FakeError() }
    createdCollaborations.append(draft)
    collaborations.insert(Self.collaboration(id: "new\(createdCollaborations.count)", authorID: author.uid, title: draft.title), at: 0)
    return "new\(createdCollaborations.count)"
  }

  func deleteCollaboration(id: String, authorID: String) async throws {
    if failsToWrite { throw FakeError() }
    deletedCollaborations.append(id)
    collaborations.removeAll { $0.id == id }
  }

  func sendCollaborationRequest(to collaboration: Collaboration, from author: ConnectionsAuthor, message: String?) async throws {
    if let duplicateRequestError { throw duplicateRequestError }
    if failsToWrite { throw FakeError() }
    sentRequests.append((collaboration.id, message))
  }

  func fetchUpcomingEncounters(limit: Int) async throws -> [Encounter] {
    if failsToList { throw FakeError() }
    return Array(encounters.prefix(limit))
  }

  func createEncounter(_ draft: EncounterDraft, ownerID: String) async throws -> String {
    if failsToWrite { throw FakeError() }
    createdEncounters.append(draft)
    return "event\(createdEncounters.count)"
  }

  func isAttending(encounterID: String, uid: String) async throws -> Bool { attending.contains(encounterID) }

  func joinEncounter(encounterID: String, uid: String) async throws {
    joinCalls += 1
    if failsToWrite { throw FakeError() }
    attending.insert(encounterID)
  }

  func leaveEncounter(encounterID: String, uid: String) async throws {
    leaveCalls += 1
    if failsToWrite { throw FakeError() }
    attending.remove(encounterID)
  }

  func deleteEncounter(encounterID: String) async throws {
    if failsToWrite { throw FakeError() }
    encounters.removeAll { $0.id == encounterID }
  }

  static func collaboration(id: String, authorID: String, title: String = "Proyecto") -> Collaboration {
    Collaboration(
      id: id, title: title, context: "Contexto", seekingRole: "Bajista", mode: .virtual, location: nil,
      level: .intermedio, topic: nil, tags: [], authorID: authorID, authorName: "Autor", authorPhotoURL: nil,
      createdAt: Date()
    )
  }

  static func encounter(id: String, createdBy: String = "u2", capacity: Int? = nil, attendees: Int? = 0) -> Encounter {
    Encounter(
      id: id, title: "Encuentro", description: nil, startAt: Date().addingTimeInterval(86_400), city: "Lima",
      venue: nil, capacity: capacity, attendeesCount: attendees, createdBy: createdBy, isPublic: true
    )
  }
}

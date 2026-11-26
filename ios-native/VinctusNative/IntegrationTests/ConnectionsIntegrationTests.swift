import XCTest
@testable import VinctusNative

/// Conexiones against the emulators: the writes of `FirebaseConnectionsRepo` must pass the same
/// `firestore.rules` the web's collaborations and events writes pass.
final class ConnectionsIntegrationTests: EmulatorTestCase {
  func testCollaborationLifecycleFollowsTheRules() async throws {
    let repo = FirebaseConnectionsRepo()
    let owner = try await makeUser("Ana Autora")

    var draft = CollaborationDraft()
    draft.title = "Banda de jazz"
    draft.context = "Ensayos los viernes"
    draft.seekingRole = "Bajista"
    draft.mode = .presencial
    draft.location = "Lima"
    draft.tagsText = "jazz, bajo"
    let author = try await repo.currentAuthor()
    XCTAssertEqual(author.uid, owner.uid)
    let collaborationID = try await repo.createCollaboration(draft, author: author)

    let collaborator = try await makeUser("Bruno Bajista")
    let listed = try await repo.fetchCollaborations(limit: 50)
    let collaboration = try XCTUnwrap(listed.first { $0.id == collaborationID })
    XCTAssertEqual(collaboration.authorID, owner.uid)
    XCTAssertEqual(collaboration.tags, ["jazz", "bajo"])

    let requester = try await repo.currentAuthor()
    try await repo.sendCollaborationRequest(to: collaboration, from: requester, message: "Toco hace diez años")
    let requestedIDs = try await repo.fetchRequestedCollaborationIDs(uid: collaborator.uid)
    XCTAssertTrue(requestedIDs.contains(collaborationID))

    do {
      try await repo.sendCollaborationRequest(to: collaboration, from: requester, message: nil)
      XCTFail("A second request for the same project must be rejected")
    } catch let error as ConnectionsRepoError {
      XCTAssertEqual(error, .requestAlreadySent)
    }

    try await signIn(owner)
    try await repo.deleteCollaboration(id: collaborationID, authorID: owner.uid)
    let afterDelete = try await repo.fetchCollaborations(limit: 50)
    XCTAssertFalse(afterDelete.contains { $0.id == collaborationID })
  }

  func testEncounterLifecycleFollowsTheRules() async throws {
    let repo = FirebaseConnectionsRepo()
    let host = try await makeUser("Carla Anfitriona")

    var draft = EncounterDraft()
    draft.title = "Noche de estrellas"
    draft.city = "Lima"
    draft.venue = "Parque del Amor"
    draft.capacityText = "20"
    draft.startAt = Date().addingTimeInterval(24 * 60 * 60)
    let encounterID = try await repo.createEncounter(draft, ownerID: host.uid)
    let hostIsAttending = try await repo.isAttending(encounterID: encounterID, uid: host.uid)
    XCTAssertTrue(hostIsAttending, "The creator is signed up, like the web's createEvent")

    let guest = try await makeUser("Diego Invitado")
    let upcoming = try await repo.fetchUpcomingEncounters(limit: 30)
    XCTAssertTrue(upcoming.contains { $0.id == encounterID })

    try await repo.joinEncounter(encounterID: encounterID, uid: guest.uid)
    let guestJoined = try await repo.isAttending(encounterID: encounterID, uid: guest.uid)
    XCTAssertTrue(guestJoined)

    try await repo.leaveEncounter(encounterID: encounterID, uid: guest.uid)
    let guestLeft = try await repo.isAttending(encounterID: encounterID, uid: guest.uid)
    XCTAssertFalse(guestLeft)

    try await signIn(host)
    try await repo.deleteEncounter(encounterID: encounterID)
  }
}

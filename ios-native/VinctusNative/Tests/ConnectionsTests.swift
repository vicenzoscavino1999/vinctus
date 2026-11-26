import XCTest
@testable import VinctusNative

final class ConnectionsDraftTests: XCTestCase {
  private func validCollaboration() -> CollaborationDraft {
    var draft = CollaborationDraft()
    draft.title = "  Cuarteto de jazz  "
    draft.context = "Tocamos los viernes"
    draft.seekingRole = "Bajista"
    return draft
  }

  func testACollaborationDraftIsTrimmed() throws {
    let valid = try XCTUnwrap(validCollaboration().validated())
    XCTAssertEqual(valid.title, "Cuarteto de jazz")
  }

  func testACollaborationNeedsTitleContextAndRole() {
    var draft = validCollaboration()
    draft.seekingRole = "   "
    XCTAssertNil(draft.validated())
  }

  func testCollaborationLimitsMatchTheRules() {
    var draft = validCollaboration()
    draft.title = String(repeating: "a", count: CollaborationDraft.titleLimit + 1)
    XCTAssertNil(draft.validated())

    draft = validCollaboration()
    draft.seekingRole = String(repeating: "a", count: CollaborationDraft.seekingRoleLimit + 1)
    XCTAssertNil(draft.validated())

    draft = validCollaboration()
    draft.tagsText = "a,b,c,d,e,f,g"
    XCTAssertNil(draft.validated(), "isValidTagArray allows at most 6 tags")
  }

  func testTagsAreTrimmedAndDeduplicated() {
    var draft = validCollaboration()
    draft.tagsText = " jazz, Jazz ,, bajo "
    XCTAssertEqual(draft.tags, ["jazz", "bajo"])
  }

  func testAnEncounterMustBeInTheFuture() {
    var draft = EncounterDraft()
    draft.title = "Noche de estrellas"
    draft.startAt = Date().addingTimeInterval(-60)
    XCTAssertNil(draft.validated())

    draft.startAt = Date().addingTimeInterval(3600)
    XCTAssertNotNil(draft.validated())
  }

  func testEncounterCapacityIsOptionalButPositive() {
    var draft = EncounterDraft()
    draft.title = "Taller"
    XCTAssertNil(draft.capacity)
    XCTAssertNotNil(draft.validated())

    draft.capacityText = "0"
    XCTAssertNil(draft.validated())
    draft.capacityText = "abc"
    XCTAssertNil(draft.validated())
    draft.capacityText = "25"
    XCTAssertEqual(draft.validated()?.capacity, 25)
  }
}

/// The documents the app writes must have exactly the keys `firestore.rules` allows.
final class ConnectionsPayloadTests: XCTestCase {
  private let author = ConnectionsAuthor(uid: "me", displayName: "Lucía", photoURL: nil)

  func testCollaborationKeysMatchIsValidCollaborationCreate() throws {
    var draft = CollaborationDraft()
    draft.title = "Proyecto"
    draft.context = "Contexto"
    draft.seekingRole = "Rol"
    let payload = FirebaseConnectionsRepo.collaborationPayload(try XCTUnwrap(draft.validated()), author: author)

    XCTAssertEqual(Set(payload.keys), [
      "title", "context", "seekingRole", "mode", "location", "level", "topic", "tags",
      "authorId", "authorSnapshot", "status", "createdAt", "updatedAt",
    ])
    XCTAssertEqual(payload["status"] as? String, "open")
    XCTAssertTrue(payload["location"] is NSNull, "An empty location is written as null")
    let snapshot = try XCTUnwrap(payload["authorSnapshot"] as? [String: Any])
    XCTAssertEqual(Set(snapshot.keys), ["displayName", "photoURL"])
  }

  func testRequestKeysMatchIsValidCollaborationRequestCreate() {
    let collaboration = FakeConnectionsRepo.collaboration(id: "c1", authorID: "u2")
    let payload = FirebaseConnectionsRepo.requestPayload(to: collaboration, from: author, message: "  ")

    XCTAssertEqual(Set(payload.keys), [
      "collaborationId", "collaborationTitle", "fromUid", "toUid", "status", "message",
      "fromUserName", "fromUserPhoto", "createdAt", "updatedAt",
    ])
    XCTAssertEqual(payload["toUid"] as? String, "u2")
    XCTAssertTrue(payload["message"] is NSNull, "A blank message is written as null")
  }

  func testEncounterKeysMatchIsValidEventCreate() throws {
    var draft = EncounterDraft()
    draft.title = "Encuentro"
    draft.capacityText = "10"
    let payload = FirebaseConnectionsRepo.encounterPayload(try XCTUnwrap(draft.validated()), ownerID: "me")

    XCTAssertEqual(Set(payload.keys), [
      "title", "description", "startAt", "endAt", "city", "venue",
      "capacity", "visibility", "createdBy", "coverUrl", "createdAt", "updatedAt",
    ])
    XCTAssertEqual(payload["visibility"] as? String, "public")
    XCTAssertEqual(payload["capacity"] as? Int, 10)
  }

  func testClosedCollaborationsAreHidden() {
    XCTAssertNil(FirebaseConnectionsRepo.collaboration(id: "c1", data: ["status": "closed", "title": "x"]))
    XCTAssertNotNil(FirebaseConnectionsRepo.collaboration(id: "c1", data: ["status": "open", "title": "x"]))
  }
}

@MainActor
final class ConnectionsViewModelTests: XCTestCase {
  func testRelationBadges() {
    let own = FakeConnectionsRepo.collaboration(id: "c1", authorID: "me")
    let requested = FakeConnectionsRepo.collaboration(id: "c2", authorID: "u2")
    let other = FakeConnectionsRepo.collaboration(id: "c3", authorID: "u3")

    XCTAssertEqual(CollaborationRelation.of(own, uid: "me", requestedIDs: ["c2"]), .own)
    XCTAssertEqual(CollaborationRelation.of(requested, uid: "me", requestedIDs: ["c2"]), .requested)
    XCTAssertEqual(CollaborationRelation.of(other, uid: "me", requestedIDs: ["c2"]), .available)
    XCTAssertEqual(CollaborationRelation.own.badge, "Tu proyecto")
    XCTAssertEqual(CollaborationRelation.requested.badge, "Solicitud enviada")
  }

  func testLoadShowsCollaborationsEncountersAndRequests() async {
    let repo = FakeConnectionsRepo()
    repo.collaborations = [FakeConnectionsRepo.collaboration(id: "c1", authorID: "u2")]
    repo.encounters = [FakeConnectionsRepo.encounter(id: "e1")]
    repo.requestedIDs = ["c1"]
    let vm = ConnectionsViewModel(repo: repo)

    await vm.load(uid: "me")

    XCTAssertEqual(vm.collaborations.map(\.id), ["c1"])
    XCTAssertEqual(vm.encounters.map(\.id), ["e1"])
    XCTAssertEqual(vm.relation(of: vm.collaborations[0], uid: "me"), .requested)
  }

  func testAFailedLoadShowsAnError() async {
    let repo = FakeConnectionsRepo()
    repo.failsToList = true
    let vm = ConnectionsViewModel(repo: repo)

    await vm.load(uid: "me")

    XCTAssertNotNil(vm.collaborationsError)
    XCTAssertNotNil(vm.encountersError)
  }

  func testPublishingACollaboration() async {
    let repo = FakeConnectionsRepo()
    let vm = ConnectionsViewModel(repo: repo)
    var draft = CollaborationDraft()
    draft.title = "Podcast"
    draft.context = "Divulgación"
    draft.seekingRole = "Editor"

    let published = await vm.publish(draft, uid: "me")

    XCTAssertTrue(published)
    XCTAssertEqual(repo.createdCollaborations.count, 1)
    XCTAssertEqual(vm.collaborations.first?.title, "Podcast")
    XCTAssertEqual(vm.notice, "Proyecto publicado.")
    XCTAssertFalse(vm.isSubmitting)
  }

  func testAnInvalidDraftIsNotSent() async {
    let repo = FakeConnectionsRepo()
    let vm = ConnectionsViewModel(repo: repo)

    let published = await vm.publish(CollaborationDraft(), uid: "me")

    XCTAssertFalse(published)
    XCTAssertTrue(repo.createdCollaborations.isEmpty)
  }

  func testSendingARequestMarksTheCollaboration() async {
    let repo = FakeConnectionsRepo()
    let collaboration = FakeConnectionsRepo.collaboration(id: "c1", authorID: "u2")
    repo.collaborations = [collaboration]
    let vm = ConnectionsViewModel(repo: repo)
    await vm.load(uid: "me")

    let sent = await vm.sendRequest(to: collaboration, message: "Hola", uid: "me")

    XCTAssertTrue(sent)
    XCTAssertEqual(repo.sentRequests.first?.collaborationID, "c1")
    XCTAssertEqual(vm.relation(of: collaboration, uid: "me"), .requested)
  }

  func testADuplicateRequestStillMarksTheCollaboration() async {
    let repo = FakeConnectionsRepo()
    repo.duplicateRequestError = .requestAlreadySent
    let collaboration = FakeConnectionsRepo.collaboration(id: "c1", authorID: "u2")
    let vm = ConnectionsViewModel(repo: repo)

    let sent = await vm.sendRequest(to: collaboration, message: "", uid: "me")

    XCTAssertFalse(sent)
    XCTAssertEqual(vm.relation(of: collaboration, uid: "me"), .requested)
  }

  func testTheAuthorCannotRequestTheirOwnProject() async {
    let repo = FakeConnectionsRepo()
    let own = FakeConnectionsRepo.collaboration(id: "c1", authorID: "me")
    let vm = ConnectionsViewModel(repo: repo)

    let sent = await vm.sendRequest(to: own, message: "", uid: "me")

    XCTAssertFalse(sent)
    XCTAssertTrue(repo.sentRequests.isEmpty)
  }

  func testDeletingOwnCollaboration() async {
    let repo = FakeConnectionsRepo()
    let own = FakeConnectionsRepo.collaboration(id: "c1", authorID: "me")
    repo.collaborations = [own]
    let vm = ConnectionsViewModel(repo: repo)
    await vm.load(uid: "me")

    let deleted = await vm.delete(own, uid: "me")

    XCTAssertTrue(deleted)
    XCTAssertEqual(repo.deletedCollaborations, ["c1"])
    XCTAssertTrue(vm.collaborations.isEmpty)
  }

  func testPublishingAnEncounter() async {
    let repo = FakeConnectionsRepo()
    let vm = ConnectionsViewModel(repo: repo)
    var draft = EncounterDraft()
    draft.title = "Noche de estrellas"

    let published = await vm.publish(draft, uid: "me")

    XCTAssertTrue(published)
    XCTAssertEqual(repo.createdEncounters.count, 1)
  }
}

@MainActor
final class EncounterDetailViewModelTests: XCTestCase {
  func testJoinAndLeave() async {
    let repo = FakeConnectionsRepo()
    let vm = EncounterDetailViewModel(encounter: FakeConnectionsRepo.encounter(id: "e1", attendees: 3), repo: repo)
    await vm.load(uid: "me")
    XCTAssertFalse(vm.isAttending)

    await vm.toggleAttendance(uid: "me")
    XCTAssertTrue(vm.isAttending)
    XCTAssertEqual(vm.attendeesCount, 4)

    await vm.toggleAttendance(uid: "me")
    XCTAssertFalse(vm.isAttending)
    XCTAssertEqual(vm.attendeesCount, 3)
    XCTAssertEqual(repo.joinCalls, 1)
    XCTAssertEqual(repo.leaveCalls, 1)
  }

  func testAFullEncounterCannotBeJoined() async {
    let repo = FakeConnectionsRepo()
    let vm = EncounterDetailViewModel(encounter: FakeConnectionsRepo.encounter(id: "e1", capacity: 2, attendees: 2), repo: repo)

    await vm.toggleAttendance(uid: "me")

    XCTAssertTrue(vm.isFull)
    XCTAssertFalse(vm.isAttending)
    XCTAssertEqual(repo.joinCalls, 0)
    XCTAssertEqual(vm.errorMessage, "Aforo completo.")
  }

  func testOnlyTheCreatorOwnsTheEncounter() {
    let vm = EncounterDetailViewModel(encounter: FakeConnectionsRepo.encounter(id: "e1", createdBy: "me"), repo: FakeConnectionsRepo())
    XCTAssertTrue(vm.isOwner(uid: "me"))
    XCTAssertFalse(vm.isOwner(uid: "u9"))
  }
}

final class ConnectionsFormatTests: XCTestCase {
  func testRelativeAge() {
    let now = Date()
    XCTAssertEqual(ConnectionsFormat.relativeAge(now, now: now), "Ahora")
    XCTAssertEqual(ConnectionsFormat.relativeAge(now.addingTimeInterval(-5 * 60), now: now), "Hace 5 min")
    XCTAssertEqual(ConnectionsFormat.relativeAge(now.addingTimeInterval(-3 * 3600), now: now), "Hace 3 h")
    XCTAssertEqual(ConnectionsFormat.relativeAge(now.addingTimeInterval(-313 * 86_400), now: now), "Hace 313 d")
  }

  func testPlaceJoinsCityAndVenue() {
    XCTAssertEqual(ConnectionsFormat.place(city: "Lima", venue: "Barranco"), "Lima, Barranco")
    XCTAssertEqual(ConnectionsFormat.place(city: nil, venue: "Barranco"), "Barranco")
    XCTAssertNil(ConnectionsFormat.place(city: nil, venue: nil))
  }
}

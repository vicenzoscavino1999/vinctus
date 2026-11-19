import FirebaseFirestore
import XCTest
@testable import VinctusNative

final class AIIntegrationTests: EmulatorTestCase {
  func testAIConsentRoundTripAndCrossUserPrivacy() async throws {
    let alice = try await makeUser("Alice")
    let consentRepo = FirebaseAIConsentRepo()

    let initial = try await consentRepo.getConsent(uid: alice.uid)
    XCTAssertFalse(initial.granted)
    XCTAssertFalse(initial.recorded)

    try await consentRepo.setConsent(uid: alice.uid, granted: true, source: .aiChat)
    let granted = try await consentRepo.getConsent(uid: alice.uid)
    XCTAssertTrue(granted.granted)
    XCTAssertTrue(granted.recorded)
    XCTAssertEqual(granted.source, .aiChat)

    try await consentRepo.setConsent(uid: alice.uid, granted: false, source: .settings)
    let revoked = try await consentRepo.getConsent(uid: alice.uid)
    XCTAssertFalse(revoked.granted)
    XCTAssertTrue(revoked.recorded)
    XCTAssertEqual(revoked.source, .settings)

    let bob = try await makeUser("Bob")
    let bobConsent = try await consentRepo.getConsent(uid: bob.uid)
    XCTAssertFalse(bobConsent.granted)
    XCTAssertFalse(bobConsent.recorded)

    do {
      _ = try await consentRepo.getConsent(uid: alice.uid)
      XCTFail("Bob must not read Alice's private AI consent")
    } catch {
      XCTAssertEqual((error as NSError).code, FirestoreErrorCode.permissionDenied.rawValue)
    }

    do {
      try await consentRepo.setConsent(uid: alice.uid, granted: true, source: .settings)
      XCTFail("Bob must not write Alice's private AI consent")
    } catch {
      XCTAssertEqual((error as NSError).code, FirestoreErrorCode.permissionDenied.rawValue)
    }
  }

  func testArenaPersonasAndUsageCallablesWorkAgainstFunctionsEmulator() async throws {
    _ = try await makeUser("Alice")
    let aiRepo = FirebaseAIRepo()

    let personas = try await aiRepo.fetchArenaPersonas()
    XCTAssertGreaterThanOrEqual(personas.count, 2)
    XCTAssertTrue(personas.contains { $0.id == "scientist" })
    XCTAssertTrue(personas.contains { $0.id == "philosopher" })

    let usage = try await aiRepo.fetchArenaUsage()
    XCTAssertGreaterThan(usage.limit, 0)
    XCTAssertEqual(usage.used, 0)
    XCTAssertEqual(usage.remaining, usage.limit)
  }

  func testSavedDebateIsIdempotentAndArenaServerCollectionsRejectClientWrites() async throws {
    let alice = try await makeUser("Alice")
    let profileRepo = FirebaseProfileContentRepo()
    let debate = SavedDebate(
      id: "debate_idempotent_1",
      topic: "¿Energía nuclear para la transición energética?",
      personaA: "scientist",
      personaB: "philosopher",
      summary: "Resumen técnico y ético.",
      winner: "draw",
      createdAt: nil
    )

    try await profileRepo.saveDebate(debate)
    // Saving a second time must be idempotent and not fail immutable createdAt rules.
    try await profileRepo.saveDebate(debate)

    let saved = try await profileRepo.fetchSavedDebates()
    XCTAssertEqual(saved.map(\.id), ["debate_idempotent_1"])
    XCTAssertEqual(saved.first?.winner, "draw")

    try await profileRepo.removeSavedDebate(id: "debate_idempotent_1")
    let afterRemoval = try await profileRepo.fetchSavedDebates()
    XCTAssertTrue(afterRemoval.isEmpty)

    // Client writes to server-managed Arena collections must be denied by firestore.rules.
    do {
      try await Firestore.firestore().collection(FirestoreCollections.arenaDebates)
        .document("client_forged_debate")
        .setData([
          "topic": "Forjado",
          "personaA": "scientist",
          "personaB": "philosopher",
          "createdBy": alice.uid,
          "status": "done",
          "visibility": "public",
          "likesCount": 0,
        ])
      XCTFail("Clients must not create arenaDebates directly")
    } catch {
      XCTAssertEqual((error as NSError).code, FirestoreErrorCode.permissionDenied.rawValue)
    }

    do {
      try await Firestore.firestore().collection(FirestoreCollections.arenaUsage)
        .document(alice.uid)
        .collection(FirestoreSubcollections.days)
        .document("2026-11-19")
        .setData(["count": 0])
      XCTFail("Clients must not modify arenaUsage directly")
    } catch {
      XCTAssertEqual((error as NSError).code, FirestoreErrorCode.permissionDenied.rawValue)
    }
  }
}

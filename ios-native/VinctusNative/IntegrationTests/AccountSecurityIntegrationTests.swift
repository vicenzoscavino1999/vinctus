import FirebaseAuth
import FirebaseFirestore
import FirebaseStorage
import XCTest
@testable import VinctusNative

final class AccountSecurityIntegrationTests: EmulatorTestCase {
  func testAccountVisibilitySyncsBothCollectionsAndRevokeOtherSessionsSucceeds() async throws {
    let alice = try await makeUser("Alice")
    let security = FirebaseAccountSecurityRepo()

    let initialVisibility = try await security.fetchAccountVisibility(uid: alice.uid)
    XCTAssertEqual(initialVisibility, .public)

    try await security.setAccountVisibility(uid: alice.uid, visibility: .private)
    let updatedVisibility = try await security.fetchAccountVisibility(uid: alice.uid)
    XCTAssertEqual(updatedVisibility, .private)

    let publicDoc = try await Firestore.firestore()
      .collection(FirestoreCollections.usersPublic)
      .document(alice.uid)
      .getDocument(source: .server)
    let publicVisibility = publicDoc.data()?["accountVisibility"] as? String
    XCTAssertEqual(publicVisibility, "private")

    // Verify revokeUserSessions Cloud Function callable works end-to-end.
    try await security.revokeOtherSessions()
  }

  func testSelfReportIsRejectedAndBlockedDMRejectsStorageAttachmentUpload() async throws {
    let bruno = try await makeUser("Bruno")
    let ana = try await makeUser("Ana")

    // Ana follows Bruno and opens a DM before blocking him.
    let engagement = FirebaseEngagementRepo()
    let followStatus = try await engagement.follow(targetUID: bruno.uid, isPrivate: false)
    XCTAssertEqual(followStatus, .following)

    let chat = FirebaseChatRepo()
    let conversationID = try await chat.openDirectConversation(with: bruno.uid)

    let moderation = FirebaseModerationRepo()

    // Self-report must fail client-side and in Firestore rules.
    do {
      try await moderation.report(.user(userID: ana.uid), reason: .spam, details: "Self")
      XCTFail("Self-report should be rejected")
    } catch ModerationRepoError.cannotReportSelf {
      // Expected
    }

    // Ana blocks Bruno -> Bruno can no longer upload attachments to their DM.
    try await moderation.blockUser(bruno.uid)

    try await signIn(bruno)
    _ = try await Auth.auth().currentUser?.getIDToken(forcingRefresh: true)

    // Blocked DM must also reject typing updates in Firestore rules.
    do {
      try await Firestore.firestore()
        .collection(FirestoreCollections.conversations)
        .document(conversationID)
        .collection("typing")
        .document(bruno.uid)
        .setData(["isTyping": true, "updatedAt": FieldValue.serverTimestamp()])
      XCTFail("Blocked user should not be able to write typing status in a blocked DM")
    } catch {
      // Expected: firestore.rules denies typing writes in blocked DMs.
    }

    let ref = Storage.storage().reference(
      withPath: "conversations/\(conversationID)/attachments/\(bruno.uid)/msg_blocked_ios/photo.jpg"
    )
    let metadata = StorageMetadata()
    metadata.contentType = "image/jpeg"
    do {
      _ = try await ref.putDataAsync(Self.jpegData(), metadata: metadata)
      XCTFail("Blocked user should not be able to upload attachments to a blocked DM")
    } catch {
      // Expected: storage.rules denies blocked DM uploads.
    }
  }

  func testAccountDeletionFlowEnqueuesAndCompletes() async throws {
    let ephemeral = try await makeUser("Cuenta Efimera")
    let deleteRepo = FirebaseDeleteAccountRepo()

    let initialState = try await deleteRepo.getAccountDeletionStatus()
    XCTAssertEqual(initialState.status, .notRequested)

    let started = try await deleteRepo.startAccountDeletion()
    XCTAssertEqual(started.mode, .async)
    XCTAssertTrue(
      started.status == .queued || started.status == .processing || started.status == .completed
    )

    // Poll until the background deletion trigger completes or deletes the auth user.
    var finished = started.status == .completed
    for _ in 0..<40 where !finished {
      try await Task.sleep(nanoseconds: 500_000_000)
      do {
        let next = try await deleteRepo.getAccountDeletionStatus()
        if next.status == .completed {
          finished = true
        } else if next.status == .failed {
          XCTFail("Account deletion job failed unexpectedly: \(next.lastError ?? "unknown")")
          return
        }
      } catch {
        // Once the server deletes the Auth user, callable auth rejects as unauthenticated.
        if SettingsViewModel.isUnauthenticatedError(error) {
          finished = true
        }
      }
    }

    XCTAssertTrue(finished, "Expected account deletion for \(ephemeral.uid) to finish")
  }
}

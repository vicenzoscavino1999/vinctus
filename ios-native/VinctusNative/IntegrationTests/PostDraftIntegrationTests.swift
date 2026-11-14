import FirebaseAuth
import FirebaseFirestore
import FirebaseStorage
import XCTest
@testable import VinctusNative

private final class LostPostAcknowledgementRepo: CreatePostRepo {
  private let underlying = FirebaseCreatePostRepo()
  func makePostID() throws -> String { try underlying.makePostID() }
  func publishPost(_ draft: NativePostDraft, postID: String, groupID: String?, onProgress: @escaping (Double) -> Void) async throws {
    try await underlying.publishPost(draft, postID: postID, groupID: groupID, onProgress: onProgress)
    throw NSError(domain: "InjectedLostPostAcknowledgement", code: 1)
  }
}

final class PostDraftIntegrationTests: EmulatorTestCase {
  @MainActor
  func testRelaunchedComposerRecoversAnAcceptedPostWithoutDuplicateOrObjectOverwrite() async throws {
    let user = try await makeUser("Draft recovery")
    let root = FileManager.default.temporaryDirectory.appendingPathComponent("vinctus-post-draft-integration-\(UUID().uuidString)", isDirectory: true)
    defer { try? FileManager.default.removeItem(at: root) }
    let scope = PostDraftScope(uid: user.uid, groupID: nil)
    let store = PostDraftStore(root: root)
    let first = CreatePostViewModel(repo: LostPostAcknowledgementRepo(), draftSession: PostDraftSession(uid: user.uid, groupID: nil, store: store), currentUserID: { Auth.auth().currentUser?.uid })
    await first.restoreDraft()
    first.draftText = "Recover after accepted commit"
    let data = Data("%PDF-1.4\n%%EOF".utf8)
    let source = ChatPendingAttachment.temporaryURL(extension: "pdf")
    try data.write(to: source)
    let file = ChatPendingAttachment(fileURL: source, fileName: "Notes.pdf", contentType: "application/pdf", size: data.count, kind: .document)
    try first.addAttachment(file)
    await first.submit()?.value
    XCTAssertNotNil(first.errorMessage)
    let postID = try XCTUnwrap(first.pendingPostID)
    let ref = Firestore.firestore().collection("posts").document(postID)
    let accepted = try await ref.getDocument(source: .server)
    XCTAssertEqual(accepted.data()?["status"] as? String, "ready")
    let path = PostFiles.path(file, userID: user.uid, postID: postID)
    let stored = Storage.storage().reference(withPath: path)
    let original = try await stored.getMetadata()
    try FileManager.default.removeItem(at: source)

    let relaunchedStore = PostDraftStore(root: root)
    let second = CreatePostViewModel(repo: FirebaseCreatePostRepo(), draftSession: PostDraftSession(uid: user.uid, groupID: nil, store: relaunchedStore), currentUserID: { Auth.auth().currentUser?.uid })
    await second.restoreDraft()
    XCTAssertEqual(second.pendingPostID, postID)
    XCTAssertEqual(second.attachments.first?.id, file.id)
    XCTAssertTrue(second.canRetryPendingSubmission)
    await second.retryPendingSubmission()?.value
    XCTAssertNil(second.errorMessage)
    let resumed = try await ref.getDocument(source: .server)
    XCTAssertEqual(accepted.data()?["createdAt"] as? Timestamp, resumed.data()?["createdAt"] as? Timestamp)
    XCTAssertEqual(accepted.data()?["updatedAt"] as? Timestamp, resumed.data()?["updatedAt"] as? Timestamp)
    let metadata = try await stored.getMetadata()
    XCTAssertEqual(original.generation, metadata.generation)
    XCTAssertEqual(original.timeCreated, metadata.timeCreated)
    let persisted = try await relaunchedStore.load(scope)
    XCTAssertNil(persisted.snapshot)
    let feed = try await FirebaseFeedRepo().fetchFeedPage(limit: 20, after: nil)
    XCTAssertEqual(feed.items.filter { $0.id == postID }.count, 1)
  }
}

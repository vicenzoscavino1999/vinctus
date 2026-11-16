import XCTest
@testable import VinctusNative

private final class DraftPublishingRepo: CreatePostRepo {
  var ids: [String] = []
  var handler: ((NativePostDraft, String) async throws -> Void)?
  func makePostID() -> String { UUID().uuidString }
  func publishPost(_ draft: NativePostDraft, postID: String, groupID: String?, onProgress: @escaping (Double) -> Void) async throws {
    ids.append(postID)
    try await handler?(draft, postID)
  }
}

@MainActor
final class PostDraftTests: XCTestCase {
  private func root() -> URL {
    FileManager.default.temporaryDirectory.appendingPathComponent("vinctus-post-draft-tests-\(UUID().uuidString)", isDirectory: true)
  }
  private func file() throws -> ChatPendingAttachment {
    let url = ChatPendingAttachment.temporaryURL(extension: "pdf")
    let data = Data("%PDF-1.4".utf8)
    try data.write(to: url)
    return ChatPendingAttachment(fileURL: url, fileName: "Notas.pdf", contentType: "application/pdf", size: data.count, kind: .document)
  }

  func testRestoresRawTextAndPrivateFileCopiesAfterOriginalDisappears() async throws {
    let root = root(); defer { try? FileManager.default.removeItem(at: root) }
    let store = PostDraftStore(root: root)
    let scope = PostDraftScope(uid: "ana", groupID: nil)
    let file = try file()
    let snapshot = PostDraftSnapshot(title: "  Título  ", text: " Texto\n", files: [file])
    _ = try await store.save(snapshot, scope: scope, expectedRevision: nil)
    try FileManager.default.removeItem(at: file.fileURL)
    let relaunchedStore = PostDraftStore(root: root)
    let loaded = try await relaunchedStore.load(scope).snapshot
    XCTAssertEqual(loaded?.title, snapshot.title)
    XCTAssertEqual(loaded?.text, snapshot.text)
    XCTAssertEqual(loaded?.files.first?.id, file.id)
    let restored = try XCTUnwrap(loaded?.files.first)
    XCTAssertEqual(try Data(contentsOf: restored.fileURL), Data("%PDF-1.4".utf8))
    XCTAssertNotEqual(restored.fileURL, file.fileURL)
  }

  func testAccountsAndGroupsHaveSeparateDrafts() async throws {
    let root = root(); defer { try? FileManager.default.removeItem(at: root) }
    let store = PostDraftStore(root: root)
    let scopes = [PostDraftScope(uid: "ana", groupID: nil), PostDraftScope(uid: "bruno", groupID: nil), PostDraftScope(uid: "ana", groupID: "g1"), PostDraftScope(uid: "ana", groupID: "g2")]
    XCTAssertEqual(Set(scopes.map(\.directoryName)).count, 4)
    for (index, scope) in scopes.enumerated() {
      _ = try await store.save(PostDraftSnapshot(text: "Draft \(index)"), scope: scope, expectedRevision: nil)
    }
    for (index, scope) in scopes.enumerated() {
      let loaded = try await store.load(scope)
      XCTAssertEqual(loaded.snapshot?.text, "Draft \(index)")
    }
  }

  func testStaleSessionCannotResurrectDiscardedDraftOrOverwriteNewerFiles() async throws {
    let root = root(); defer { try? FileManager.default.removeItem(at: root) }
    let store = PostDraftStore(root: root)
    let a = PostDraftSession(uid: "ana", groupID: nil, store: store)
    let b = PostDraftSession(uid: "ana", groupID: nil, store: store)
    _ = try await a.load(); _ = try await b.load()
    a.save(nil); try await a.flush()
    b.save(PostDraftSnapshot(text: "Old editor", files: [try file()]))
    do { try await b.flush(); XCTFail("A stale revision must fail") }
    catch { XCTAssertTrue(error is PostDraftStoreError) }
    let loaded = try await store.load(a.scope)
    XCTAssertNotNil(loaded.revision)
    XCTAssertNil(loaded.snapshot)
  }

  func testRelaunchAfterFailureRestoresPendingIDAndFilesBeforeRetry() async throws {
    let root = root(); defer { try? FileManager.default.removeItem(at: root) }
    let store = PostDraftStore(root: root)
    let repo = DraftPublishingRepo()
    let scope = PostDraftScope(uid: "ana", groupID: nil)
    repo.handler = { _, id in
      let saved = try await store.load(scope).snapshot
      XCTAssertEqual(saved?.pendingPostID, id, "Persist the ID before any network call")
      throw FakeError()
    }
    let first = CreatePostViewModel(repo: repo, draftSession: PostDraftSession(uid: "ana", groupID: nil, store: store), currentUserID: { "ana" })
    await first.restoreDraft()
    first.draftText = "Hola"
    let file = try file(); try first.addAttachment(file)
    await first.submit()?.value
    let id = try XCTUnwrap(first.pendingPostID)
    try FileManager.default.removeItem(at: file.fileURL)
    let second = CreatePostViewModel(repo: repo, draftSession: PostDraftSession(uid: "ana", groupID: nil, store: PostDraftStore(root: root)), currentUserID: { "ana" })
    await second.restoreDraft()
    XCTAssertEqual(second.pendingPostID, id)
    XCTAssertEqual(second.attachments.first?.id, file.id)
    repo.handler = nil
    await second.retryPendingSubmission()?.value
    XCTAssertEqual(repo.ids, [id, id])
    let cleared = try await store.load(scope)
    XCTAssertNil(cleared.snapshot)
  }

  func testMissingFileBlocksPublishingAndRetainsTextUntilPersistenceSucceeds() async throws {
    let root = root(); defer { try? FileManager.default.removeItem(at: root) }
    let repo = DraftPublishingRepo()
    let vm = CreatePostViewModel(repo: repo, draftSession: PostDraftSession(uid: "ana", groupID: nil, store: PostDraftStore(root: root)), currentUserID: { "ana" })
    await vm.restoreDraft()
    vm.draftText = "Keep this"
    let file = try file(); try FileManager.default.removeItem(at: file.fileURL)
    try vm.addAttachment(file)
    await vm.flushDraft()
    await vm.submit()?.value
    XCTAssertTrue(repo.ids.isEmpty)
    XCTAssertEqual(vm.draftText, "Keep this")
    XCTAssertNotNil(vm.draftSaveError)
    vm.removeAttachment(file.id)
    await vm.retryDraftSave()
    await vm.submit()?.value
    XCTAssertEqual(repo.ids.count, 1)
  }

  func testAccountChangeBlocksSendingAnotherAccountsDraft() async throws {
    let root = root(); defer { try? FileManager.default.removeItem(at: root) }
    let repo = DraftPublishingRepo()
    let vm = CreatePostViewModel(repo: repo, draftSession: PostDraftSession(uid: "ana", groupID: nil, store: PostDraftStore(root: root)), currentUserID: { "bruno" })
    await vm.restoreDraft()
    vm.draftText = "Cuenta Ana"
    await vm.submit()?.value
    XCTAssertTrue(repo.ids.isEmpty)
    XCTAssertEqual(vm.draftText, "Cuenta Ana")
    XCTAssertNotNil(vm.errorMessage)
  }

  func testNewTextWrittenDuringSendSurvivesAReopen() async throws {
    let root = root(); defer { try? FileManager.default.removeItem(at: root) }
    let store = PostDraftStore(root: root)
    let repo = DraftPublishingRepo()
    let started = expectation(description: "Sending")
    var release: CheckedContinuation<Void, Never>?
    repo.handler = { _, _ in await withCheckedContinuation { release = $0; started.fulfill() } }
    let first = CreatePostViewModel(repo: repo, draftSession: PostDraftSession(uid: "ana", groupID: nil, store: store), currentUserID: { "ana" })
    await first.restoreDraft(); first.draftText = "First"
    let send = first.submit()
    await fulfillment(of: [started], timeout: 3)
    first.draftText = "Second"
    release?.resume(); await send?.value
    let second = CreatePostViewModel(repo: repo, draftSession: PostDraftSession(uid: "ana", groupID: nil, store: store), currentUserID: { "ana" })
    await second.restoreDraft()
    XCTAssertEqual(second.draftText, "Second")
    XCTAssertNil(second.pendingPostID)
  }

  func testMissingSavedAttachmentFailsClosedWithoutReplacingManifest() async throws {
    let root = root(); defer { try? FileManager.default.removeItem(at: root) }
    let store = PostDraftStore(root: root)
    let scope = PostDraftScope(uid: "ana", groupID: nil)
    _ = try await store.save(PostDraftSnapshot(text: "Original", files: [try file()]), scope: scope, expectedRevision: nil)
    let loaded = try await store.load(scope)
    let file = try XCTUnwrap(loaded.snapshot?.files.first)
    try FileManager.default.removeItem(at: file.fileURL)
    let repo = DraftPublishingRepo()
    let vm = CreatePostViewModel(repo: repo, draftSession: PostDraftSession(uid: "ana", groupID: nil, store: store), currentUserID: { "ana" })
    await vm.restoreDraft()
    XCTAssertFalse(vm.draftLoaded)
    XCTAssertNotNil(vm.draftSaveError)
    XCTAssertNil(vm.submit())
    XCTAssertTrue(repo.ids.isEmpty)
    let manifest = root.appendingPathComponent(scope.directoryName).appendingPathComponent("draft.json")
    XCTAssertTrue(try String(contentsOf: manifest, encoding: .utf8).contains("Original"))
  }

  func testAbandonedPendingUploadRotatesAndFlushesNewIDBeforeRetrying() async throws {
    let root = root(); defer { try? FileManager.default.removeItem(at: root) }
    let store = PostDraftStore(root: root)
    let repo = DraftPublishingRepo()
    let scope = PostDraftScope(uid: "ana", groupID: nil)
    let file = try file()
    let identity = NativePostDraftIdentity(title: "Título", text: "Texto", fileIDs: [file.id], youtubeID: nil)
    _ = try await store.save(
      PostDraftSnapshot(title: "Título", text: "Texto", files: [file], pendingPostID: "retired-id", pendingIdentity: identity),
      scope: scope,
      expectedRevision: nil
    )
    var sawReplacementPersisted = false
    repo.handler = { _, id in
      if id == "retired-id" {
        throw CreatePostRepoError.postUploadAbandoned
      }
      let saved = try await store.load(scope).snapshot
      XCTAssertEqual(saved?.pendingPostID, id, "Replacement ID must be flushed before publishing")
      sawReplacementPersisted = true
    }
    let vm = CreatePostViewModel(repo: repo, draftSession: PostDraftSession(uid: "ana", groupID: nil, store: store), currentUserID: { "ana" })
    await vm.restoreDraft()
    XCTAssertEqual(vm.pendingPostID, "retired-id")
    await vm.retryPendingSubmission()?.value
    XCTAssertTrue(sawReplacementPersisted)
    XCTAssertEqual(repo.ids.count, 2)
    XCTAssertEqual(repo.ids.first, "retired-id")
    XCTAssertNotEqual(repo.ids.last, "retired-id")
    XCTAssertNil(vm.errorMessage)
    let cleared = try await store.load(scope)
    XCTAssertNil(cleared.snapshot)
  }
}

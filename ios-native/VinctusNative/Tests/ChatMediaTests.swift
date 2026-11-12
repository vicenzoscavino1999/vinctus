import XCTest
@testable import VinctusNative

final class ChatMediaDataTests: XCTestCase {
  func testParsesMediaWithoutHidingTheTextOrDiscardingAttachmentFields() {
    let attachment = ChatAttachment(kind: "image", url: "https://example.com/photo.jpg", path: "conversations/c/attachments/a/m/photo.jpg",
      fileName: "Foto.jpg", contentType: "image/jpeg", size: 100)
    let message = FirebaseChatRepo.message(id: "m", data: [
      "senderId": "a", "text": "Mira esta foto", "attachments": [attachment.fields],
    ])
    XCTAssertEqual(message?.text, "Mira esta foto")
    XCTAssertEqual(message?.attachments, [attachment])
    XCTAssertTrue(message?.hasAttachments ?? false)
  }

  func testMediaTypesKeepWebCompatibilityAndHaveUsefulPreviews() {
    for (type, kind, label) in [("image/jpeg", ChatMediaKind.image, "Foto"), ("video/mp4", .video, "Video"),
                               ("audio/mp4", .audio, "Audio"), ("application/pdf", .document, "Archivo")] {
      let item = ChatAttachment(kind: kind == .image ? "image" : "file", url: "https://example.com/file", path: "p", fileName: "f", contentType: type, size: 5)
      XCTAssertEqual(item.mediaKind, kind)
      XCTAssertEqual(FirebaseChatRepo.preview(text: "", attachments: [item]), label)
      XCTAssertEqual(FirebaseChatRepo.preview(text: "caption", attachments: [item]), "caption")
      XCTAssertNotNil(item.remoteURL)
    }
  }

  func testRefusesUnsupportedTypesAndExactOrLargerSizeLimits() {
    for (type, limit) in [("image/jpeg", StorageMaxBytes.image), ("video/quicktime", StorageMaxBytes.chatVideo),
                          ("audio/mp4", StorageMaxBytes.chatAudio)] {
      XCTAssertNoThrow(try ChatPendingAttachment.validate(contentType: type, size: limit - 1))
      XCTAssertThrowsError(try ChatPendingAttachment.validate(contentType: type, size: limit))
      XCTAssertThrowsError(try ChatPendingAttachment.validate(contentType: type, size: 0))
    }
    XCTAssertThrowsError(try ChatPendingAttachment.validate(contentType: "application/javascript", size: 100))
    let unsafe = ChatAttachment(kind: "image", url: "file:///private/test", path: "p", fileName: "f", contentType: "image/jpeg", size: 1)
    XCTAssertNil(unsafe.remoteURL)
  }
}

@MainActor
final class ChatMediaViewModelTests: XCTestCase {
  func testAttachmentOnlyMessageCanBeSentAndItsFileSurvivesUntilCompletion() async throws {
    let repo = FakeChatRepo()
    let vm = ConversationViewModel(repo: repo, conversationID: "dm_a_b")
    let file = try makeFile()
    try vm.addAttachment(file)
    XCTAssertTrue(vm.canSend)
    await vm.send()?.value
    XCTAssertTrue(vm.attachments.isEmpty)
    XCTAssertEqual(repo.sentTexts, [""])
    XCTAssertEqual(repo.sentAttachments.first?.first?.id, file.id)
    XCTAssertTrue(FileManager.default.fileExists(atPath: file.fileURL.path))
  }

  func testMediaSendFailurePreservesFilesAndANewerDraftAndRetryUsesSameID() async throws {
    let repo = FakeChatRepo()
    repo.failsToSend = true
    let vm = ConversationViewModel(repo: repo, conversationID: "dm_a_b")
    let file = try makeFile()
    try vm.addAttachment(file)
    vm.draft = "foto"
    let task = vm.send()
    vm.draft = "otro mensaje"
    await task?.value
    XCTAssertEqual(vm.draft, "otro mensaje")
    let failed = try XCTUnwrap(vm.failedMessages.first)
    XCTAssertEqual(failed.attachments.first?.id, file.id)
    XCTAssertTrue(FileManager.default.fileExists(atPath: file.fileURL.path))
    repo.failsToSend = false
    await vm.retry(failed)?.value
    XCTAssertEqual(repo.sentClientIDs.first, repo.sentClientIDs.last)
    XCTAssertTrue(vm.failedMessages.isEmpty)
    XCTAssertEqual(vm.draft, "otro mensaje")
  }

  func testAttachmentLimitAndRemoval() throws {
    let vm = ConversationViewModel(repo: FakeChatRepo(), conversationID: "dm_a_b")
    for _ in 0..<10 { try vm.addAttachment(makeFile()) }
    XCTAssertThrowsError(try vm.addAttachment(makeFile()))
    let id = try XCTUnwrap(vm.attachments.first?.id)
    vm.removeAttachment(id)
    XCTAssertEqual(vm.attachments.count, 9)
    XCTAssertNoThrow(try vm.addAttachment(makeFile()))
  }

  private func makeFile() throws -> ChatPendingAttachment {
    let url = ChatPendingAttachment.temporaryURL(extension: "m4a")
    try Data([0, 1, 2, 3]).write(to: url)
    return try ChatPickedFile.ownedFile(url, name: "Nota.m4a", type: "audio/mp4", kind: .audio)
  }
}

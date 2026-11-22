import XCTest
@testable import VinctusNative

final class PostFileValidationTests: XCTestCase {
  func testLimitsFollowPostStorageRulesRatherThanChatLimits() throws {
    XCTAssertNoThrow(try PostFiles.validate(contentType: "video/quicktime", size: 30 * 1024 * 1024))
    XCTAssertThrowsError(try PostFiles.validate(contentType: "video/mp4", size: StorageMaxBytes.video))
    XCTAssertThrowsError(try PostFiles.validate(contentType: "image/jpeg", size: StorageMaxBytes.image))
    XCTAssertThrowsError(try PostFiles.validate(contentType: "application/pdf", size: StorageMaxBytes.file))
    XCTAssertThrowsError(try PostFiles.validate(contentType: "audio/wav", size: 1))
    XCTAssertThrowsError(try PostFiles.validate(contentType: "application/pdf", size: 0))
  }

  func testPathsAreStableAndPostMediaCanReadTheWebShape() {
    let file = ChatPendingAttachment(fileURL: URL(fileURLWithPath: "/unused"), fileName: "Mi documento.pdf", contentType: "application/pdf", size: 10, kind: .document, id: "file-1")
    XCTAssertEqual(PostFiles.path(file, userID: "ana", postID: "p1"), "posts/ana/p1/files/file-1_Mi_documento.pdf")
    let media = PostMediaItem(fields: ["type": "file", "url": "https://example.com/a.pdf", "path": "posts/ana/p1/files/f.pdf", "fileName": "Notas.pdf", "size": 10])
    XCTAssertEqual(media?.fileName, "Notas.pdf")
    XCTAssertEqual(media?.size, 10)
    XCTAssertNil(PostMediaItem(fields: ["type": "unknown", "url": "https://example.com"]))
  }
}

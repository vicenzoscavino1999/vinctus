import XCTest
@testable import VinctusNative

final class VinctusNativeTests: XCTestCase {
  func testNormalizedTextTrimsWhitespaceAndNewLines() {
    XCTAssertEqual(FirestoreHelpers.normalizedText("  hola mundo \n"), "hola mundo")
    XCTAssertEqual(FirestoreHelpers.normalizedText("\n  \t  "), "")
  }

  func testNormalizedSingleLineTextRemovesLineBreaks() {
    XCTAssertEqual(
      FirestoreHelpers.normalizedSingleLineText("  linea 1\nlinea 2\rlinea 3 "),
      "linea 1 linea 2 linea 3"
    )
  }

  func testComposedDraftSkipsEmptyBlocksAndKeepsOrder() {
    let draft = CreatePostDraftComposer.composedDraft(
      title: "  titulo  ",
      body: "\ncontenido del post\n",
      youtubeURL: "   "
    )
    XCTAssertEqual(draft, "titulo\n\ncontenido del post")
  }

  func testMediaRulesRejectInvalidMediaTypeForKind() {
    let invalidVideo = CreatePostMediaUpload(
      data: Data([0x01, 0x02]),
      kind: .video,
      contentType: "image/jpeg",
      fileName: "photo.jpg",
      width: nil,
      height: nil
    )

    XCTAssertThrowsError(
      try CreatePostMediaRules.validate(
        media: [invalidVideo],
        maxMediaItems: 10,
        maxImageBytes: 10 * 1024 * 1024,
        maxVideoBytes: 100 * 1024 * 1024,
        maxFileBytes: 25 * 1024 * 1024
      )
    ) { error in
      guard case CreatePostRepoError.invalidMedia(let index) = error else {
        return XCTFail("Expected invalidMedia error, got \(error)")
      }
      XCTAssertEqual(index, 0)
    }
  }
}

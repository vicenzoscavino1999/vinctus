import FirebaseFirestore
import XCTest
@testable import VinctusNative

final class PostReadClientTests: XCTestCase {
  func testWirePagePreservesTimestampPrecisionAndOpaqueCursor() throws {
    let cursor = String(repeating: "a", count: 32)
    let page = try PostReadClient.decode([
      "items": [["id": "post", "createdAt": ["seconds": 17, "nanoseconds": 42]]],
      "cursor": cursor, "hasMore": true,
    ])
    XCTAssertEqual(page.cursor, cursor)
    XCTAssertEqual(page.items.first?.id, "post")
    let time = try XCTUnwrap(page.items.first?.fields["createdAt"] as? Timestamp)
    XCTAssertEqual(time.seconds, 17)
    XCTAssertEqual(time.nanoseconds, 42)
  }

  func testEmptyHiddenPageRetainsItsCursorAndMalformedPagesFailClosed() throws {
    let page = try PostReadClient.decode(["items": [], "cursor": String(repeating: "b", count: 32), "hasMore": true])
    XCTAssertTrue(page.items.isEmpty)
    XCTAssertTrue(page.hasMore)
    XCTAssertThrowsError(try PostReadClient.decode(["items": [], "cursor": "document-id", "hasMore": true]))
    XCTAssertThrowsError(try PostReadClient.decode(["items": [], "cursor": NSNull(), "hasMore": true]))
    XCTAssertThrowsError(try PostReadClient.decode(["items": [["text": "private"]], "cursor": NSNull(), "hasMore": false]))
  }
}

import XCTest
@testable import VinctusNative

final class VinctusNativeTests: XCTestCase {
  func testExample() {
    XCTAssertTrue(true)
  }
}

/// Reports must have the same shape as the web ones (`src/shared/lib/firestore/reports.ts`)
/// and pass `isValidUserReportCreate` in firestore.rules.
final class ReportFieldsTests: XCTestCase {
  func testReasonsMatchTheRules() {
    XCTAssertEqual(
      ReportReason.allCases.map(\.rawValue),
      ["spam", "harassment", "abuse", "fake", "other"]
    )
  }

  func testPostReportTargetsTheAuthorAndPrefixesDetails() {
    let fields = ReportFields(target: .post(postID: "p1", authorID: " u1 "), details: "  spam  ")

    XCTAssertEqual(fields.reportedUID, "u1")
    XCTAssertEqual(fields.details, "[Post p1] spam")
    XCTAssertEqual(fields.conversationID, "post_p1")
  }

  func testPostReportWithoutAuthorOrDetailsFallsBackToThePost() {
    let fields = ReportFields(target: .post(postID: "p1", authorID: nil), details: "   ")

    XCTAssertEqual(fields.reportedUID, "p1")
    XCTAssertEqual(fields.details, "Reporte de publicacion p1")
  }

  func testCommentReport() {
    let withDetails = ReportFields(
      target: .comment(postID: "p1", commentID: "c1", authorID: "u2"),
      details: "insulto"
    )
    XCTAssertEqual(withDetails.reportedUID, "u2")
    XCTAssertEqual(withDetails.details, "[Post p1][Comment c1] insulto")
    XCTAssertEqual(withDetails.conversationID, "post_p1_comment_c1")

    let withoutDetails = ReportFields(
      target: .comment(postID: "p1", commentID: "c1", authorID: nil),
      details: nil
    )
    XCTAssertEqual(withoutDetails.reportedUID, "c1")
    XCTAssertEqual(withoutDetails.details, "Reporte de comentario c1 en post p1")
  }

  func testUserReportKeepsDetailsAsIs() {
    let fields = ReportFields(target: .user(userID: "u3"), details: nil)

    XCTAssertEqual(fields.reportedUID, "u3")
    XCTAssertNil(fields.details)
    XCTAssertNil(fields.conversationID)
  }

  func testDetailsOverTheRulesLimitAreRejected() {
    let fits = ReportFields(target: .user(userID: "u3"), details: String(repeating: "a", count: 2000))
    let tooLong = ReportFields(target: .user(userID: "u3"), details: String(repeating: "a", count: 2001))

    XCTAssertTrue(fits.fitsRules)
    XCTAssertFalse(tooLong.fitsRules)
  }
}

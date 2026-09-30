import FirebaseAuth
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

final class AIReportFieldsTests: XCTestCase {
  func testAIReportsPointAtTheAssistantAndFitTheRules() {
    let fields = ReportFields(
      target: .aiResponse(contextID: "chat", excerpt: String(repeating: "x", count: 5000)),
      details: "ofensivo"
    )

    XCTAssertEqual(fields.reportedUID, ReportTarget.aiReportedUID)
    XCTAssertEqual(fields.conversationID, "ai_chat")
    XCTAssertTrue(fields.details?.hasSuffix("| Motivo: ofensivo") ?? false)
    XCTAssertTrue(fields.fitsRules)
  }
}

/// The chat API rejects histories over 20 messages or 12,000 characters.
final class AIChatHistoryTests: XCTestCase {
  private func message(_ role: String, _ text: String) -> AIChatMessage {
    AIChatMessage(role: role, parts: [.init(text: text)])
  }

  func testKeepsTheNewestTwentyMessagesStartingWithTheUser() {
    let history = (0..<25).map { index in
      message(index.isMultiple(of: 2) ? "user" : "model", "m\(index)")
    }

    let trimmed = FirebaseAIRepo.trimmedHistory(history)

    XCTAssertLessThanOrEqual(trimmed.count, 20)
    XCTAssertEqual(trimmed.first?.role, "user")
    XCTAssertEqual(trimmed.last?.text, "m24")
  }

  func testDropsOldMessagesOverTheCharacterLimit() {
    let long = String(repeating: "a", count: 5000)
    let history = [
      message("user", long), message("model", long), message("user", long), message("model", "ok"),
    ]

    let trimmed = FirebaseAIRepo.trimmedHistory(history)

    XCTAssertLessThanOrEqual(trimmed.reduce(0) { $0 + $1.text.count }, 12_000)
    XCTAssertEqual(trimmed.first?.role, "user")
    XCTAssertEqual(trimmed.last?.text, "ok")
  }
}

@MainActor
final class PasswordResetTests: XCTestCase {
  func testEmailCheck() {
    XCTAssertTrue(AuthViewModel.looksLikeEmail("ana@vinctus.app"))
    XCTAssertFalse(AuthViewModel.looksLikeEmail(""))
    XCTAssertFalse(AuthViewModel.looksLikeEmail("ana"))
    XCTAssertFalse(AuthViewModel.looksLikeEmail("ana@vinctus"))
    XCTAssertFalse(AuthViewModel.looksLikeEmail("ana @vinctus.app"))
  }

  func testFirebaseErrorsAreShownInSpanish() {
    func error(_ code: AuthErrorCode) -> NSError {
      NSError(domain: AuthErrorDomain, code: code.rawValue)
    }

    XCTAssertEqual(AuthViewModel.message(for: error(.invalidEmail)), "Escribe un email válido.")
    XCTAssertEqual(AuthViewModel.message(for: error(.wrongPassword)), "Email o contraseña incorrectos.")
    XCTAssertTrue(AuthViewModel.message(for: error(.userDisabled)).hasPrefix("Tu cuenta fue suspendida"))
  }
}

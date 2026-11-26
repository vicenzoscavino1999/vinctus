import XCTest
@testable import VinctusNative

/// Same cases as the web's `src/features/chat/lib/messageRuns.test.ts`.
final class ChatMessageRunsTests: XCTestCase {
  private var calendar: Calendar = {
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = TimeZone(identifier: "America/Lima")!
    return calendar
  }()

  private func date(_ day: Int, _ hour: Int, _ minute: Int, year: Int = 2026, month: Int = 11) -> Date {
    calendar.date(from: DateComponents(year: year, month: month, day: day, hour: hour, minute: minute))!
  }

  private func message(_ id: String, _ sender: String, _ createdAt: Date) -> ChatMessage {
    ChatMessage(id: id, senderID: sender, senderName: sender, text: id, hasAttachments: false, createdAt: createdAt)
  }

  func testConsecutiveMessagesFromTheSameSenderJoinOneRun() {
    let runs = ChatMessageRuns.describe([
      message("a", "ana", date(20, 10, 0)),
      message("b", "ana", date(20, 10, 1)),
      message("c", "ana", date(20, 10, 2)),
    ], calendar: calendar)

    XCTAssertEqual(runs["a"], ChatMessageRun(showsDay: true, joinsPrevious: false, joinsNext: true))
    XCTAssertEqual(runs["b"], ChatMessageRun(showsDay: false, joinsPrevious: true, joinsNext: true))
    XCTAssertEqual(runs["c"], ChatMessageRun(showsDay: false, joinsPrevious: true, joinsNext: false))
  }

  func testAnotherSenderOrALongGapStartsANewRun() {
    let runs = ChatMessageRuns.describe([
      message("a", "ana", date(20, 10, 0)),
      message("b", "bob", date(20, 10, 1)),
      message("c", "bob", date(20, 10, 6)),
    ], calendar: calendar)

    XCTAssertEqual(runs["b"]?.joinsPrevious, false)
    XCTAssertEqual(runs["c"]?.joinsPrevious, false, "Five minutes apart is a new run")
  }

  func testTheFirstMessageOfEachDayShowsTheSeparator() {
    let runs = ChatMessageRuns.describe([
      message("a", "ana", date(20, 23, 58)),
      message("b", "ana", date(21, 0, 1)),
    ], calendar: calendar)

    XCTAssertEqual(runs["a"]?.showsDay, true)
    XCTAssertEqual(runs["b"]?.showsDay, true)
    XCTAssertEqual(runs["b"]?.joinsPrevious, false, "A new day starts a new run")
  }

  func testDayLabels() {
    let now = date(25, 18, 0)
    XCTAssertEqual(ChatMessageRuns.dayLabel(date(25, 8, 0), now: now, calendar: calendar), "Hoy")
    XCTAssertEqual(ChatMessageRuns.dayLabel(date(24, 23, 0), now: now, calendar: calendar), "Ayer")
    XCTAssertTrue(ChatMessageRuns.dayLabel(date(21, 12, 0), now: now, calendar: calendar).hasPrefix("Sábado"))
    XCTAssertFalse(ChatMessageRuns.dayLabel(date(2, 12, 0, month: 10), now: now, calendar: calendar).contains("2026"))
    XCTAssertTrue(ChatMessageRuns.dayLabel(date(2, 12, 0, year: 2025, month: 10), now: now, calendar: calendar).contains("2025"))
  }
}

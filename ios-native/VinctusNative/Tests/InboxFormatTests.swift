import XCTest
@testable import VinctusNative

final class InboxFormatTests: XCTestCase {
  private let calendar = Calendar(identifier: .gregorian)

  private func date(_ day: Int, _ hour: Int, _ minute: Int = 0, month: Int = 11) throws -> Date {
    try XCTUnwrap(
      calendar.date(from: DateComponents(year: 2026, month: month, day: day, hour: hour, minute: minute))
    )
  }

  private func conversation(
    isGroup: Bool = false,
    title: String = "Mateo Rojas",
    text: String? = "hola",
    sender: String? = "u2"
  ) -> ChatConversation {
    ChatConversation(
      id: isGroup ? "grp_g" : "dm_me_u2", isGroup: isGroup, title: title, photoURL: nil,
      otherUserID: isGroup ? nil : "u2", groupID: isGroup ? "g" : nil, lastMessageText: text,
      lastMessageSenderID: sender, updatedAt: Date()
    )
  }

  func testTimeIsShortLikeTheWeb() throws {
    let now = try date(26, 18) // Thursday
    XCTAssertEqual(InboxFormat.time(try date(26, 9, 5), now: now, calendar: calendar), "09:05")
    XCTAssertEqual(InboxFormat.time(try date(25, 23), now: now, calendar: calendar), "Ayer")
    XCTAssertEqual(InboxFormat.time(try date(23, 12), now: now, calendar: calendar), "Lun")
    XCTAssertEqual(InboxFormat.time(try date(12, 12), now: now, calendar: calendar), "12 nov")
    XCTAssertEqual(InboxFormat.time(.distantPast, now: now, calendar: calendar), "")
  }

  func testPreviewMarksYourOwnMessage() {
    XCTAssertEqual(InboxFormat.preview(conversation(sender: "me"), uid: "me"), "Tú: hola")
    XCTAssertEqual(InboxFormat.preview(conversation(sender: "u2"), uid: "me"), "hola")
    XCTAssertEqual(InboxFormat.preview(conversation(text: "  ", sender: "u2"), uid: "me"), "Archivo adjunto")
  }

  func testPreviewWithoutMessages() {
    XCTAssertEqual(InboxFormat.preview(conversation(text: nil), uid: "me"), "Empieza la conversación")
    XCTAssertEqual(InboxFormat.preview(conversation(isGroup: true, text: nil), uid: "me"), "Chat del grupo")
  }

  func testSearchIgnoresCaseAndAccents() {
    XCTAssertTrue(InboxFormat.matches("Física Cuántica", query: "fisica"))
    XCTAssertTrue(InboxFormat.matches("Bob Núñez", query: "NUNEZ"))
    XCTAssertTrue(InboxFormat.matches("Ana", query: "  "))
    XCTAssertFalse(InboxFormat.matches("Ana", query: "bob"))
  }

  func testFiltersKeepTheirKind() {
    XCTAssertTrue(InboxFilter.all.includes(conversation(isGroup: true)))
    XCTAssertTrue(InboxFilter.direct.includes(conversation()))
    XCTAssertFalse(InboxFilter.direct.includes(conversation(isGroup: true)))
    XCTAssertTrue(InboxFilter.group.includes(conversation(isGroup: true)))
    XCTAssertEqual(InboxFilter.allCases.map(\.label), ["Todos", "Privados", "Grupos"])
  }
}

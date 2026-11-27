import XCTest

/// The chat details, against SCREENSHOTS builds and sample data only.
final class ChatDetailsUITests: XCTestCase {
  private var app: XCUIApplication!

  override func setUp() {
    super.setUp()
    continueAfterFailure = false
    app = XCUIApplication()
  }

  override func tearDown() {
    let screenshot = XCTAttachment(screenshot: app.screenshot())
    screenshot.name = name
    screenshot.lifetime = .keepAlways
    add(screenshot)
    app.terminate()
    super.tearDown()
  }

  /// The header opens the details; Silenciar offers the times and turns into Quitar silencio; a
  /// search result goes back to the chat.
  func testTheChatHeaderOpensTheDetails() {
    app.launchArguments = ["-VinctusDemo", "-VinctusTab", "messages", "-VinctusOpenChat", "dm_me_u2"]
    app.launch()

    let header = app.buttons["chat-details-open"]
    XCTAssertTrue(header.waitForExistence(timeout: 45))
    header.tap()
    XCTAssertTrue(app.navigationBars["Detalles del chat"].waitForExistence(timeout: 10))
    XCTAssertTrue(app.buttons["Ver perfil"].exists)
    XCTAssertTrue(app.buttons["Bloquear a Mateo Rojas"].exists || app.buttons.matching(
      NSPredicate(format: "label BEGINSWITH 'Bloquear a'")
    ).firstMatch.exists)

    app.buttons["chat-details-mute"].tap()
    let oneHour = app.buttons["1 hora"]
    XCTAssertTrue(oneHour.waitForExistence(timeout: 5))
    oneHour.tap()
    XCTAssertTrue(app.buttons["Quitar silencio"].waitForExistence(timeout: 5))

    app.buttons["Buscar en la conversación"].tap()
    let field = app.searchFields["Buscar mensajes"]
    XCTAssertTrue(field.waitForExistence(timeout: 5))
    field.tap()
    field.typeText("observatorio")
    let result = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "observatorio")).firstMatch
    XCTAssertTrue(result.waitForExistence(timeout: 5))
    result.tap()

    XCTAssertTrue(app.buttons["chat-details-open"].waitForExistence(timeout: 10), "Back in the chat")
    XCTAssertFalse(app.navigationBars["Detalles del chat"].exists)
  }

  /// A member of a group sees Salir del grupo apart, in the destructive block.
  func testGroupDetailsShowTheGroupOptions() {
    app.launchArguments = ["-VinctusDemo", "-VinctusTab", "messages", "-VinctusOpenChat", "grp_g2",
                           "-VinctusOpenChatDetails", "1"]
    app.launch()

    XCTAssertTrue(app.navigationBars["Detalles del grupo"].waitForExistence(timeout: 45))
    XCTAssertTrue(app.buttons["Ver grupo"].exists)
    XCTAssertTrue(app.buttons["Reportar grupo"].waitForExistence(timeout: 10))
    XCTAssertTrue(app.buttons["Compartir enlace"].exists)
  }
}

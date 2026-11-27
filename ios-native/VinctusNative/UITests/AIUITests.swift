import XCTest

/// Chat con IA and Arena IA, against SCREENSHOTS builds and the sample AI repo only.
final class AIUITests: XCTestCase {
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

  /// A suggestion fills the field; the reply offers Ver grupo, Copiar and Denunciar.
  func testTheChatAnswersWithItsActions() {
    app.launchArguments = ["-VinctusDemo", "-VinctusOpenAI", "chat"]
    app.launch()

    XCTAssertTrue(app.navigationBars["Chat con IA"].waitForExistence(timeout: 45))
    let suggestion = app.buttons["Crea un grupo sobre astronomía"]
    XCTAssertTrue(suggestion.waitForExistence(timeout: 10))
    suggestion.tap()
    app.buttons["Enviar"].tap()

    XCTAssertTrue(app.buttons["Copiar respuesta"].waitForExistence(timeout: 10))
    XCTAssertTrue(app.buttons["Denunciar respuesta"].exists)
    XCTAssertTrue(app.buttons["Ver grupo"].exists)
    XCTAssertTrue(app.buttons["Nueva conversación"].exists)
  }

  /// An idea fills the topic; the debate ends in the verdict, and Nuevo debate goes back.
  func testArenaShowsTheVerdictAndStartsAgain() {
    app.launchArguments = ["-VinctusDemo", "-VinctusOpenAI", "arena"]
    app.launch()

    XCTAssertTrue(app.navigationBars["Arena IA"].waitForExistence(timeout: 45))
    let idea = app.buttons["El trabajo remoto es mejor que el presencial."]
    XCTAssertTrue(idea.waitForExistence(timeout: 10))
    idea.tap()
    app.buttons["Iniciar debate"].tap()

    XCTAssertTrue(app.staticTexts["Ganador: El Cientifico"].waitForExistence(timeout: 10))
    app.buttons["Nuevo debate"].tap()
    XCTAssertTrue(app.buttons["Iniciar debate"].waitForExistence(timeout: 5))
  }
}

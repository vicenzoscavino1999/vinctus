import XCTest

/// A category, against SCREENSHOTS builds and sample data only.
final class CategoryUITests: XCTestCase {
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

  /// En vivo shows first; Comunidades and Biblioteca show their content once opened.
  func testTheTabsShowTheirContent() {
    app.launchArguments = ["-VinctusDemo", "-VinctusOpenCategory", "science"]
    app.launch()

    let live = app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH 'Hallazgos recientes'")).firstMatch
    XCTAssertTrue(live.waitForExistence(timeout: 45))
    XCTAssertTrue(app.buttons["Seguir categoría"].exists || app.buttons["Siguiendo"].exists)

    app.buttons["Comunidades"].tap()
    XCTAssertTrue(app.staticTexts["Física para curiosos"].waitForExistence(timeout: 10))

    app.buttons["Biblioteca"].tap()
    XCTAssertTrue(app.staticTexts["Lectura recomendada de la comunidad"].waitForExistence(timeout: 10))
  }
}

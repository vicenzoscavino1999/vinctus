import XCTest

/// The welcome of a new account, against SCREENSHOTS builds and sample data only.
final class OnboardingUITests: XCTestCase {
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

  /// Two interests unlock Continuar; real groups follow; Empezar opens the app.
  func testTheWelcomeLeadsIntoTheApp() {
    app.launchArguments = ["-VinctusDemo", "-VinctusShowWelcome", "1"]
    app.launch()

    let next = app.buttons["Continuar"]
    XCTAssertTrue(next.waitForExistence(timeout: 45))
    next.tap()

    let interests = app.buttons.matching(NSPredicate(format: "label == 'Ciencia & Materia' OR label == 'Acústica & Arte' OR label == 'Legado & Tiempo'"))
    XCTAssertTrue(interests.firstMatch.waitForExistence(timeout: 10))
    interests.element(boundBy: 0).tap()
    XCTAssertFalse(next.isEnabled, "At least two interests")
    interests.element(boundBy: 1).tap()
    next.tap()

    let start = app.buttons["Empezar"]
    XCTAssertTrue(start.waitForExistence(timeout: 10))
    start.tap()
    XCTAssertTrue(app.buttons["tab-discover"].waitForExistence(timeout: 15))
  }
}

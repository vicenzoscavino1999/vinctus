import XCTest

/// The bottom bar and scrolling, against SCREENSHOTS builds and sample data only.
final class NavigationUITests: XCTestCase {
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

  /// The end of a long screen rests above the bar after scrolling, instead of bouncing back
  /// under it.
  func testTheEndOfAScreenStaysAboveTheBottomBar() {
    app.launchArguments = ["-VinctusDemo", "-VinctusTab", "profile"]
    app.launch()
    let profileTab = app.buttons["tab-profile"]
    XCTAssertTrue(profileTab.waitForExistence(timeout: 45))
    let lastLine = app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH 'Se unió en'")).firstMatch
    XCTAssertTrue(lastLine.waitForExistence(timeout: 20))

    for _ in 0..<12 {
      app.swipeUp()
    }
    // Let the scroll settle after the last release.
    sleep(2)

    XCTAssertLessThanOrEqual(
      lastLine.frame.maxY,
      profileTab.frame.minY + 1,
      "The last line must stay visible above the bottom bar"
    )
  }

  /// The Mensajes search sits under the title and can be used, instead of behind the bar
  /// (where iOS 26 puts searchable fields by default).
  func testTheMessagesSearchIsAboveTheBottomBar() {
    app.launchArguments = ["-VinctusDemo", "-VinctusTab", "messages"]
    app.launch()
    let messagesTab = app.buttons["tab-messages"]
    XCTAssertTrue(messagesTab.waitForExistence(timeout: 45))
    let search = app.searchFields["Buscar conversaciones o grupos"]
    XCTAssertTrue(search.waitForExistence(timeout: 20))

    XCTAssertTrue(search.isHittable, "The search field must be tappable")
    XCTAssertLessThan(search.frame.maxY, messagesTab.frame.minY, "The search must not sit behind the bar")
    XCTAssertLessThan(search.frame.minY, app.frame.height / 2, "The search goes under the title")

    search.tap()
    search.typeText("Mateo")
    XCTAssertTrue(app.staticTexts["Mateo Rojas"].waitForExistence(timeout: 5))
    XCTAssertFalse(app.staticTexts["Diego Salazar"].exists, "The search filters the list")
  }

  /// Each tab opens from the web-style bar, with no system tab bar behind it that could flash.
  func testSwitchingTabsUsesOnlyTheWebStyleBar() {
    app.launchArguments = ["-VinctusDemo", "-VinctusTab", "discover"]
    app.launch()
    XCTAssertTrue(app.buttons["tab-search"].waitForExistence(timeout: 45))

    for tab in ["search", "messages", "connections", "profile", "discover"] {
      let button = app.buttons["tab-\(tab)"]
      button.tap()
      XCTAssertTrue(button.isSelected, "\(tab) should be the selected tab")
      XCTAssertFalse(app.tabBars.firstMatch.exists, "No system tab bar after opening \(tab)")
    }
  }
}

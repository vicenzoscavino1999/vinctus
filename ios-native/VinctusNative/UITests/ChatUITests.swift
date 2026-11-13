import XCTest

/// Runs only against SCREENSHOTS builds and sample repositories, never a real account.
final class ChatUITests: XCTestCase {
  private var app: XCUIApplication!

  override func setUp() {
    super.setUp()
    continueAfterFailure = false
    app = XCUIApplication()
    app.launchArguments = ["-VinctusDemo", "-VinctusTab", "messages"]
  }

  override func tearDown() {
    let screenshot = XCTAttachment(screenshot: app.screenshot())
    screenshot.name = name
    screenshot.lifetime = .keepAlways
    add(screenshot)
    if testRun?.hasSucceeded == false {
      let tree = XCTAttachment(string: app.debugDescription)
      tree.name = "Accessibility tree"
      tree.lifetime = .keepAlways
      add(tree)
    }
    app.terminate()
    super.tearDown()
  }

  func testConversationOpensFromTheListWithMediaControls() {
    openFromList()
    XCTAssertTrue(app.buttons["Adjuntar fotos o videos"].exists)
    XCTAssertTrue(app.buttons["Grabar nota de voz"].exists)
    XCTAssertTrue(app.buttons["Grabar nota de voz"].isHittable)
    XCTAssertFalse(app.buttons["Perfil"].exists)
    XCTAssertTrue(app.staticTexts["¿Viste la luna anoche?"].exists)
  }

  func testDemoDeepLinkRendersTheConversation() {
    app.launchArguments += ["-VinctusOpenChat", "dm_me_u2"]
    app.launch()
    XCTAssertTrue(app.buttons["Enviar"].waitForExistence(timeout: 45))
    XCTAssertTrue(app.buttons["Adjuntar fotos o videos"].exists)
  }

  func testVoiceRecordingProducesAnAttachmentForPreview() {
    openFromList()
    app.buttons["Grabar nota de voz"].tap()
    // The permission request is asynchronous. An immediate app.tap() can run before
    // SpringBoard presents the alert, leaving the permission unanswered.
    let permissionAlert = XCUIApplication(bundleIdentifier: "com.apple.springboard").alerts.firstMatch
    if permissionAlert.waitForExistence(timeout: 10) {
      let allow = permissionAlert.buttons.matching(NSPredicate(format: "label == 'Allow' OR label == 'Permitir' OR label == 'OK' OR label == 'Aceptar'")).firstMatch
      XCTAssertTrue(allow.exists)
      allow.tap()
    }
    XCTAssertTrue(app.buttons["Terminar"].waitForExistence(timeout: 20))
    sleep(2)
    app.buttons["Terminar"].tap()
    XCTAssertTrue(app.buttons["Quitar Nota de voz.m4a"].waitForExistence(timeout: 10))
    XCTAssertTrue(app.buttons["Enviar"].isEnabled)
    app.buttons.containing(.staticText, identifier: "Nota de voz.m4a").firstMatch.tap()
    XCTAssertTrue(app.buttons["Cerrar"].waitForExistence(timeout: 10))
    XCTAssertTrue(app.navigationBars["Nota de voz.m4a"].exists)
  }

  private func openFromList() {
    app.launch()
    let person = app.staticTexts["Mateo Rojas"].firstMatch
    XCTAssertTrue(person.waitForExistence(timeout: 45))
    person.tap()
    XCTAssertTrue(app.buttons["Enviar"].waitForExistence(timeout: 45))
  }
}

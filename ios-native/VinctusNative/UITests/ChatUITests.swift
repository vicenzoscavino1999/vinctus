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
    // With an empty draft the composer shows the mic; "Enviar" appears once there is something to send.
    XCTAssertTrue(app.buttons["Grabar nota de voz"].waitForExistence(timeout: 45))
    XCTAssertTrue(app.buttons["Adjuntar fotos o videos"].exists)
    XCTAssertFalse(app.buttons["Enviar"].exists)
  }

  func testVoiceRecordingProducesAnAttachmentForPreview() {
    openFromList()
    let mic = app.buttons["Grabar nota de voz"]
    XCTAssertTrue(mic.waitForExistence(timeout: 15))
    let micReady = NSPredicate(format: "exists == true AND hittable == true AND enabled == true")
    expectation(for: micReady, evaluatedWith: mic)
    waitForExpectations(timeout: 10)
    mic.tap()

    let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
    let permissionAlert = springboard.alerts.firstMatch
    let finishButton = app.buttons["Terminar"]

    let handlePermissionIfShown: (TimeInterval) -> Bool = { timeout in
      guard permissionAlert.waitForExistence(timeout: timeout) else { return false }
      let allow = permissionAlert.buttons.matching(
        NSPredicate(
          format:
            "label == 'Allow' OR label == 'Permitir' OR label == 'OK' OR label == 'Aceptar' OR label == 'Allow While Using App' OR label == 'Permitir al usar la app'"
        )
      ).firstMatch
      XCTAssertTrue(allow.waitForExistence(timeout: 5))
      allow.tap()
      return true
    }

    // The permission request is asynchronous; if the first tap fired before the push
    // transition finished settling and neither the alert nor the recorder bar appeared,
    // retry the tap once.
    if !handlePermissionIfShown(8) && !finishButton.waitForExistence(timeout: 3) {
      if mic.exists && mic.isEnabled && mic.isHittable {
        mic.tap()
        _ = handlePermissionIfShown(8)
      }
    }

    XCTAssertTrue(finishButton.waitForExistence(timeout: 20))
    sleep(2)
    finishButton.tap()
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
    XCTAssertTrue(app.buttons["Grabar nota de voz"].waitForExistence(timeout: 45))
    // Wait for the bottom tab bar to finish hiding after navigation push.
    let tabHidden = NSPredicate(format: "exists == false")
    expectation(for: tabHidden, evaluatedWith: app.buttons["Perfil"])
    waitForExpectations(timeout: 10)
  }
}

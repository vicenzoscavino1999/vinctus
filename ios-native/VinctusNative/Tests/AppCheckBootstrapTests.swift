import XCTest
@testable import VinctusNative

final class AppCheckBootstrapTests: XCTestCase {
  func testEnabledParsingDefaultsToTrueAndRespectsExplicitDisable() {
    XCTAssertTrue(AppCheckBootstrap.isEnabled(from: nil))
    XCTAssertTrue(AppCheckBootstrap.isEnabled(from: [:]))
    XCTAssertTrue(AppCheckBootstrap.isEnabled(from: ["VINCTUS_ENABLE_APP_CHECK": true]))
    XCTAssertTrue(AppCheckBootstrap.isEnabled(from: ["VINCTUS_ENABLE_APP_CHECK": "true"]))
    XCTAssertFalse(AppCheckBootstrap.isEnabled(from: ["VINCTUS_ENABLE_APP_CHECK": false]))
    XCTAssertFalse(AppCheckBootstrap.isEnabled(from: ["VINCTUS_ENABLE_APP_CHECK": "false"]))
    XCTAssertFalse(AppCheckBootstrap.isEnabled(from: ["VINCTUS_ENABLE_APP_CHECK": "0"]))
  }

  func testProviderModeParsingNormalizesValues() {
    XCTAssertEqual(AppCheckBootstrap.providerMode(from: nil), .auto)
    XCTAssertEqual(AppCheckBootstrap.providerMode(from: ["VINCTUS_APP_CHECK_PROVIDER": "auto"]), .auto)
    XCTAssertEqual(AppCheckBootstrap.providerMode(from: ["VINCTUS_APP_CHECK_PROVIDER": "disabled"]), .disabled)
    XCTAssertEqual(AppCheckBootstrap.providerMode(from: ["VINCTUS_APP_CHECK_PROVIDER": "debug"]), .debug)
    XCTAssertEqual(AppCheckBootstrap.providerMode(from: ["VINCTUS_APP_CHECK_PROVIDER": "deviceCheck"]), .deviceCheck)
    XCTAssertEqual(AppCheckBootstrap.providerMode(from: ["VINCTUS_APP_CHECK_PROVIDER": "appAttest"]), .appAttest)
    XCTAssertEqual(AppCheckBootstrap.providerMode(from: ["VINCTUS_APP_CHECK_PROVIDER": "app-attest"]), .appAttest)
  }

  func testResolveProviderUsesDebugOnSimulatorAndDeviceCheckForAutoReleaseDevice() {
    XCTAssertEqual(
      AppCheckBootstrap.resolveProvider(enabled: false, mode: .auto, isDebugBuild: false, isSimulator: false),
      .none
    )
    XCTAssertEqual(
      AppCheckBootstrap.resolveProvider(enabled: true, mode: .disabled, isDebugBuild: false, isSimulator: false),
      .none
    )
    XCTAssertEqual(
      AppCheckBootstrap.resolveProvider(enabled: true, mode: .auto, isDebugBuild: false, isSimulator: true),
      .debug
    )
    XCTAssertEqual(
      AppCheckBootstrap.resolveProvider(enabled: true, mode: .appAttest, isDebugBuild: false, isSimulator: true),
      .debug
    )
    XCTAssertEqual(
      AppCheckBootstrap.resolveProvider(enabled: true, mode: .auto, isDebugBuild: true, isSimulator: false),
      .debug
    )
    XCTAssertEqual(
      AppCheckBootstrap.resolveProvider(enabled: true, mode: .auto, isDebugBuild: false, isSimulator: false),
      .deviceCheck
    )
    XCTAssertEqual(
      AppCheckBootstrap.resolveProvider(enabled: true, mode: .appAttest, isDebugBuild: false, isSimulator: false),
      .appAttestWithDeviceCheckFallback
    )
    XCTAssertEqual(
      AppCheckBootstrap.resolveProvider(enabled: true, mode: .deviceCheck, isDebugBuild: true, isSimulator: false),
      .deviceCheck
    )
  }

  func testOptionalTokenHeaderReturnsNilWhenFirebaseNotConfigured() async {
    let token = await AppCheckBootstrap.optionalTokenHeader()
    XCTAssertNil(token)
  }

  func testWithTimeoutReturnsValueBeforeDeadlineAndNilOnTimeout() async {
    let fast = await AppCheckBootstrap.withTimeout(seconds: 0.5) {
      "app-check-tok"
    }
    XCTAssertEqual(fast, "app-check-tok")

    let slow: String? = await AppCheckBootstrap.withTimeout(seconds: 0.05) {
      try? await Task.sleep(nanoseconds: 2_000_000_000)
      return "too-late"
    }
    XCTAssertNil(slow)
  }

  func testFirebaseBootstrapProjectGuardPreventsCrossEnvironmentMistakes() {
    XCTAssertTrue(FirebaseBootstrap.isProjectAllowed("vinctus-staging", for: .staging))
    XCTAssertFalse(FirebaseBootstrap.isProjectAllowed("vinctus-daf32", for: .staging))
    XCTAssertFalse(FirebaseBootstrap.isProjectAllowed(nil, for: .staging))

    XCTAssertTrue(FirebaseBootstrap.isProjectAllowed("vinctus-daf32", for: .prod))
    XCTAssertFalse(FirebaseBootstrap.isProjectAllowed("vinctus-staging", for: .prod))
    XCTAssertFalse(FirebaseBootstrap.isProjectAllowed("", for: .prod))
    XCTAssertFalse(FirebaseBootstrap.isProjectAllowed(nil, for: .prod))

    XCTAssertTrue(FirebaseBootstrap.isProjectAllowed("vinctus-dev", for: .dev))
    XCTAssertFalse(FirebaseBootstrap.isProjectAllowed("   ", for: .dev))
  }
}

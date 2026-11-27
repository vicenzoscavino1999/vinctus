import XCTest
@testable import VinctusNative

final class AppAppearanceTests: XCTestCase {
  func testTheChoicesAndTheirNames() {
    XCTAssertEqual(AppAppearance.allCases.map(\.label), ["Clásico", "Vidrio"])
    XCTAssertEqual(AppAppearance(rawValue: "glass"), .glass)
    XCTAssertNil(AppAppearance(rawValue: "otro"))
  }

  func testClassicNeverUsesGlass() {
    XCTAssertFalse(AppAppearance.usesGlass(saved: AppAppearance.classic.rawValue))
    XCTAssertFalse(AppAppearance.usesGlass(saved: "desconocido"))
  }

  func testGlassFollowsTheSystemVersion() {
    XCTAssertEqual(AppAppearance.usesGlass(saved: AppAppearance.glass.rawValue), AppAppearance.isGlassAvailable)
  }
}

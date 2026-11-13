import SwiftUI

private struct SetBottomNavigationHiddenKey: EnvironmentKey {
  static let defaultValue: (Bool) -> Void = { _ in }
}

extension EnvironmentValues {
  /// A pushed screen can reserve the bottom of the window for its own controls.
  var setBottomNavigationHidden: (Bool) -> Void {
    get { self[SetBottomNavigationHiddenKey.self] }
    set { self[SetBottomNavigationHiddenKey.self] = newValue }
  }
}

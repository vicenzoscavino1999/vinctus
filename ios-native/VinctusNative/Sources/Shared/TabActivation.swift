import SwiftUI

private struct IsActiveTabKey: EnvironmentKey {
  static let defaultValue = true
}

extension EnvironmentValues {
  /// False while a screen's tab is kept alive behind the selected one (see MainTabView).
  var isActiveTab: Bool {
    get { self[IsActiveTabKey.self] }
    set { self[IsActiveTabKey.self] = newValue }
  }
}

/// Tabs stay alive when you leave them, so a screen's `.task` does not run again when you come
/// back to it. This runs `action` each time its tab is opened again, as a system tab bar did by
/// showing the screen anew. A tab built in the background is not reloaded the first time it opens
/// if it loaded less than `freshFor` seconds before.
private struct RefreshOnTabReturn: ViewModifier {
  @Environment(\.isActiveTab) private var isActiveTab
  @State private var builtHiddenAt: Date?
  let freshFor: TimeInterval
  let action: () async -> Void

  func body(content: Content) -> some View {
    content
      .onAppear {
        if !isActiveTab, builtHiddenAt == nil {
          builtHiddenAt = Date()
        }
      }
      .onChange(of: isActiveTab) { _, isActive in
        guard isActive else { return }
        if let builtHiddenAt, Date().timeIntervalSince(builtHiddenAt) < freshFor {
          self.builtHiddenAt = nil
          return
        }
        builtHiddenAt = nil
        Task { await action() }
      }
  }
}

extension View {
  /// Reloads the screen's data when its tab is opened again. See `RefreshOnTabReturn`.
  func refreshOnTabReturn(freshFor: TimeInterval = 30, _ action: @escaping () async -> Void) -> some View {
    modifier(RefreshOnTabReturn(freshFor: freshFor, action: action))
  }
}

import SwiftUI

/// How the app's own bars and buttons look: "Clásico", the web's flat look (the default), or
/// "Vidrio", Apple's Liquid Glass from iOS 26. People choose it in Ajustes > Apariencia; on
/// earlier iOS versions the app stays Clásico.
enum AppAppearance: String, CaseIterable, Identifiable {
  case classic
  case glass

  static let storageKey = "vinctus.appearance"

  var id: String { rawValue }

  var label: String {
    switch self {
    case .classic: return "Clásico"
    case .glass: return "Vidrio"
    }
  }

  /// Liquid Glass exists from iOS 26.
  static var isGlassAvailable: Bool {
    if #available(iOS 26.0, *) { return true }
    return false
  }

  /// Whether the bars use glass: the saved choice, or `-VinctusAppearance glass` in screenshot
  /// builds, and only where iOS supports it.
  static func usesGlass(saved: String) -> Bool {
    let choice = AppRepos.demoArgument("-VinctusAppearance") ?? saved
    return isGlassAvailable && AppAppearance(rawValue: choice) == .glass
  }
}

private struct UsesGlassKey: EnvironmentKey {
  static let defaultValue = false
}

extension EnvironmentValues {
  /// True when the person chose "Vidrio" and the device runs iOS 26.
  var usesGlass: Bool {
    get { self[UsesGlassKey.self] }
    set { self[UsesGlassKey.self] = newValue }
  }
}

extension View {
  /// Liquid Glass in `shape` when `enabled` (iOS 26); otherwise `fallback` fills the shape.
  @ViewBuilder
  func vinctusGlass<S: Shape>(_ enabled: Bool, in shape: S, fallback: SwiftUI.Color = .clear) -> some View {
    if enabled {
      if #available(iOS 26.0, *) {
        self.glassEffect(.regular, in: shape)
      } else {
        self.background(fallback, in: shape)
      }
    } else {
      self.background(fallback, in: shape)
    }
  }

  /// A round control in glass when `enabled` (iOS 26), tinted for the main action.
  @ViewBuilder
  func vinctusGlassCircle(_ enabled: Bool, tint: SwiftUI.Color? = nil) -> some View {
    if enabled {
      if #available(iOS 26.0, *) {
        if let tint {
          self.glassEffect(.regular.tint(tint).interactive(), in: Circle())
        } else {
          self.glassEffect(.regular.interactive(), in: Circle())
        }
      } else {
        self
      }
    } else {
      self
    }
  }
}

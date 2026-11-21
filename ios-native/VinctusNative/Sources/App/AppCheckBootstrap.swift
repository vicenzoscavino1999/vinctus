import FirebaseAppCheck
import FirebaseCore
import Foundation
import OSLog

enum AppCheckProviderMode: String, Equatable {
  case disabled
  case auto
  case debug
  case deviceCheck
  case appAttest
}

enum AppCheckResolvedProvider: String, Equatable {
  case none
  case debug
  case deviceCheck
  case appAttestWithDeviceCheckFallback
}

final class VinctusAppCheckProviderFactory: NSObject, AppCheckProviderFactory {
  private let resolvedProvider: AppCheckResolvedProvider

  init(resolvedProvider: AppCheckResolvedProvider) {
    self.resolvedProvider = resolvedProvider
    super.init()
  }

  func createProvider(with app: FirebaseApp) -> AppCheckProvider? {
    switch resolvedProvider {
    case .none:
      return nil
    case .debug:
      return AppCheckDebugProvider(app: app)
    case .deviceCheck:
      return DeviceCheckProvider(app: app)
    case .appAttestWithDeviceCheckFallback:
      if #available(iOS 14.0, *) {
        return AppAttestProvider(app: app) ?? DeviceCheckProvider(app: app)
      }
      return DeviceCheckProvider(app: app)
    }
  }
}

enum AppCheckBootstrap {
  private static let lock = NSLock()
  private static var activeFlag = false

  static var isActive: Bool {
    lock.lock()
    defer { lock.unlock() }
    return activeFlag
  }

  private static func setActive(_ value: Bool) {
    lock.lock()
    activeFlag = value
    lock.unlock()
  }

  static func isEnabled(from infoDictionary: [String: Any]?) -> Bool {
    guard let raw = infoDictionary?["VINCTUS_ENABLE_APP_CHECK"] else { return true }
    if let flag = raw as? Bool { return flag }
    if let number = raw as? NSNumber { return number.boolValue }
    if let text = raw as? String {
      switch text.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() {
      case "false", "0", "no", "off":
        return false
      case "true", "1", "yes", "on":
        return true
      default:
        return true
      }
    }
    return true
  }

  static func providerMode(from infoDictionary: [String: Any]?) -> AppCheckProviderMode {
    guard let raw = infoDictionary?["VINCTUS_APP_CHECK_PROVIDER"] as? String else { return .auto }
    switch raw.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() {
    case "disabled", "none", "off":
      return .disabled
    case "debug":
      return .debug
    case "devicecheck", "device_check", "device-check":
      return .deviceCheck
    case "appattest", "app_attest", "app-attest":
      return .appAttest
    default:
      return .auto
    }
  }

  /// Resolves the App Check provider cleanly for the current runtime.
  /// - In `auto` mode: Debug and Simulator builds use `AppCheckDebugProvider`; Release device builds
  ///   use `DeviceCheckProvider` (monitoring-safe with the existing App Store provisioning profile,
  ///   requiring no extra entitlements until App Attest is enabled on the App ID and profile).
  /// - Setting `VINCTUS_APP_CHECK_PROVIDER=appAttest` switches real devices to `AppAttestProvider`
  ///   with automatic fallback to `DeviceCheckProvider`.
  static func resolveProvider(
    enabled: Bool,
    mode: AppCheckProviderMode,
    isDebugBuild: Bool,
    isSimulator: Bool
  ) -> AppCheckResolvedProvider {
    guard enabled, mode != .disabled else { return .none }
    if isSimulator {
      return .debug
    }
    switch mode {
    case .disabled:
      return .none
    case .debug:
      return .debug
    case .deviceCheck:
      return .deviceCheck
    case .appAttest:
      return isDebugBuild ? .debug : .appAttestWithDeviceCheckFallback
    case .auto:
      return isDebugBuild ? .debug : .deviceCheck
    }
  }

  static func configureProviderFactoryIfNeeded(
    infoDictionary: [String: Any]? = Bundle.main.infoDictionary
  ) {
    #if DEBUG
    let isDebugBuild = true
    #else
    let isDebugBuild = false
    #endif

    #if targetEnvironment(simulator)
    let isSimulator = true
    #else
    let isSimulator = false
    #endif

    let enabled = isEnabled(from: infoDictionary)
    let mode = providerMode(from: infoDictionary)
    let resolved = resolveProvider(
      enabled: enabled,
      mode: mode,
      isDebugBuild: isDebugBuild,
      isSimulator: isSimulator
    )

    guard resolved != .none else {
      setActive(false)
      AppLog.firebase.info("appCheck.disabled")
      return
    }

    let factory = VinctusAppCheckProviderFactory(resolvedProvider: resolved)
    AppCheck.setAppCheckProviderFactory(factory)
    setActive(true)
    AppLog.firebase.info(
      "appCheck.configured provider=\(resolved.rawValue, privacy: .public)"
    )
  }

  /// Best-effort token fetch for custom HTTPS endpoints (e.g. `readPostMedia`).
  /// Never throws so monitoring mode cannot break media loads if attestation is unavailable.
  static func optionalTokenHeader() async -> String? {
    guard isActive, FirebaseApp.app() != nil else { return nil }
    do {
      let token = try await AppCheck.appCheck().token(forcingRefresh: false)
      let value = token.token.trimmingCharacters(in: .whitespacesAndNewlines)
      return value.isEmpty ? nil : value
    } catch {
      AppLog.firebase.debug("appCheck.optionalToken.unavailable")
      return nil
    }
  }
}

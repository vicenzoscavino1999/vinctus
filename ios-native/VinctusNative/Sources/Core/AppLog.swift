import Foundation
import OSLog

enum AppLog {
  private static let subsystem = Bundle.main.bundleIdentifier ?? "VinctusNative"

  static let app = Logger(subsystem: subsystem, category: "app")
  static let auth = Logger(subsystem: subsystem, category: "auth")
  static let firebase = Logger(subsystem: subsystem, category: "firebase")
  static let discover = Logger(subsystem: subsystem, category: "discover")
  static let groups = Logger(subsystem: subsystem, category: "groups")
  static let posts = Logger(subsystem: subsystem, category: "posts")
  static let profile = Logger(subsystem: subsystem, category: "profile")
  static let ui = Logger(subsystem: subsystem, category: "ui")
  static let settings = Logger(subsystem: subsystem, category: "settings")

  /// Log errors without leaking PII by default.
  static func errorType(_ error: Error) -> String {
    String(reflecting: type(of: error))
  }
}

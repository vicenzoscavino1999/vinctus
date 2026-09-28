import Foundation

enum AppEnvironment: String {
  case dev
  case staging
  case prod

  static var current: AppEnvironment {
    let raw = Bundle.main.object(forInfoDictionaryKey: "VINCTUS_ENV") as? String
    return AppEnvironment(rawValue: raw ?? "") ?? .dev
  }

  var firebasePlistBaseName: String {
    switch self {
    case .dev:
      return "GoogleService-Info-Dev"
    case .staging:
      return "GoogleService-Info-Staging"
    case .prod:
      return "GoogleService-Info-Prod"
    }
  }
}


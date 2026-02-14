import Foundation

enum LegalConfig {
  static var privacyPolicyURL: URL {
    urlValue(for: "VINCTUS_PRIVACY_URL", fallback: "https://vinctus.vercel.app/privacy.html")
  }

  static var termsOfServiceURL: URL {
    urlValue(for: "VINCTUS_TERMS_URL", fallback: "https://vinctus.vercel.app/terms.html")
  }

  static var communityGuidelinesURL: URL {
    urlValue(for: "VINCTUS_COMMUNITY_GUIDELINES_URL", fallback: "https://vinctus.vercel.app/community-guidelines.html")
  }

  static var supportURL: URL {
    urlValue(for: "VINCTUS_SUPPORT_URL", fallback: "https://vinctus.vercel.app/support.html")
  }

  static var supportEmail: String {
    stringValue(for: "VINCTUS_SUPPORT_EMAIL", fallback: "support@vinctus.app")
  }

  static var securityEmail: String {
    stringValue(for: "VINCTUS_SECURITY_EMAIL", fallback: "security@vinctus.app")
  }

  static var aiConsentDescription: String {
    "Debes aceptar el envio de mensajes a proveedores externos de IA antes de usar AI Chat o Arena IA."
  }

  private static func stringValue(for key: String, fallback: String) -> String {
    let raw = (Bundle.main.object(forInfoDictionaryKey: key) as? String)?
      .trimmingCharacters(in: .whitespacesAndNewlines)
    return (raw?.isEmpty == false) ? raw! : fallback
  }

  private static func urlValue(for key: String, fallback: String) -> URL {
    let value = stringValue(for: key, fallback: fallback)
    return URL(string: value) ?? URL(string: fallback)!
  }
}

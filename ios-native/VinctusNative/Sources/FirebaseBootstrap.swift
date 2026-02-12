import Foundation
import FirebaseCore

enum FirebaseBootstrap {
  static func configureIfPossible() {
    guard FirebaseApp.app() == nil else { return }

    // Prefer env-scoped plist.
    let env = AppEnvironment.current
    if let options = optionsFromPlist(named: env.firebasePlistBaseName) {
      FirebaseApp.configure(options: options)
      return
    }

    // Fallback: allow dropping a default GoogleService-Info.plist into Resources.
    if let options = optionsFromPlist(named: "GoogleService-Info") {
      FirebaseApp.configure(options: options)
      return
    }

    // No plist present: keep app runnable, but disable Firebase features.
    NSLog("Firebase not configured (missing GoogleService-Info plist). Env=%{public}@", env.rawValue)
  }

  private static func optionsFromPlist(named baseName: String) -> FirebaseOptions? {
    guard let path = Bundle.main.path(forResource: baseName, ofType: "plist") else { return nil }
    guard let options = FirebaseOptions(contentsOfFile: path) else { return nil }

    // Avoid configuring Firebase with placeholder values.
    let markers = ["REPLACE_ME", "your_", "YOUR_"]
    let values = [options.apiKey, options.googleAppID, options.projectID]
    let isPlaceholder = values
      .compactMap { $0 }
      .contains { v in markers.contains(where: { v.localizedCaseInsensitiveContains($0) }) }
    return isPlaceholder ? nil : options
  }
}


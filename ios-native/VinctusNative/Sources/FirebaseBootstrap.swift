import Foundation
import FirebaseCore
import OSLog

enum FirebaseBootstrap {
  static func configureIfPossible() {
    guard FirebaseApp.app() == nil else { return }

    // Prefer env-scoped plist.
    let env = AppEnvironment.current
    AppLog.firebase.info("configureIfPossible.start env=\(env.rawValue, privacy: .public)")
    if let options = optionsFromPlist(named: env.firebasePlistBaseName) {
      FirebaseApp.configure(options: options)
      AppLog.firebase.info(
        "configureIfPossible.success source=\(env.firebasePlistBaseName, privacy: .public)"
      )
      return
    }

    // Fallback: allow dropping a default GoogleService-Info.plist into Resources.
    if let options = optionsFromPlist(named: "GoogleService-Info") {
      FirebaseApp.configure(options: options)
      AppLog.firebase.info("configureIfPossible.success source=GoogleService-Info")
      return
    }

    // No plist present: keep app runnable, but disable Firebase features.
    AppLog.firebase.warning(
      "Firebase not configured (missing GoogleService-Info plist). env=\(env.rawValue, privacy: .public) expectedIn=bundleRootOrFirebaseSubdir"
    )
  }

  private static func optionsFromPlist(named baseName: String) -> FirebaseOptions? {
    let candidatePaths: [String] = [
      Bundle.main.path(forResource: baseName, ofType: "plist"),
      Bundle.main.path(forResource: baseName, ofType: "plist", inDirectory: "Firebase"),
    ].compactMap { $0 }

    for path in candidatePaths {
      guard let options = FirebaseOptions(contentsOfFile: path) else { continue }

      // Avoid configuring Firebase with placeholder values.
      let markers = ["REPLACE_ME", "your_", "YOUR_"]
      let values = [options.apiKey, options.googleAppID, options.projectID]
      let isPlaceholder = values
        .compactMap { $0 }
        .contains { v in markers.contains(where: { v.localizedCaseInsensitiveContains($0) }) }
      if !isPlaceholder { return options }
    }

    return nil
  }
}

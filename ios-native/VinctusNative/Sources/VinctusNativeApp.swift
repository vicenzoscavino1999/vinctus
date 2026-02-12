import SwiftUI

@main
struct VinctusNativeApp: App {
  init() {
    FirebaseBootstrap.configureIfPossible()
  }

  var body: some Scene {
    WindowGroup {
      RootView()
    }
  }
}


import SwiftUI
import GoogleSignIn

@main
struct VinctusNativeApp: App {
  init() {
    FirebaseBootstrap.configureIfPossible()
  }

  var body: some Scene {
    WindowGroup {
      RootView()
        .onOpenURL { url in
          _ = GIDSignIn.sharedInstance.handle(url)
        }
    }
  }
}

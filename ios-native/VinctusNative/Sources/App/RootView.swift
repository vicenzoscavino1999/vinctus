import SwiftUI

struct RootView: View {
  @StateObject private var authVM = AuthViewModel(repo: AppRepos.auth())

  var body: some View {
    Group {
      if AppRepos.isDemo {
        // Screenshot builds show the welcome with `-VinctusShowWelcome 1`.
        if AppRepos.demoArgument("-VinctusShowWelcome") != nil {
          WelcomeGate { MainTabView() }
        } else {
          MainTabView()
        }
      } else if authVM.isSignedIn {
        AgeGate {
          // New accounts see the welcome once before the app, like the web.
          WelcomeGate { MainTabView() }
        }
        .id(authVM.currentUserID)
      } else {
        AuthGateView()
      }
    }
    .background(VinctusTokens.Color.background.ignoresSafeArea())
    .preferredColorScheme(.dark)
    .environmentObject(authVM)
  }
}

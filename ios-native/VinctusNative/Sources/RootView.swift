import SwiftUI

struct RootView: View {
  @StateObject private var authVM = AuthViewModel(repo: FirebaseAuthRepo())

  var body: some View {
    Group {
      if AppRepos.isDemo {
        MainTabView()
      } else if authVM.isSignedIn {
        AgeGate {
          MainTabView()
        }
      } else {
        AuthGateView()
      }
    }
    .background(VinctusTokens.Color.background.ignoresSafeArea())
    .preferredColorScheme(.dark)
    .environmentObject(authVM)
  }
}

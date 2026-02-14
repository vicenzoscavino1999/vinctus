import SwiftUI

struct RootView: View {
  @StateObject private var authVM = AuthViewModel(repo: FirebaseAuthRepo())

  var body: some View {
    Group {
      if authVM.isSignedIn {
        MainTabView()
      } else {
        AuthGateView()
      }
    }
    .background(VinctusTokens.Color.background.ignoresSafeArea())
    .preferredColorScheme(.dark)
    .environmentObject(authVM)
  }
}

import FirebaseCore
import SwiftUI

struct RootView: View {
  @StateObject private var authVM = AuthViewModel(repo: FirebaseAuthRepo())

  var body: some View {
    NavigationStack {
      VStack(alignment: .leading, spacing: 12) {
        Text("VinctusNative")
          .font(.title)
          .bold()

        Text("Env: \(AppEnvironment.current.rawValue)")
          .foregroundStyle(.secondary)

        Text(FirebaseApp.app() == nil ? "Firebase: NOT configured" : "Firebase: configured")
          .foregroundStyle(FirebaseApp.app() == nil ? .orange : .green)

        if let error = authVM.errorMessage {
          Text(error)
            .foregroundStyle(.red)
            .font(.footnote)
        }

        if authVM.isSignedIn {
          NavigationLink("Go to Feed") {
            FeedView(repo: FirebaseFeedRepo())
          }

          Button("Sign out") { authVM.signOut() }
        } else {
          Button("Technical login (anonymous)") { authVM.signInAnonymously() }
        }

        Spacer()
      }
      .padding()
    }
  }
}


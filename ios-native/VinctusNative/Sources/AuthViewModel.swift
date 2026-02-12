import Foundation

@MainActor
final class AuthViewModel: ObservableObject {
  @Published private(set) var isSignedIn = false
  @Published var errorMessage: String?

  private let repo: AuthRepo

  init(repo: AuthRepo) {
    self.repo = repo
    self.isSignedIn = repo.currentUser != nil
  }

  func signInAnonymously() {
    errorMessage = nil
    Task {
      do {
        try await repo.signInAnonymously()
        isSignedIn = true
      } catch {
        errorMessage = error.localizedDescription
      }
    }
  }

  func signOut() {
    errorMessage = nil
    do {
      try repo.signOut()
      isSignedIn = false
    } catch {
      errorMessage = error.localizedDescription
    }
  }
}


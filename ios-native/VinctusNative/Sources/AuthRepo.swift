import FirebaseAuth
import Foundation

protocol AuthRepo {
  var currentUser: FirebaseAuth.User? { get }
  func signInAnonymously() async throws
  func signOut() throws
}

final class FirebaseAuthRepo: AuthRepo {
  var currentUser: FirebaseAuth.User? { Auth.auth().currentUser }

  func signInAnonymously() async throws {
    _ = try await Auth.auth().signInAnonymously()
  }

  func signOut() throws {
    try Auth.auth().signOut()
  }
}


import FirebaseAuth
import FirebaseCore
import FirebaseFirestore
import FirebaseStorage
import UIKit
import XCTest
@testable import VinctusNative

/// Points the app's Firebase at the local emulators of `firebase.json` (Auth 9099, Firestore 8080,
/// Storage 9199), which enforce the repo's own `firestore.rules` and `storage.rules`.
/// CI starts them with `firebase emulators:exec` (.github/workflows/ios-native.yml).
enum Emulator {
  static let projectID = "vinctus-dev"
  private static var isConfigured = false

  static func configure() {
    guard !isConfigured else { return }
    isConfigured = true

    // The test host has no GoogleService-Info plist, so Firebase is still unconfigured here.
    if FirebaseApp.app() == nil {
      let options = FirebaseOptions(googleAppID: "1:123456789012:ios:0123456789abcdef", gcmSenderID: "123456789012")
      options.projectID = projectID
      options.apiKey = "AIza" + String(repeating: "0", count: 35)
      options.storageBucket = "\(projectID).appspot.com"
      FirebaseApp.configure(options: options)
    }

    Auth.auth().useEmulator(withHost: "127.0.0.1", port: 9099)

    let settings = FirestoreSettings()
    settings.host = "127.0.0.1:8080"
    settings.isSSLEnabled = false
    settings.cacheSettings = MemoryCacheSettings()
    Firestore.firestore().settings = settings

    Storage.storage().useEmulator(withHost: "127.0.0.1", port: 9199)
  }
}

struct TestUser {
  let uid: String
  let email: String
  let name: String
}

/// Integration tests call the app's Firebase repos, signed in as throwaway emulator users, so a
/// write the rules reject fails the test. Every test makes its own users and groups, so tests
/// don't depend on each other or on seed data.
class EmulatorTestCase: XCTestCase {
  static let password = "vinctus-test-password"

  override func setUp() async throws {
    try await super.setUp()
    Emulator.configure()
    try Auth.auth().signOut()
  }

  override func tearDown() async throws {
    try? Auth.auth().signOut()
    try await super.tearDown()
  }

  /// Creates an account and signs in with it. Like the app after a first sign-in, the profile
  /// documents come from `FirebaseUserProfileBootstrapRepo`.
  func makeUser(_ name: String) async throws -> TestUser {
    let email = "\(UUID().uuidString.prefix(12).lowercased())@vinctus.test"
    let result = try await Auth.auth().createUser(withEmail: email, password: Self.password)
    let change = result.user.createProfileChangeRequest()
    change.displayName = name
    try await change.commitChanges()
    try await FirebaseUserProfileBootstrapRepo().ensureCurrentUserProfile()
    return TestUser(uid: result.user.uid, email: email, name: name)
  }

  func signIn(_ user: TestUser) async throws {
    try Auth.auth().signOut()
    _ = try await Auth.auth().signIn(withEmail: user.email, password: Self.password)
  }

  /// Makes the signed-in user's account private, like the web's privacy setting.
  func makeSignedInAccountPrivate() async throws {
    let uid = try XCTUnwrap(Auth.auth().currentUser?.uid)
    let db = Firestore.firestore()
    try await db.collection("users").document(uid).updateData([
      "settings.privacy.accountVisibility": "private",
      "updatedAt": FieldValue.serverTimestamp(),
    ])
    try await db.collection("users_public").document(uid).updateData([
      "accountVisibility": "private",
      "updatedAt": FieldValue.serverTimestamp(),
    ])
  }

  /// Creates a group owned by the signed-in user with the fields `isValidGroupCreate` accepts
  /// (the app can't create groups yet; the web does).
  func makeGroup(name: String, visibility: ProfileAccountVisibility) async throws -> String {
    let uid = try XCTUnwrap(Auth.auth().currentUser?.uid)
    let group = Firestore.firestore().collection("groups").document()
    try await group.setData([
      "name": name,
      "description": "Grupo de prueba",
      "visibility": visibility.rawValue,
      "ownerId": uid,
      "memberCount": 1,
      "createdAt": FieldValue.serverTimestamp(),
      "updatedAt": FieldValue.serverTimestamp(),
    ])
    return group.documentID
  }

  /// Publishes a text post as the signed-in user and returns its id.
  func publishPost(_ text: String) async throws -> String {
    let posts = FirebaseCreatePostRepo()
    let postID = try posts.makePostID()
    try await posts.publishTextPost(text: text, postID: postID, groupID: nil)
    return postID
  }

  static func jpegData() -> Data {
    let image = UIGraphicsImageRenderer(size: CGSize(width: 64, height: 64)).image { context in
      UIColor.orange.setFill()
      context.fill(CGRect(x: 0, y: 0, width: 64, height: 64))
    }
    return image.jpegData(compressionQuality: 0.8) ?? Data()
  }
}

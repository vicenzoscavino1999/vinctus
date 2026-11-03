import Foundation
@testable import VinctusNative

final class FakeProfileRepo: ProfileRepo {
  var profile: UserProfile?
  var failsToLoad = false

  func fetchUserProfile(uid: String) async throws -> UserProfile? {
    if failsToLoad { throw FakeError() }
    return profile
  }

  var updates: [ProfileUpdate] = []
  var uploadedPhotos: [Data] = []
  var failsToSave = false

  func updateProfile(uid: String, _ update: ProfileUpdate) async throws {
    if failsToSave { throw FakeError() }
    updates.append(update)
  }

  func uploadProfilePhoto(uid: String, jpegData: Data) async throws -> String {
    if failsToSave { throw FakeError() }
    uploadedPhotos.append(jpegData)
    return "https://example.com/profiles/\(uid)/avatar.jpg"
  }

  static func sample(id: String = "u1", photoURL: String? = nil) -> UserProfile {
    UserProfile(
      id: id, displayName: "Lucía", photoURL: photoURL, username: "lucia", email: nil, bio: nil,
      role: nil, location: nil, reputation: 0, followersCount: 0, followingCount: 0, postsCount: 0,
      accountVisibility: .public, createdAt: Date(), updatedAt: Date()
    )
  }
}

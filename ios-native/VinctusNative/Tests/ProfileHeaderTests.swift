import XCTest
@testable import VinctusNative

@MainActor
final class ProfileDetailsSectionTests: XCTestCase {
  private func profile(location: String?, email: String?) -> UserProfile {
    UserProfile(
      id: "u1", displayName: "Lucía", photoURL: nil, username: "lucia", email: email, bio: nil,
      role: nil, location: location, reputation: 0, followersCount: 0, followingCount: 0, postsCount: 0,
      accountVisibility: .public, createdAt: Date(), updatedAt: Date()
    )
  }

  func testYourOwnProfileShowsTheEmail() {
    let rows = ProfileDetailsSection.rows(for: profile(location: "Lima", email: "lucia@example.com"), isOwnProfile: true)

    XCTAssertEqual(rows.map(\.icon), ["mappin.and.ellipse", "envelope", "calendar"])
    XCTAssertEqual(rows.first?.text, "Lima")
    XCTAssertTrue(rows.last?.text.hasPrefix("Se unió en ") == true)
  }

  func testOthersNeverSeeTheEmail() {
    let rows = ProfileDetailsSection.rows(for: profile(location: nil, email: "lucia@example.com"), isOwnProfile: false)

    XCTAssertEqual(rows.map(\.icon), ["calendar"])
  }
}

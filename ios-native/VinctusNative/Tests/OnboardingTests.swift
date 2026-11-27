import XCTest
@testable import VinctusNative

@MainActor
final class OnboardingTests: XCTestCase {
  private let now = Date(timeIntervalSince1970: 1_795_800_000)

  private func profile(createdHoursAgo: Double, posts: Int = 0) -> UserProfile {
    UserProfile(
      id: "u1", displayName: "Nueva", photoURL: nil, username: nil, email: nil, bio: nil,
      role: nil, location: nil, reputation: 0, followersCount: 0, followingCount: 0, postsCount: posts,
      accountVisibility: .public, createdAt: now.addingTimeInterval(-createdHoursAgo * 3600), updatedAt: now
    )
  }

  func testOnlyNewAccountsWithoutPostsSeeTheWelcome() {
    XCTAssertTrue(WelcomeDecision.isNewAccount(profile(createdHoursAgo: 1), now: now))
    XCTAssertFalse(WelcomeDecision.isNewAccount(profile(createdHoursAgo: 30), now: now), "An older account")
    XCTAssertFalse(WelcomeDecision.isNewAccount(profile(createdHoursAgo: 1, posts: 2), now: now), "Already posted")
    XCTAssertEqual(WelcomeDecision.storageKey(uid: "u1"), "vinctus.onboardingComplete.u1")
  }

  private func group(_ id: String, category: String, members: Int, visibility: ProfileAccountVisibility = .public) -> GroupSummary {
    GroupSummary(id: id, name: id, description: "", categoryID: category, visibility: visibility,
                 iconURL: nil, memberCount: members, updatedAt: now)
  }

  func testInterestsAreFollowedAndOnlyPublicGroupsAreOfferedAndJoined() async {
    let groups = FakeGroupsRepo()
    groups.listedGroups = [
      group("big", category: "music", members: 900),
      group("match", category: "science", members: 5),
      group("closed", category: "science", members: 50, visibility: .private),
    ]
    let profiles = FakeProfileContentRepo()
    let vm = OnboardingViewModel(groupsRepo: groups, profileContentRepo: profiles)

    vm.step = 1
    vm.toggleInterest("science")
    XCTAssertFalse(vm.canContinue, "At least two interests")
    vm.toggleInterest("history")
    XCTAssertTrue(vm.canContinue)

    await vm.loadGroups()
    XCTAssertEqual(vm.suggestedGroups.map(\.id), ["match", "big"], "The interest's groups first; no private ones")

    vm.toggleGroup("match")
    await vm.finish(uid: "u1")
    XCTAssertEqual(profiles.categoryWrites.map(\.categoryID), ["science", "history"])
    XCTAssertTrue(profiles.categoryWrites.allSatisfy(\.followed))
    XCTAssertEqual(groups.joinCalls, 1)
    XCTAssertTrue(groups.members.contains("u1"))
  }

  func testTogglingAnInterestTwiceRemovesIt() {
    let vm = OnboardingViewModel(groupsRepo: FakeGroupsRepo(), profileContentRepo: FakeProfileContentRepo())
    vm.toggleInterest("science")
    vm.toggleInterest("science")
    XCTAssertTrue(vm.interests.isEmpty)
  }
}

import XCTest
@testable import VinctusNative

@MainActor
final class FollowedCategoriesViewModelTests: XCTestCase {
  func testLoadsAndOffersTheOtherCategories() async {
    let repo = FakeProfileContentRepo()
    repo.followedCategories = ["science"]
    let vm = FollowedCategoriesViewModel(repo: repo)

    await vm.load()

    XCTAssertEqual(vm.followed, ["science"])
    XCTAssertFalse(vm.notFollowed.contains { $0.id == "science" })
    XCTAssertEqual(vm.notFollowed.count, InterestCategory.all.count - 1)
    XCTAssertFalse(vm.followsEverything)
    XCTAssertFalse(vm.isLoading)
  }

  func testFollowAndLeaveACategory() async {
    let repo = FakeProfileContentRepo()
    let vm = FollowedCategoriesViewModel(repo: repo)
    await vm.load()

    await vm.setFollowed(true, categoryID: "music")
    await vm.setFollowed(true, categoryID: "music")
    XCTAssertEqual(vm.followed, ["music"])

    await vm.setFollowed(false, categoryID: "music")
    XCTAssertEqual(vm.followed, [])
    XCTAssertEqual(repo.categoryWrites.map { $0.followed }, [true, false])
  }

  func testAFailedWriteIsRolledBack() async {
    let repo = FakeProfileContentRepo()
    repo.failsToWrite = true
    let vm = FollowedCategoriesViewModel(repo: repo)
    await vm.load()

    await vm.setFollowed(true, categoryID: "music")

    XCTAssertEqual(vm.followed, [])
    XCTAssertEqual(vm.errorMessage, "No se pudo actualizar la categoría.")
  }

  func testLoadError() async {
    let repo = FakeProfileContentRepo()
    repo.failsToLoad = true
    let vm = FollowedCategoriesViewModel(repo: repo)

    await vm.load()

    XCTAssertEqual(vm.errorMessage, "No se pudieron cargar tus categorías.")
    XCTAssertFalse(vm.isLoading)
  }
}

@MainActor
final class SavedDebatesViewModelTests: XCTestCase {
  func testRemoveIsImmediateAndRolledBackOnFailure() async {
    let repo = FakeProfileContentRepo()
    repo.savedDebates = [FakeProfileContentRepo.debate("d1"), FakeProfileContentRepo.debate("d2")]
    let vm = SavedDebatesViewModel(repo: repo)
    await vm.load()
    XCTAssertEqual(vm.debates.map(\.id), ["d1", "d2"])

    await vm.remove(FakeProfileContentRepo.debate("d1"))
    XCTAssertEqual(vm.debates.map(\.id), ["d2"])
    XCTAssertEqual(repo.removedDebateIDs, ["d1"])

    repo.failsToWrite = true
    await vm.remove(FakeProfileContentRepo.debate("d2"))
    XCTAssertEqual(vm.debates.map(\.id), ["d2"])
    XCTAssertEqual(vm.errorMessage, "No se pudo quitar el debate.")
  }

  func testLoadError() async {
    let repo = FakeProfileContentRepo()
    repo.failsToLoad = true
    let vm = SavedDebatesViewModel(repo: repo)

    await vm.load()

    XCTAssertEqual(vm.errorMessage, "No se pudieron cargar tus debates guardados.")
    XCTAssertFalse(vm.isLoading)
  }
}

@MainActor
final class ProfilePostsViewModelTests: XCTestCase {
  func testLoadsTheFirstPage() async {
    let repo = FakeProfileContentRepo()
    repo.posts = [
      FeedItem(id: "p1", authorID: "u1", authorName: "Lucía", text: "Hola", createdAt: nil, likeCount: 0, commentCount: 0),
    ]
    let vm = ProfilePostsViewModel(repo: repo, userID: "u1")

    await vm.load()
    await vm.loadMore()

    XCTAssertEqual(vm.posts.map(\.id), ["p1"])
    XCTAssertFalse(vm.hasMore)
    XCTAssertFalse(vm.isLoading)
    XCTAssertNil(vm.errorMessage)
  }

  func testLoadError() async {
    let repo = FakeProfileContentRepo()
    repo.failsToLoad = true
    let vm = ProfilePostsViewModel(repo: repo, userID: "u1")

    await vm.load()

    XCTAssertEqual(vm.errorMessage, "No se pudieron cargar las publicaciones.")
    XCTAssertFalse(vm.isLoading)
  }
}

@MainActor
final class ContributionsViewModelTests: XCTestCase {
  func testDeleteIsImmediateAndRolledBackOnFailure() async {
    let repo = FakeProfileContentRepo()
    repo.contributions = [FakeProfileContentRepo.contribution("c1"), FakeProfileContentRepo.contribution("c2")]
    let vm = ContributionsViewModel(repo: repo, userID: "u1")
    await vm.load()

    await vm.delete(FakeProfileContentRepo.contribution("c1"))
    XCTAssertEqual(vm.contributions.map(\.id), ["c2"])
    XCTAssertEqual(repo.deletedContributionIDs, ["c1"])

    repo.failsToWrite = true
    await vm.delete(FakeProfileContentRepo.contribution("c2"))
    XCTAssertEqual(vm.contributions.map(\.id), ["c2"])
    XCTAssertEqual(vm.errorMessage, "No se pudo eliminar el aporte.")
  }

  func testLoadError() async {
    let repo = FakeProfileContentRepo()
    repo.failsToLoad = true
    let vm = ContributionsViewModel(repo: repo, userID: "u1")

    await vm.load()

    XCTAssertEqual(vm.errorMessage, "No se pudieron cargar los aportes.")
    XCTAssertFalse(vm.isLoading)
  }
}

@MainActor
final class NewContributionViewModelTests: XCTestCase {
  func testNeedsATitle() async {
    let repo = FakeProfileContentRepo()
    let vm = NewContributionViewModel(repo: repo)
    XCTAssertFalse(vm.canSave)

    vm.draft.title = "   "
    let saved = await vm.save()

    XCTAssertFalse(vm.canSave)
    XCTAssertFalse(saved)
    XCTAssertTrue(repo.createdContributions.isEmpty)
  }

  func testSavesAValidContribution() async {
    let repo = FakeProfileContentRepo()
    let vm = NewContributionViewModel(repo: repo)
    vm.draft.title = "Telescopio"
    XCTAssertTrue(vm.canSave)

    let saved = await vm.save()

    XCTAssertTrue(saved)
    XCTAssertEqual(repo.createdContributions.map(\.title), ["Telescopio"])
    XCTAssertFalse(vm.isSaving)
  }

  func testAnInvalidLinkShowsTheRulesMessage() async {
    let repo = FakeProfileContentRepo()
    let vm = NewContributionViewModel(repo: repo)
    vm.draft.title = "Proyecto"
    vm.draft.link = "javascript:alert(1)"

    let saved = await vm.save()

    XCTAssertFalse(saved)
    XCTAssertEqual(vm.errorMessage, ProfileContentRepoError.invalidContribution.errorDescription)
  }
}

@MainActor
final class FollowListViewModelTests: XCTestCase {
  private func request(from id: String) -> IncomingFollowRequest {
    IncomingFollowRequest(id: "req_\(id)", from: FakeProfileContentRepo.user(id))
  }

  func testLoadsTheChosenList() async {
    let repo = FakeProfileContentRepo()
    repo.followLists = [
      .followers: [FakeProfileContentRepo.user("a")],
      .following: [FakeProfileContentRepo.user("b"), FakeProfileContentRepo.user("c")],
    ]
    let vm = FollowListViewModel(repo: repo, userID: "u1", initialKind: .followers, showsRequests: false)

    await vm.load()
    XCTAssertEqual(vm.users.map(\.id), ["a"])

    vm.kind = .following
    await vm.load()
    XCTAssertEqual(vm.users.map(\.id), ["b", "c"])
    XCTAssertFalse(vm.hasMore)
    XCTAssertFalse(vm.isLoading)
  }

  func testRequestsOnlyLoadOnYourOwnProfile() async {
    let repo = FakeProfileContentRepo()
    repo.incomingRequests = [request(from: "x")]

    let other = FollowListViewModel(repo: repo, userID: "u2", initialKind: .followers, showsRequests: false)
    await other.loadRequests()
    XCTAssertTrue(other.requests.isEmpty)

    let own = FollowListViewModel(repo: repo, userID: "u1", initialKind: .followers, showsRequests: true)
    await own.loadRequests()
    XCTAssertEqual(own.requests.map(\.id), ["req_x"])
  }

  func testAcceptingARequestReloadsTheFollowers() async {
    let repo = FakeProfileContentRepo()
    repo.incomingRequests = [request(from: "x")]
    let vm = FollowListViewModel(repo: repo, userID: "u1", initialKind: .followers, showsRequests: true)
    await vm.load()
    await vm.loadRequests()
    repo.followLists[.followers] = [FakeProfileContentRepo.user("x")]

    await vm.answer(vm.requests[0], accept: true)

    XCTAssertTrue(vm.requests.isEmpty)
    XCTAssertEqual(vm.users.map(\.id), ["x"])
    XCTAssertEqual(repo.answers.first?.accept, true)
  }

  func testRejectingARequestDoesNotReload() async {
    let repo = FakeProfileContentRepo()
    repo.incomingRequests = [request(from: "x")]
    let vm = FollowListViewModel(repo: repo, userID: "u1", initialKind: .followers, showsRequests: true)
    await vm.load()
    await vm.loadRequests()
    let loads = repo.fetchFollowListCalls

    await vm.answer(vm.requests[0], accept: false)

    XCTAssertTrue(vm.requests.isEmpty)
    XCTAssertEqual(repo.fetchFollowListCalls, loads)
    XCTAssertEqual(repo.answers.first?.accept, false)
  }

  func testLoadError() async {
    let repo = FakeProfileContentRepo()
    repo.failsToLoad = true
    let vm = FollowListViewModel(repo: repo, userID: "u1", initialKind: .followers, showsRequests: false)

    await vm.load()

    XCTAssertEqual(vm.errorMessage, "No se pudo cargar la lista.")
    XCTAssertFalse(vm.isLoading)
  }
}

import UIKit
import XCTest
@testable import VinctusNative

/// Live content for every topic is requested at once, so this fake records under a lock.
private final class ConcurrentLiveRepo: DiscoverRepo, @unchecked Sendable {
  private let lock = NSLock()
  private var requests: [String] = []
  private let itemsBySource: [String: [DiscoverLiveItem]]
  private let failingSources: Set<String>

  init(itemsBySource: [String: [DiscoverLiveItem]], failingSources: Set<String> = []) {
    self.itemsBySource = itemsBySource
    self.failingSources = failingSources
  }

  var requestedSources: [String] { lock.withLock { requests } }

  func fetchRecentUsers(limit: Int, excluding uid: String?) async throws -> [DiscoverUser] { [] }
  func searchUsers(prefix: String, limit: Int, excluding uid: String?) async throws -> [DiscoverUser] { [] }

  func fetchLiveContent(source: String, query: String, limit: Int) async throws -> [DiscoverLiveItem] {
    lock.withLock { requests.append(source) }
    if failingSources.contains(source) { throw FakeError() }
    return itemsBySource[source] ?? []
  }
}

private final class FakePublicDebatesRepo: PublicDebatesRepo {
  var debates: [PublicDebate] = []
  var fails = false
  private(set) var calls = 0

  func fetchPublicDebates(limit: Int) async throws -> [PublicDebate] {
    calls += 1
    if fails { throw FakeError() }
    return debates
  }
}

private func liveItem(_ id: String, _ title: String) -> DiscoverLiveItem {
  DiscoverLiveItem(id: id, badge: "Paper", title: title, subtitle: "", meta: "", linkURL: nil, imageURL: nil)
}

private func debate(_ id: String, status: String = "done", sources: Int, likes: Int) -> PublicDebate {
  PublicDebate(
    id: id, topic: "Tema \(id)", personaA: "scientist", personaB: "skeptic", summary: nil,
    winner: nil, status: status, sourceCount: sources, likesCount: likes, sourceHosts: [],
    createdAt: nil
  )
}

private func jpeg(width: Int, height: Int) -> Data {
  let format = UIGraphicsImageRendererFormat()
  format.scale = 1
  let size = CGSize(width: width, height: height)
  let image = UIGraphicsImageRenderer(size: size, format: format).image { context in
    UIColor.orange.setFill()
    context.fill(CGRect(origin: .zero, size: size))
  }
  return image.jpegData(compressionQuality: 0.8)!
}

@MainActor
final class DiscoverInterestsTests: XCTestCase {
  func testFollowedTopicsComeFirstThenTheCatalogOrder() {
    let ordered = DiscoverCategory.ordered(DiscoverCategory.all, followed: ["nature", "music"])
    XCTAssertEqual(ordered.map(\.id), ["music", "nature", "science", "history", "technology", "literature"])
  }

  func testLoadsEveryHeadlineOnceAndAsksAgainOnlyWhenForced() async {
    let live = ConcurrentLiveRepo(
      itemsBySource: ["arxiv": [liveItem("p1", "Paper nuevo"), liveItem("p2", "Otro")]],
      failingSources: ["lastfm"]
    )
    let profile = FakeProfileContentRepo()
    profile.followedCategories = ["history"]
    let vm = DiscoverInterestsViewModel(discoverRepo: live, profileContentRepo: profile)

    await vm.refresh()

    XCTAssertEqual(vm.headlines["science"]?.title, "Paper nuevo")
    XCTAssertNil(vm.headlines["music"], "A failed source just shows no headline")
    XCTAssertEqual(vm.loadedHeadlines.count, DiscoverCategory.all.count)
    XCTAssertEqual(vm.followed, ["history"])
    XCTAssertEqual(vm.categories(matching: "").first?.id, "history")
    XCTAssertEqual(vm.categories(matching: "fisica").map(\.id), ["science"])
    XCTAssertEqual(live.requestedSources.count, DiscoverCategory.all.count)

    await vm.refresh()
    XCTAssertEqual(live.requestedSources.count, DiscoverCategory.all.count, "Fresh headlines are not asked again")

    await vm.refresh(force: true)
    XCTAssertEqual(live.requestedSources.count, DiscoverCategory.all.count * 2)
  }

  func testFollowShowsAtOnceAndIsUndoneWhenTheServerRefuses() async {
    let profile = FakeProfileContentRepo()
    profile.failsToWrite = true
    let vm = DiscoverInterestsViewModel(
      discoverRepo: ConcurrentLiveRepo(itemsBySource: [:]), profileContentRepo: profile
    )
    let science = DiscoverCategory.all[0]

    await vm.toggleFollow(science)
    XCTAssertFalse(vm.followed.contains("science"))
    XCTAssertNotNil(vm.followError)

    profile.failsToWrite = false
    await vm.toggleFollow(science)
    XCTAssertTrue(vm.followed.contains("science"))
    XCTAssertEqual(profile.categoryWrites.last?.followed, true)
    XCTAssertEqual(profile.categoryWrites.last?.categoryID, "science")
  }
}

@MainActor
final class DiscoverDebatesTests: XCTestCase {
  func testReadsADebateDocument() {
    let parsed = PublicDebate(id: "d1", data: [
      "topic": "  ¿La energía nuclear es clave?  ",
      "personaA": "scientist",
      "personaB": "skeptic",
      "status": "done",
      "linkCount": 3,
      "likesCount": NSNumber(value: 2),
      "sourceLinks": [
        "https://www.iaea.org/a", "https://iaea.org/b", "javascript:alert(1)", "https://iea.org/x",
        "https://third.org",
      ],
      "verdict": ["winner": "A", "reason": "Mejor evidencia"],
    ])
    XCTAssertEqual(parsed?.topic, "¿La energía nuclear es clave?")
    XCTAssertEqual(parsed?.sourceCount, 3, "Falls back to linkCount like the web")
    XCTAssertEqual(parsed?.likesCount, 2)
    XCTAssertEqual(parsed?.sourceHosts, ["iaea.org", "iea.org"])
    XCTAssertEqual(parsed?.winner, "A")
    XCTAssertEqual(parsed?.asSavedDebate.id, "d1")
    XCTAssertNil(PublicDebate(id: "empty", data: ["topic": "   "]))
  }

  func testCuratesFinishedSourcedDebatesBestFirst() {
    let curated = PublicDebate.curated(
      [
        debate("running", status: "running", sources: 9, likes: 9),
        debate("no-sources", sources: 0, likes: 9),
        debate("a", sources: 1, likes: 1),
        debate("b", sources: 2, likes: 0),
        debate("c", sources: 1, likes: 3),
      ],
      limit: 2
    )
    XCTAssertEqual(curated.map(\.id), ["c", "b"])
  }

  func testKeepsDebatesShownWhenARefreshFailsAndOnlyAsksAgainWhenStaleOrForced() async {
    let repo = FakePublicDebatesRepo()
    repo.debates = [debate("a", sources: 2, likes: 1)]
    let vm = DiscoverDebatesViewModel(repo: repo)

    await vm.refresh()
    XCTAssertEqual(vm.debates.map(\.id), ["a"])

    await vm.refresh()
    XCTAssertEqual(repo.calls, 1)

    repo.fails = true
    await vm.refresh(force: true)
    XCTAssertEqual(vm.debates.map(\.id), ["a"])
    XCTAssertNil(vm.errorMessage)

    vm.reset()
    await vm.refresh()
    XCTAssertEqual(vm.errorMessage, "No se pudieron cargar los debates.")
  }
}

final class PostImageStoreTests: XCTestCase {
  private actor FetchProbe {
    private(set) var calls: [String] = []
    private(set) var peak = 0
    private var running = 0

    func begin(_ key: String) {
      calls.append(key)
      running += 1
      peak = max(peak, running)
    }

    func end() { running -= 1 }
  }

  func testDecodesLargePhotosAtMost1600PixelsAndLeavesSmallOnesAlone() throws {
    let large = try XCTUnwrap(PostImageStore.decode(jpeg(width: 3000, height: 2000))?.cgImage)
    XCTAssertEqual(large.width, 1600)
    XCTAssertTrue((1066...1067).contains(large.height))

    let small = try XCTUnwrap(PostImageStore.decode(jpeg(width: 400, height: 300))?.cgImage)
    XCTAssertEqual(small.width, 400)
    XCTAssertEqual(small.height, 300)

    XCTAssertNil(PostImageStore.decode(Data("no es una imagen".utf8)))
  }

  func testDownloadsEachPhotoOnceAtMostThreeAtATimeAndPerAccount() async throws {
    let probe = FetchProbe()
    let photo = jpeg(width: 10, height: 10)
    let store = PostImageStore(memory: PostImageMemory(), fetch: { source, uid in
      await probe.begin("\(uid ?? ""):\(source)")
      try await Task.sleep(nanoseconds: 50_000_000)
      await probe.end()
      return photo
    })

    try await withThrowingTaskGroup(of: Void.self) { group in
      for source in ["a", "b", "c", "d", "e", "a"] {
        group.addTask { _ = try await store.image(source, uid: "me") }
      }
      try await group.waitForAll()
    }
    let peak = await probe.peak
    let firstCalls = await probe.calls
    XCTAssertLessThanOrEqual(peak, PostImageStore.maxParallelDownloads)
    XCTAssertEqual(firstCalls.count, 5, "The repeated photo is downloaded once")

    _ = try await store.image("a", uid: "me")
    let afterCached = await probe.calls.count
    XCTAssertEqual(afterCached, 5, "A photo already downloaded comes from memory")

    _ = try await store.image("a", uid: "someone-else")
    let afterOtherAccount = await probe.calls
    XCTAssertEqual(afterOtherAccount.count, 6)
    XCTAssertEqual(afterOtherAccount.last, "someone-else:a", "Another account never gets the first one's copy")
  }
}

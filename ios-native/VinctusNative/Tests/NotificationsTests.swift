import XCTest
@testable import VinctusNative

/// Records calls under a lock: the view model asks for every request kind at once.
private final class FakeNotificationsRepo: NotificationsRepo, @unchecked Sendable {
  private let lock = NSLock()
  var pages: [ActivityPage] = []
  var requests: [IncomingRequest.Kind: [IncomingRequest]] = [:]
  var failingKinds: Set<IncomingRequest.Kind> = []
  var failsMarkRead = false
  var failingDeletes: Set<String> = []
  var failsAccept = false
  var badge = 0
  private var _markedRead: [[String]] = []
  private var _deleted: [String] = []
  private var _accepted: [String] = []
  private var _activityCalls = 0
  private var _requestCalls: [IncomingRequest.Kind] = []
  private var _badgeCalls = 0

  var markedRead: [[String]] { lock.withLock { _markedRead } }
  var deleted: [String] { lock.withLock { _deleted } }
  var accepted: [String] { lock.withLock { _accepted } }
  var activityCalls: Int { lock.withLock { _activityCalls } }
  var requestCalls: [IncomingRequest.Kind] { lock.withLock { _requestCalls } }
  var badgeCalls: Int { lock.withLock { _badgeCalls } }

  func fetchActivity(limit: Int, after cursor: NotificationsCursor?) async throws -> ActivityPage {
    let index = lock.withLock { () -> Int in
      _activityCalls += 1
      return _activityCalls - 1
    }
    return index < pages.count ? pages[index] : ActivityPage(items: [], cursor: nil, hasMore: false)
  }

  func markRead(ids: [String]) async throws {
    lock.withLock { _markedRead.append(ids.sorted()) }
    if failsMarkRead { throw FakeError() }
  }

  func delete(id: String) async throws {
    lock.withLock { _deleted.append(id) }
    if failingDeletes.contains(id) { throw FakeError() }
  }

  func fetchRequests(_ kind: IncomingRequest.Kind) async throws -> [IncomingRequest] {
    lock.withLock { _requestCalls.append(kind) }
    if failingKinds.contains(kind) { throw FakeError() }
    return requests[kind] ?? []
  }

  func accept(_ request: IncomingRequest) async throws {
    lock.withLock { _accepted.append(request.id) }
    if failsAccept { throw FakeError() }
  }

  func reject(_ request: IncomingRequest) async throws {}
  func fetchPost(id: String) async throws -> FeedItem? { nil }

  func badgeCount() async throws -> Int {
    lock.withLock { _badgeCalls += 1 }
    return badge
  }
}

private let now = Date(timeIntervalSince1970: 1_795_000_000) // 2026-11-18

private func notification(
  _ id: String,
  _ kind: ActivityKind = .like,
  from: String = "ana",
  name: String = "Ana",
  post: String? = "p1",
  hoursAgo: Double = 1,
  read: Bool = false
) -> ActivityNotification {
  ActivityNotification(
    id: id, kind: kind, fromUID: from, fromName: name, postID: kind == .follow ? nil : post,
    createdAt: now.addingTimeInterval(-hoursAgo * 3_600), read: read
  )
}

private func request(_ kind: IncomingRequest.Kind, _ id: String, from: String = "ana") -> IncomingRequest {
  IncomingRequest(
    kind: kind, requestID: id, fromUID: from, name: from.capitalized, username: nil, photoURL: nil,
    createdAt: now, target: kind == .groups ? "Club" : nil, message: nil
  )
}

final class NotificationsFeedTests: XCTestCase {
  private var calendar: Calendar {
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = TimeZone(identifier: "UTC")!
    return calendar
  }

  func testRepeatedFollowsFromOnePersonAreOneRowAtTheNewest() {
    let sections = NotificationsFeed.group([
      notification("f-old", .follow, from: "vic", name: "Vic", hoursAgo: 24 * 300),
      notification("f-new", .follow, from: "vic", name: "Vic", hoursAgo: 2, read: true),
      notification("f-mid", .follow, from: "vic", name: "Vic", hoursAgo: 24 * 40),
    ], now: now, calendar: calendar)

    XCTAssertEqual(sections.map(\.id), [.today])
    let group = sections[0].groups[0]
    XCTAssertEqual(group.items.map(\.id), ["f-new", "f-mid", "f-old"])
    XCTAssertFalse(group.isRead)
    XCTAssertEqual(group.unreadIDs, ["f-mid", "f-old"])
    XCTAssertEqual(NotificationsFeed.sentence(group), "Vic empezó a seguirte")
  }

  func testLikesOnOnePostAreJoinedAndCommentsStayAlone() {
    let sections = NotificationsFeed.group([
      notification("l1", from: "ana", name: "Ana", hoursAgo: 1),
      notification("l2", from: "bruno", name: "Bruno", hoursAgo: 2),
      notification("l3", from: "carla", name: "Carla", hoursAgo: 3),
      notification("l4", from: "dani", name: "Dani", post: "p2", hoursAgo: 4),
      notification("c1", .comment, from: "ana", name: "Ana", hoursAgo: 5),
      notification("l5", from: "eva", name: "Eva", hoursAgo: 24 * 3),
    ], now: now, calendar: calendar)

    XCTAssertEqual(sections.map(\.id), [.today, .week])
    XCTAssertEqual(sections[0].groups.map(NotificationsFeed.sentence), [
      "Ana y 2 personas más le dieron “Me gusta” a tu publicación",
      "Dani le dio “Me gusta” a tu publicación",
      "Ana comentó en tu publicación",
    ])
    XCTAssertEqual(sections[1].groups.map(NotificationsFeed.sentence), ["Eva le dio “Me gusta” a tu publicación"])

    let two = NotificationsFeed.group([
      notification("a", from: "ana", name: "Ana"),
      notification("b", from: "bruno", name: "Bruno", hoursAgo: 2),
    ], now: now, calendar: calendar)
    XCTAssertEqual(NotificationsFeed.sentence(two[0].groups[0]), "Ana y Bruno le dieron “Me gusta” a tu publicación")
  }

  func testPeriodsAndTimeLabels() {
    let startOfToday = calendar.startOfDay(for: now)
    XCTAssertEqual(NotificationsFeed.section(for: startOfToday.addingTimeInterval(60), now: now, calendar: calendar), .today)
    XCTAssertEqual(NotificationsFeed.section(for: startOfToday.addingTimeInterval(-3_600), now: now, calendar: calendar), .week)
    XCTAssertEqual(NotificationsFeed.section(for: now.addingTimeInterval(-8 * 86_400), now: now, calendar: calendar), .month)
    XCTAssertEqual(NotificationsFeed.section(for: now.addingTimeInterval(-45 * 86_400), now: now, calendar: calendar), .earlier)

    XCTAssertEqual(NotificationsFeed.timeLabel(now.addingTimeInterval(-20), now: now), "Ahora")
    XCTAssertEqual(NotificationsFeed.timeLabel(now.addingTimeInterval(-5 * 60), now: now), "5 min")
    XCTAssertEqual(NotificationsFeed.timeLabel(now.addingTimeInterval(-3 * 3_600), now: now), "3 h")
    XCTAssertEqual(NotificationsFeed.timeLabel(now.addingTimeInterval(-2 * 86_400), now: now), "2 d")
    let february = calendar.date(from: DateComponents(year: 2026, month: 2, day: 12, hour: 12))!
    XCTAssertEqual(NotificationsFeed.timeLabel(february, now: now, calendar: calendar), "12 feb")
    let lastYear = calendar.date(from: DateComponents(year: 2025, month: 2, day: 12, hour: 12))!
    XCTAssertEqual(NotificationsFeed.timeLabel(lastYear, now: now, calendar: calendar), "12 feb 2025")
  }

  func testReadsANotificationDocument() {
    let parsed = ActivityNotification(id: "n1", data: [
      "type": "post_comment", "fromUid": "ana", "fromUserName": " Ana ", "postId": "p1",
      "commentText": "Bien", "read": true,
    ])
    XCTAssertEqual(parsed?.kind, .comment)
    XCTAssertEqual(parsed?.fromName, "Ana")
    XCTAssertEqual(parsed?.commentText, "Bien")
    XCTAssertEqual(parsed?.read, true)
    XCTAssertNil(ActivityNotification(id: "x", data: ["type": "unknown", "fromUid": "ana"]))
    XCTAssertNil(ActivityNotification(id: "y", data: ["type": "follow"]))
  }
}

@MainActor
final class NotificationsViewModelTests: XCTestCase {
  func testLoadsActivityAndRequestsWithoutBlockedSenders() async {
    let repo = FakeNotificationsRepo()
    repo.pages = [ActivityPage(items: [notification("a"), notification("b", from: "troll", name: "Troll")], cursor: nil, hasMore: false)]
    repo.requests = [.groups: [request(.groups, "g1"), request(.groups, "g2", from: "troll")], .followers: [request(.followers, "f1")]]
    let vm = NotificationsViewModel(repo: repo)
    vm.blocked = ["troll"]

    await vm.refresh()

    XCTAssertEqual(vm.activity.map(\.id), ["a"])
    XCTAssertEqual(vm.activityState, .ready)
    XCTAssertEqual(vm.requests.map(\.requestID).sorted(), ["f1", "g1"])
    XCTAssertEqual(vm.count(.groups), 1)
    XCTAssertEqual(vm.unreadRows, 1)
    XCTAssertFalse(vm.isLoadingRequests)
  }

  func testSkipsPagesMadeOnlyOfBlockedSenders() async {
    let repo = FakeNotificationsRepo()
    repo.pages = [
      ActivityPage(items: [notification("x", from: "troll")], cursor: .placeholder, hasMore: true),
      ActivityPage(items: [notification("a")], cursor: nil, hasMore: false),
    ]
    let vm = NotificationsViewModel(repo: repo)
    vm.blocked = ["troll"]

    await vm.loadActivity()

    XCTAssertEqual(vm.activity.map(\.id), ["a"])
    XCTAssertEqual(repo.activityCalls, 2)
  }

  func testMarkingReadCoversTheWholeRowAndIsUndoneWhenRefused() async {
    let repo = FakeNotificationsRepo()
    repo.pages = [ActivityPage(items: [
      notification("f1", .follow, from: "vic"), notification("f2", .follow, from: "vic", hoursAgo: 30),
    ], cursor: nil, hasMore: false)]
    let vm = NotificationsViewModel(repo: repo)
    await vm.loadActivity()
    let row = vm.sections[0].groups[0]

    repo.failsMarkRead = true
    await vm.markRead(row)
    XCTAssertEqual(repo.markedRead, [["f1", "f2"]])
    XCTAssertEqual(vm.unreadRows, 1, "Undone when the server refuses")
    XCTAssertEqual(vm.message, "No se pudo marcar como leída.")

    repo.failsMarkRead = false
    await vm.markRead(vm.sections[0].groups[0])
    XCTAssertEqual(vm.unreadRows, 0)
  }

  func testDeletingRestoresWhatTheServerKept() async {
    let repo = FakeNotificationsRepo()
    repo.pages = [ActivityPage(items: [notification("a"), notification("c", .comment, hoursAgo: 2)], cursor: nil, hasMore: false)]
    repo.failingDeletes = ["a"]
    let vm = NotificationsViewModel(repo: repo)
    await vm.loadActivity()

    let likeRow = vm.sections[0].groups.first { $0.kind == .like }!
    await vm.delete(likeRow)
    XCTAssertEqual(vm.activity.map(\.id), ["a", "c"])
    XCTAssertEqual(vm.message, "No se pudo eliminar la notificación.")

    repo.failingDeletes = []
    await vm.delete(vm.sections[0].groups.first { $0.kind == .like }!)
    XCTAssertEqual(vm.activity.map(\.id), ["c"])
  }

  func testAFailingRequestSourceKeepsTheOthersAndIsRetriedAlone() async {
    let repo = FakeNotificationsRepo()
    repo.requests = [.groups: [request(.groups, "g1")], .collaboration: [request(.collaboration, "c1")]]
    repo.failingKinds = [.collaboration]
    let vm = NotificationsViewModel(repo: repo)

    await vm.loadRequests(Set(IncomingRequest.Kind.allCases))
    XCTAssertEqual(vm.requests.map(\.requestID), ["g1"])
    XCTAssertEqual(vm.failedKinds, [.collaboration])

    repo.failingKinds = []
    await vm.retryFailedRequests()
    XCTAssertEqual(vm.requests.map(\.requestID).sorted(), ["c1", "g1"])
    XCTAssertTrue(vm.failedKinds.isEmpty)
    XCTAssertEqual(repo.requestCalls.filter { $0 == .groups }.count, 1, "Only the failed source is asked again")
  }

  func testAcceptingRemovesTheRequest() async {
    let repo = FakeNotificationsRepo()
    repo.requests = [.groups: [request(.groups, "g1")]]
    let vm = NotificationsViewModel(repo: repo)
    await vm.loadRequests([.groups])

    await vm.accept(vm.requests[0])

    XCTAssertEqual(repo.accepted, ["groups:g1"])
    XCTAssertTrue(vm.requests.isEmpty)
  }
}

@MainActor
final class NotificationBadgeTests: XCTestCase {
  func testAsksAtMostEveryThirtySecondsUnlessForcedOrTheAccountChanges() async {
    let repo = FakeNotificationsRepo()
    repo.badge = 4
    var uid: String? = "me"
    let badge = NotificationBadge(makeRepo: { repo }, currentUID: { uid })

    await badge.refresh()
    await badge.refresh()
    XCTAssertEqual(badge.count, 4)
    XCTAssertEqual(repo.badgeCalls, 1, "A second look within 30 s uses the last count")

    repo.badge = 2
    await badge.refresh(force: true)
    XCTAssertEqual(badge.count, 2)
    XCTAssertEqual(repo.badgeCalls, 2)

    uid = "someone-else"
    await badge.refresh()
    XCTAssertEqual(repo.badgeCalls, 3, "Another account asks at once")

    uid = nil
    await badge.refresh()
    XCTAssertEqual(badge.count, 0, "Signed out: no number on the bell")
  }
}

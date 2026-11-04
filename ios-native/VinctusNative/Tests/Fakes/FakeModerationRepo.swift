import Foundation
@testable import VinctusNative

final class FakeModerationRepo: ModerationRepo {
  var blocked: Set<String> = []
  var reports: [(target: ReportTarget, reason: ReportReason, details: String?)] = []
  var fails = false

  func report(_ target: ReportTarget, reason: ReportReason, details: String?) async throws {
    if fails { throw FakeError() }
    reports.append((target: target, reason: reason, details: details))
  }

  func fetchBlockedUserIDs() async throws -> Set<String> {
    blocked
  }

  func blockUser(_ blockedUID: String) async throws {
    if fails { throw FakeError() }
    blocked.insert(blockedUID)
  }

  func unblockUser(_ blockedUID: String) async throws {
    if fails { throw FakeError() }
    blocked.remove(blockedUID)
  }
}

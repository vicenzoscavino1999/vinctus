import Foundation
@testable import VinctusNative

final class FakeEngagementRepo: EngagementRepo {
  var likedPostIDs: Set<String> = []
  var status = FollowStatus.none
  var fails = false
  var likeWrites: [Bool] = []
  var savedPostIDs: Set<String> = []
  var saveWrites: [Bool] = []
  var readFails = false
  var readHandler: (() async throws -> Bool)?
  var writeHandler: (() async throws -> Void)?
  var followCalls = 0
  var unfollowCalls = 0

  func isPostLiked(postID: String) async throws -> Bool {
    if let readHandler { return try await readHandler() }
    if readFails { throw FakeError() }
    return likedPostIDs.contains(postID)
  }

  func setPostLiked(_ liked: Bool, postID: String) async throws {
    likeWrites.append(liked)
    if let writeHandler { try await writeHandler() }
    if fails { throw FakeError() }
    if liked { likedPostIDs.insert(postID) } else { likedPostIDs.remove(postID) }
  }

  func isPostSaved(postID: String) async throws -> Bool {
    if readFails { throw FakeError() }
    return savedPostIDs.contains(postID)
  }

  func setPostSaved(_ saved: Bool, postID: String) async throws {
    saveWrites.append(saved)
    if fails { throw FakeError() }
    if saved { savedPostIDs.insert(postID) } else { savedPostIDs.remove(postID) }
  }

  func followStatus(targetUID: String) async throws -> FollowStatus {
    if fails { throw FakeError() }
    return status
  }

  func follow(targetUID: String, isPrivate: Bool) async throws -> FollowStatus {
    followCalls += 1
    if fails { throw FakeError() }
    status = isPrivate ? .requested : .following
    return status
  }

  func unfollow(targetUID: String, status: FollowStatus) async throws {
    unfollowCalls += 1
    if fails { throw FakeError() }
    self.status = .none
  }
}

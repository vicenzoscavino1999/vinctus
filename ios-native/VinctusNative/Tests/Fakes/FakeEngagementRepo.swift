import Foundation
@testable import VinctusNative

final class FakeEngagementRepo: EngagementRepo {
  var likedPostIDs: Set<String> = []
  var status = FollowStatus.none
  var fails = false
  var likeWrites: [Bool] = []
  var followCalls = 0
  var unfollowCalls = 0

  func isPostLiked(postID: String) async throws -> Bool {
    likedPostIDs.contains(postID)
  }

  func setPostLiked(_ liked: Bool, postID: String) async throws {
    likeWrites.append(liked)
    if fails { throw FakeError() }
    if liked { likedPostIDs.insert(postID) } else { likedPostIDs.remove(postID) }
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

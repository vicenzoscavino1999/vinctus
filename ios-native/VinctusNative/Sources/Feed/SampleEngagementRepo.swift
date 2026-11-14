import Foundation

/// Screenshot-only data; production always uses FirebaseEngagementRepo.
struct SampleEngagementRepo: EngagementRepo {
  func isPostLiked(postID: String) async throws -> Bool { false }
  func setPostLiked(_ liked: Bool, postID: String) async throws {}
  func isPostSaved(postID: String) async throws -> Bool { false }
  func setPostSaved(_ saved: Bool, postID: String) async throws {}
  func followStatus(targetUID: String) async throws -> FollowStatus { .none }
  func follow(targetUID: String, isPrivate: Bool) async throws -> FollowStatus { isPrivate ? .requested : .following }
  func unfollow(targetUID: String, status: FollowStatus) async throws {}
}

import Foundation

/// State of a post's like button. Updates right away and rolls back if the write fails.
@MainActor
final class LikeViewModel: ObservableObject {
  @Published private(set) var isLiked = false
  /// The count after the user's own taps; nil until the first tap, so the post's count shows.
  @Published private(set) var count: Int?
  @Published private(set) var isSaving = false

  private let postID: String
  private let repo: EngagementRepo

  init(postID: String, repo: EngagementRepo) {
    self.postID = postID
    self.repo = repo
  }

  func load() async {
    isLiked = (try? await repo.isPostLiked(postID: postID)) ?? false
  }

  func displayedCount(initialCount: Int) -> Int {
    max(0, count ?? initialCount)
  }

  func toggle(initialCount: Int) async {
    guard !isSaving else { return }
    let wasLiked = isLiked
    let previousCount = count ?? initialCount
    isLiked = !wasLiked
    count = previousCount + (wasLiked ? -1 : 1)
    isSaving = true
    defer { isSaving = false }
    do {
      try await repo.setPostLiked(!wasLiked, postID: postID)
    } catch {
      isLiked = wasLiked
      count = previousCount
    }
  }
}

/// State of the follow button on another user's profile. Private accounts get a follow request.
@MainActor
final class FollowViewModel: ObservableObject {
  /// nil until loaded.
  @Published private(set) var status: FollowStatus?
  @Published private(set) var isSaving = false
  @Published private(set) var errorMessage: String?

  private let targetUID: String
  private let repo: EngagementRepo

  init(targetUID: String, repo: EngagementRepo) {
    self.targetUID = targetUID
    self.repo = repo
  }

  var title: String {
    switch status {
    case .some(.following):
      return "Siguiendo"
    case .some(.requested):
      return "Solicitud enviada"
    default:
      return "Seguir"
    }
  }

  func load() async {
    status = (try? await repo.followStatus(targetUID: targetUID)) ?? FollowStatus.none
  }

  /// Follows (or asks to follow a private account), or undoes the follow or the request.
  func toggle(isPrivate: Bool) async {
    guard let current = status, !isSaving else { return }
    isSaving = true
    errorMessage = nil
    defer { isSaving = false }
    do {
      if current == FollowStatus.none {
        status = try await repo.follow(targetUID: targetUID, isPrivate: isPrivate)
      } else {
        try await repo.unfollow(targetUID: targetUID, status: current)
        status = FollowStatus.none
      }
    } catch {
      errorMessage = "No se pudo actualizar. Intenta de nuevo."
    }
  }
}

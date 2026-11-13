import Foundation

enum PostReactionKind { case like, save }

/// A failed confirmation retains the intended value; retry never toggles it back.
@MainActor
final class PostReactionViewModel: ObservableObject {
  @Published private(set) var isSelected = false
  /// The count after the user's own taps; nil until the first tap, so the post's count shows.
  @Published private(set) var count: Int?
  @Published private(set) var isSaving = false
  @Published private(set) var isLoading = false
  @Published private(set) var isLoaded = false
  @Published private(set) var errorMessage: String?
  @Published private(set) var pendingValue: Bool?

  private let postID: String
  private let repo: EngagementRepo
  private let kind: PostReactionKind

  init(postID: String, repo: EngagementRepo, kind: PostReactionKind = .like) {
    self.postID = postID
    self.repo = repo
    self.kind = kind
  }

  func load() async {
    guard !isLoading, !isSaving, pendingValue == nil else { return }
    isLoading = true
    isLoaded = false
    errorMessage = nil
    defer { isLoading = false }
    do {
      if kind == .like { isSelected = try await repo.isPostLiked(postID: postID) }
      else { isSelected = try await repo.isPostSaved(postID: postID) }
      isLoaded = true
    } catch {
      errorMessage = "No se pudo consultar. Reintenta."
    }
  }

  func displayedCount(initialCount: Int) -> Int {
    max(0, count ?? initialCount)
  }

  func toggle(initialCount: Int) async {
    guard !isSaving, !isLoading else { return }
    guard isLoaded else { await load(); return }
    let wasLiked = isSelected
    let previousCount = count ?? initialCount
    let desired = pendingValue ?? !wasLiked
    pendingValue = desired
    isSelected = desired
    count = max(0, previousCount + (desired == wasLiked ? 0 : desired ? 1 : -1))
    isSaving = true
    errorMessage = nil
    defer { isSaving = false }
    do {
      if kind == .like { try await repo.setPostLiked(desired, postID: postID) }
      else { try await repo.setPostSaved(desired, postID: postID) }
      pendingValue = nil
    } catch {
      isSelected = wasLiked
      count = previousCount
      errorMessage = "No se confirmó el cambio. Reintenta."
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

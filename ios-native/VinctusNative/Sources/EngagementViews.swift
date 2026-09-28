import SwiftUI

/// Heart button with the like count. Updates right away and rolls back if the write fails.
struct LikeButton: View {
  let postID: String
  let initialCount: Int
  var repo: EngagementRepo = FirebaseEngagementRepo()

  @State private var isLiked = false
  @State private var count: Int?
  @State private var isSaving = false

  var body: some View {
    Button(action: toggle) {
      Label("\(max(0, count ?? initialCount))", systemImage: isLiked ? "heart.fill" : "heart")
        .foregroundStyle(isLiked ? SwiftUI.Color.red : VinctusTokens.Color.textMuted)
        .contentTransition(.symbolEffect(.replace))
    }
    .buttonStyle(.borderless)
    .disabled(isSaving)
    .accessibilityLabel(isLiked ? "Quitar me gusta" : "Me gusta")
    .task(id: postID) {
      isLiked = (try? await repo.isPostLiked(postID: postID)) ?? false
    }
  }

  private func toggle() {
    let wasLiked = isLiked
    let previousCount = count ?? initialCount
    isLiked.toggle()
    count = previousCount + (isLiked ? 1 : -1)
    isSaving = true
    Task {
      do {
        try await repo.setPostLiked(isLiked, postID: postID)
      } catch {
        isLiked = wasLiked
        count = previousCount
      }
      isSaving = false
    }
  }
}

/// Follow / unfollow button for another user's profile. Private accounts get a follow request.
struct FollowButton: View {
  let targetUID: String
  let isPrivate: Bool
  var repo: EngagementRepo = FirebaseEngagementRepo()
  /// Called with the loaded status and after every change.
  var onStatusChange: ((FollowStatus) -> Void)? = nil

  @State private var status: FollowStatus?
  @State private var isSaving = false
  @State private var errorMessage: String?

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      Button(action: toggle) {
        HStack(spacing: 6) {
          if isSaving {
            ProgressView()
              .controlSize(.small)
          }
          Text(title)
            .font(.subheadline.weight(.semibold))
        }
        .frame(maxWidth: .infinity)
        .frame(height: 40)
        .foregroundStyle(status == FollowStatus.none ? SwiftUI.Color.black : VinctusTokens.Color.textPrimary)
        .background(status == FollowStatus.none ? VinctusTokens.Color.accent : VinctusTokens.Color.surface2)
        .clipShape(RoundedRectangle(cornerRadius: VinctusTokens.Radius.sm, style: .continuous))
      }
      .buttonStyle(.plain)
      .disabled(status == nil || isSaving)

      if let errorMessage {
        Text(errorMessage)
          .font(.caption)
          .foregroundStyle(.red)
      }
    }
    .task(id: targetUID) {
      status = (try? await repo.followStatus(targetUID: targetUID)) ?? FollowStatus.none
    }
    .onChange(of: status) { _, newValue in
      if let newValue { onStatusChange?(newValue) }
    }
  }

  private var title: String {
    switch status {
    case .some(.following):
      return "Siguiendo"
    case .some(.requested):
      return "Solicitud enviada"
    default:
      return "Seguir"
    }
  }

  private func toggle() {
    guard let current = status else { return }
    isSaving = true
    errorMessage = nil
    Task {
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
      isSaving = false
    }
  }
}

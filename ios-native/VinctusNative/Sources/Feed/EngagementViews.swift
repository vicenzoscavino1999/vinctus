import SwiftUI

/// Heart button with the like count. Updates right away and rolls back if the write fails.
struct LikeButton: View {
  let initialCount: Int

  @StateObject private var vm: LikeViewModel

  init(postID: String, initialCount: Int, repo: EngagementRepo = AppRepos.engagement()) {
    self.initialCount = initialCount
    _vm = StateObject(wrappedValue: LikeViewModel(postID: postID, repo: repo))
  }

  var body: some View {
    Button {
      Task { await vm.toggle(initialCount: initialCount) }
    } label: {
      Label("\(vm.displayedCount(initialCount: initialCount))", systemImage: vm.isLiked ? "heart.fill" : "heart")
        .foregroundStyle(vm.isLiked ? SwiftUI.Color.red : VinctusTokens.Color.textMuted)
        .contentTransition(.symbolEffect(.replace))
    }
    .buttonStyle(.borderless)
    .disabled(vm.isSaving)
    .accessibilityLabel(vm.isLiked ? "Quitar me gusta" : "Me gusta")
    .task { await vm.load() }
  }
}

/// Follow / unfollow button for another user's profile. Private accounts get a follow request.
struct FollowButton: View {
  let isPrivate: Bool
  /// Called with the loaded status and after every change.
  let onStatusChange: ((FollowStatus) -> Void)?

  @StateObject private var vm: FollowViewModel

  init(
    targetUID: String,
    isPrivate: Bool,
    repo: EngagementRepo = AppRepos.engagement(),
    onStatusChange: ((FollowStatus) -> Void)? = nil
  ) {
    self.isPrivate = isPrivate
    self.onStatusChange = onStatusChange
    _vm = StateObject(wrappedValue: FollowViewModel(targetUID: targetUID, repo: repo))
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      Button {
        Task { await vm.toggle(isPrivate: isPrivate) }
      } label: {
        HStack(spacing: 6) {
          if vm.isSaving {
            ProgressView()
              .controlSize(.small)
          }
          Text(vm.title)
            .font(.subheadline.weight(.semibold))
        }
        .frame(maxWidth: .infinity)
        .frame(height: 40)
        .foregroundStyle(vm.status == FollowStatus.none ? SwiftUI.Color.black : VinctusTokens.Color.textPrimary)
        .background(vm.status == FollowStatus.none ? VinctusTokens.Color.accent : VinctusTokens.Color.surface2)
        .clipShape(RoundedRectangle(cornerRadius: VinctusTokens.Radius.sm, style: .continuous))
      }
      .buttonStyle(.plain)
      .disabled(vm.status == nil || vm.isSaving)

      if let errorMessage = vm.errorMessage {
        Text(errorMessage)
          .font(.caption)
          .foregroundStyle(.red)
      }
    }
    .task { await vm.load() }
    .onChange(of: vm.status) { _, newValue in
      if let newValue { onStatusChange?(newValue) }
    }
  }
}

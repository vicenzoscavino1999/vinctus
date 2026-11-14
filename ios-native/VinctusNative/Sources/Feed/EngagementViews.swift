import SwiftUI

/// Heart button with the like count. Updates right away and rolls back if the write fails.
struct PostReactionButton: View {
  let postID: String
  let initialCount: Int
  let repo: EngagementRepo
  let kind: PostReactionKind
  @EnvironmentObject private var authVM: AuthViewModel

  init(postID: String, initialCount: Int = 0, repo: EngagementRepo = AppRepos.engagement(), kind: PostReactionKind = .like) {
    self.postID = postID
    self.initialCount = initialCount
    self.repo = repo
    self.kind = kind
  }

  var body: some View {
    PostReactionButtonSession(postID: postID, initialCount: initialCount, repo: repo, kind: kind)
      .id("\(authVM.currentUserID ?? "anonymous")|\(postID)|\(kind)")
  }
}

private struct PostReactionButtonSession: View {
  let initialCount: Int

  @StateObject private var vm: PostReactionViewModel

  private let isSave: Bool

  init(postID: String, initialCount: Int = 0, repo: EngagementRepo = AppRepos.engagement(), kind: PostReactionKind = .like) {
    self.initialCount = initialCount
    self.isSave = kind == .save
    _vm = StateObject(wrappedValue: PostReactionViewModel(postID: postID, repo: repo, kind: kind))
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
    Button {
      Task { await vm.toggle(initialCount: initialCount) }
    } label: {
      HStack(spacing: 4) {
        if vm.isLoading || vm.isSaving { ProgressView().controlSize(.mini) }
        Label(isSave ? (vm.isSelected ? "Guardado" : "Guardar") : "\(vm.displayedCount(initialCount: initialCount))",
          systemImage: isSave ? (vm.isSelected ? "bookmark.fill" : "bookmark") : (vm.isSelected ? "heart.fill" : "heart"))
      }
        .foregroundStyle(vm.isSelected ? (isSave ? VinctusTokens.Color.accent : SwiftUI.Color.red) : VinctusTokens.Color.textMuted)
        .contentTransition(.symbolEffect(.replace))
    }
    .buttonStyle(.borderless)
    .disabled(vm.isSaving || vm.isLoading)
    .accessibilityLabel(actionLabel)
    .accessibilityValue(vm.isLoaded ? (vm.isSelected ? "Activado" : "Desactivado") : "Estado sin confirmar")
    if let error = vm.errorMessage {
      Text(error).font(.caption2).foregroundStyle(.red)
    }
    }
    .task { await vm.load() }
    .onChange(of: initialCount) { _, value in vm.syncCount(value) }
  }

  private var actionLabel: String {
    if !vm.isLoaded { return "Reintentar consulta" }
    if let desired = vm.pendingValue {
      return desired ? (isSave ? "Reintentar guardar" : "Reintentar me gusta") : (isSave ? "Reintentar quitar de guardados" : "Reintentar quitar me gusta")
    }
    return isSave ? (vm.isSelected ? "Quitar de guardados" : "Guardar publicación") : (vm.isSelected ? "Quitar me gusta" : "Me gusta")
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

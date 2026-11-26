import SwiftUI

/// Puts `VinctusTopBar` (Shared) on a screen and opens what its buttons lead to. It lives in App,
/// not Shared, because it reaches into the Feed and AI features.
private struct VinctusTopBarModifier: ViewModifier {
  @ObservedObject private var badge = NotificationBadge.shared
  @State private var isCreatingPost = false
  @State private var isShowingAI = false
  @State private var isShowingNotifications = false

  func body(content: Content) -> some View {
    content
      .toolbar(.hidden, for: .navigationBar)
      .safeAreaInset(edge: .top, spacing: 0) {
        VinctusTopBar(
          unreadCount: badge.count,
          onCreatePost: { isCreatingPost = true },
          onOpenAI: { isShowingAI = true },
          onOpenNotifications: { isShowingNotifications = true }
        )
      }
      .navigationDestination(isPresented: $isCreatingPost) {
        CreatePostView(repo: AppRepos.createPost())
      }
      .navigationDestination(isPresented: $isShowingAI) {
        AIHubView(repo: AppRepos.ai())
      }
      .navigationDestination(isPresented: $isShowingNotifications) {
        NotificationsView()
      }
      .task {
        await badge.refresh()
      }
      .onReceive(NotificationCenter.default.publisher(for: .vinctusNotificationsChanged)) { _ in
        Task { await badge.refresh(force: true) }
      }
      .onAppear {
        // Screenshot builds open Notifications with `-VinctusOpenNotifications 1`.
        if !isShowingNotifications, AppRepos.demoArgument("-VinctusOpenNotifications") != nil {
          isShowingNotifications = true
        }
      }
  }
}

extension View {
  /// Shows the Vinctus header on a tab's root screen (inside its NavigationStack).
  func vinctusTopBar() -> some View {
    modifier(VinctusTopBarModifier())
  }
}

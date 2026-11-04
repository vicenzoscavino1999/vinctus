import SwiftUI

/// Puts `VinctusTopBar` (Shared) on a screen and opens what its buttons lead to. It lives in App,
/// not Shared, because it reaches into the Feed and AI features.
private struct VinctusTopBarModifier: ViewModifier {
  @State private var isCreatingPost = false
  @State private var isShowingAI = false

  func body(content: Content) -> some View {
    content
      .toolbar(.hidden, for: .navigationBar)
      .safeAreaInset(edge: .top, spacing: 0) {
        VinctusTopBar(
          onCreatePost: { isCreatingPost = true },
          onOpenAI: { isShowingAI = true }
        )
      }
      .navigationDestination(isPresented: $isCreatingPost) {
        CreatePostView(repo: AppRepos.createPost())
      }
      .navigationDestination(isPresented: $isShowingAI) {
        AIHubView(repo: AppRepos.ai())
      }
  }
}

extension View {
  /// Shows the Vinctus header on a tab's root screen (inside its NavigationStack).
  func vinctusTopBar() -> some View {
    modifier(VinctusTopBarModifier())
  }
}

import SwiftUI

/// The web's fixed header (`src/app/routes/Header.tsx`): gold "+" to create a post on the left,
/// the Vinctus wordmark in the middle and AI on the right, over a thin bottom border.
struct VinctusTopBar: View {
  let onCreatePost: () -> Void
  let onOpenAI: () -> Void

  var body: some View {
    HStack(spacing: 0) {
      Button(action: onCreatePost) {
        Image(systemName: "plus")
          .font(.system(size: 20, weight: .semibold))
          .foregroundStyle(.black)
          .frame(width: 44, height: 44)
          .background(
            LinearGradient(
              colors: [VinctusTokens.Color.accentBright, VinctusTokens.Color.accent],
              startPoint: .topLeading,
              endPoint: .bottomTrailing
            )
          )
          .clipShape(Circle())
          .shadow(color: VinctusTokens.Color.accent.opacity(0.35), radius: 10, y: 4)
      }
      .buttonStyle(.plain)
      .accessibilityLabel("Crear publicación")
      .frame(width: 64, alignment: .leading)

      Text("Vinctus")
        .font(VinctusTokens.Typography.serif(22))
        .foregroundStyle(VinctusTokens.Color.textPrimary)
        .frame(maxWidth: .infinity)

      Button(action: onOpenAI) {
        Image(systemName: "sparkles")
          .font(.system(size: 21, weight: .light))
          .foregroundStyle(VinctusTokens.Color.textSecondary)
          .frame(width: 44, height: 44)
      }
      .buttonStyle(.plain)
      .accessibilityLabel("Inteligencia artificial")
      .frame(width: 64, alignment: .trailing)
    }
    .padding(.horizontal, 16)
    .padding(.vertical, 8)
    .background(VinctusTokens.Color.background.opacity(0.95))
    .background(.ultraThinMaterial)
    .overlay(alignment: .bottom) {
      Rectangle()
        .fill(VinctusTokens.Color.border.opacity(0.5))
        .frame(height: 0.5)
    }
  }
}

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

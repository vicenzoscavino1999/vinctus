import SwiftUI

/// The web's fixed header (`src/app/routes/Header.tsx`): gold "+" to create a post on the left,
/// the Vinctus wordmark in the middle, AI and the notifications bell on the right, over a thin
/// bottom border.
struct VinctusTopBar: View {
  var unreadCount: Int = 0
  let onCreatePost: () -> Void
  let onOpenAI: () -> Void
  var onOpenNotifications: () -> Void = {}

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
      .frame(width: 92, alignment: .leading)

      Text("Vinctus")
        .font(VinctusTokens.Typography.serif(22))
        .foregroundStyle(VinctusTokens.Color.textPrimary)
        .frame(maxWidth: .infinity)

      HStack(spacing: 4) {
        Button(action: onOpenAI) {
          Image(systemName: "sparkles")
            .font(.system(size: 21, weight: .light))
            .foregroundStyle(VinctusTokens.Color.textSecondary)
            .frame(width: 44, height: 44)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Inteligencia artificial")

        Button(action: onOpenNotifications) {
          Image(systemName: "bell")
            .font(.system(size: 20, weight: .light))
            .foregroundStyle(VinctusTokens.Color.textSecondary)
            .frame(width: 44, height: 44)
            .overlay(alignment: .topTrailing) {
              if unreadCount > 0 {
                Text(unreadCount > 99 ? "99+" : "\(unreadCount)")
                  .font(.system(size: 10, weight: .bold))
                  .foregroundStyle(.white)
                  .padding(.horizontal, 4)
                  .frame(minWidth: 17, minHeight: 17)
                  .background(Capsule().fill(SwiftUI.Color(red: 0.94, green: 0.27, blue: 0.27)))
                  .offset(x: -4, y: 6)
              }
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(unreadCount > 0 ? "Notificaciones, \(unreadCount) sin leer" : "Notificaciones")
      }
      .frame(width: 92, alignment: .trailing)
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

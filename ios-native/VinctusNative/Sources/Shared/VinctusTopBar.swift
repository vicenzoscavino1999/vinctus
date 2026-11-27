import SwiftUI

/// The web's fixed header (`src/app/routes/Header.tsx`): gold "+" to create a post on the left,
/// the Vinctus wordmark in the middle, AI and the notifications bell on the right, over a thin
/// bottom border.
struct VinctusTopBar: View {
  var unreadCount: Int = 0
  let onCreatePost: () -> Void
  let onOpenAI: () -> Void
  var onOpenNotifications: () -> Void = {}
  @Environment(\.usesGlass) private var usesGlass

  var body: some View {
    HStack(spacing: 0) {
      Button(action: onCreatePost) {
        Image(systemName: "plus")
          .font(.system(size: 20, weight: .semibold))
          .foregroundStyle(.black)
          .frame(width: 44, height: 44)
          .background {
            if !usesGlass {
              LinearGradient(
                colors: [VinctusTokens.Color.accentBright, VinctusTokens.Color.accent],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
              )
            }
          }
          .clipShape(Circle())
          .vinctusGlassCircle(usesGlass, tint: VinctusTokens.Color.accent)
          .shadow(color: VinctusTokens.Color.accent.opacity(usesGlass ? 0 : 0.35), radius: 10, y: 4)
      }
      .buttonStyle(.plain)
      .accessibilityLabel("Crear publicación")
      .frame(width: 92, alignment: .leading)

      Text("Vinctus")
        .font(VinctusTokens.Typography.serif(22))
        .foregroundStyle(VinctusTokens.Color.textPrimary)
        .frame(maxWidth: .infinity)

      HStack(spacing: usesGlass ? 8 : 4) {
        Button(action: onOpenAI) {
          Image(systemName: "sparkles")
            .font(.system(size: 21, weight: .light))
            .foregroundStyle(VinctusTokens.Color.textSecondary)
            .frame(width: 44, height: 44)
            .vinctusGlassCircle(usesGlass)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Inteligencia artificial")

        Button(action: onOpenNotifications) {
          Image(systemName: "bell")
            .font(.system(size: 20, weight: .light))
            .foregroundStyle(VinctusTokens.Color.textSecondary)
            .frame(width: 44, height: 44)
            .vinctusGlassCircle(usesGlass)
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
    // In glass the bar is lighter and borderless, so the glass buttons carry it.
    .background(VinctusTokens.Color.background.opacity(usesGlass ? 0.55 : 0.95))
    .background(.ultraThinMaterial)
    .overlay(alignment: .bottom) {
      if !usesGlass {
        Rectangle()
          .fill(VinctusTokens.Color.border.opacity(0.5))
          .frame(height: 0.5)
      }
    }
  }
}

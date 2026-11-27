import SwiftUI

/// The emoji of each Arena persona, like the web's `ARENA_PERSONAS` avatars.
enum ArenaPersonaStyle {
  static func emoji(for personaID: String) -> String {
    switch personaID {
    case "scientist": return "🔬"
    case "philosopher": return "🤔"
    case "pragmatist": return "⚙️"
    case "skeptic": return "🧐"
    case "optimist": return "🌟"
    case "devil": return "😈"
    default: return "🎙️"
    }
  }
}

/// The assistant's round gold sparkle, next to its replies.
struct AIAssistantAvatar: View {
  var size: CGFloat = 30

  var body: some View {
    Image(systemName: "sparkles")
      .font(.system(size: size * 0.45, weight: .semibold))
      .foregroundStyle(VinctusTokens.Color.accent)
      .frame(width: size, height: size)
      .background(VinctusTokens.Color.accent.opacity(0.15), in: Circle())
      .accessibilityHidden(true)
  }
}

/// A small rounded chip button (suggestions and ideas).
struct AISuggestionChip: View {
  let text: String
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      Text(text)
        .font(.subheadline)
        .foregroundStyle(VinctusTokens.Color.textSecondary)
        .multilineTextAlignment(.leading)
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(
          RoundedRectangle(cornerRadius: 16, style: .continuous)
            .stroke(VinctusTokens.Color.border, lineWidth: 1)
        )
        .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
  }
}

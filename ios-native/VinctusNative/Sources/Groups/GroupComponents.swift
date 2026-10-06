import SwiftUI

// MARK: - Pieces

struct CompactLabelStyle: LabelStyle {
  func makeBody(configuration: Configuration) -> some View {
    HStack(spacing: 4) {
      configuration.icon
      configuration.title
    }
  }
}

/// Buttons of the group header, like the web's rounded-button row.
struct GroupActionButton: View {
  enum Style {
    case gold
    case neutral
    case muted
    case danger
  }

  let title: String
  var systemImage: String?
  let style: Style
  let action: () -> Void

  @Environment(\.isEnabled) private var isEnabled

  var body: some View {
    Button(action: action) {
      HStack(spacing: 6) {
        if let systemImage {
          Image(systemName: systemImage)
        }
        Text(title)
      }
      .font(.subheadline.weight(.medium))
      .foregroundStyle(foreground)
      .padding(.horizontal, 18)
      .padding(.vertical, 12)
      .background(background)
      .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
      .overlay(
        RoundedRectangle(cornerRadius: 10, style: .continuous)
          .stroke(border, lineWidth: 1)
      )
      .opacity(isEnabled || style == .gold ? 1 : 0.5)
    }
    .buttonStyle(.plain)
  }

  private var foreground: SwiftUI.Color {
    switch style {
    case .gold: return .black
    case .neutral: return VinctusTokens.Color.textPrimary
    case .muted: return VinctusTokens.Color.textMuted
    case .danger: return SwiftUI.Color(red: 0.99, green: 0.65, blue: 0.65)
    }
  }

  private var background: SwiftUI.Color {
    switch style {
    case .gold: return VinctusTokens.Color.accent
    case .neutral, .muted: return VinctusTokens.Color.surface3
    case .danger: return SwiftUI.Color.red.opacity(0.1)
    }
  }

  private var border: SwiftUI.Color {
    switch style {
    case .gold: return .clear
    case .neutral, .muted: return SwiftUI.Color(white: 0.25)
    case .danger: return SwiftUI.Color.red.opacity(0.3)
    }
  }
}

/// Rounded-square group icon with the photo or the name's initial (web's detail header).
struct GroupSquareIcon: View {
  let name: String
  let iconURL: String?
  let size: CGFloat

  var body: some View {
    ZStack {
      RoundedRectangle(cornerRadius: 16, style: .continuous)
        .fill(VinctusTokens.Color.surface3)
      if let iconURL, let url = URL(string: iconURL) {
        AsyncImage(url: url) { phase in
          if case .success(let image) = phase {
            image.resizable().scaledToFill()
          } else {
            initial
          }
        }
      } else {
        initial
      }
    }
    .frame(width: size, height: size)
    .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    .overlay(
      RoundedRectangle(cornerRadius: 16, style: .continuous)
        .stroke(SwiftUI.Color(white: 0.25), lineWidth: 1)
    )
  }

  private var initial: some View {
    Text(String(name.prefix(1)).uppercased())
      .font(.title2)
      .foregroundStyle(VinctusTokens.Color.textPrimary.opacity(0.85))
  }
}

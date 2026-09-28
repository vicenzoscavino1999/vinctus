import SwiftUI

enum VinctusTokens {
  enum Spacing {
    static let xs: CGFloat = 6
    static let sm: CGFloat = 10
    static let md: CGFloat = 14
    static let lg: CGFloat = 18
    static let xl: CGFloat = 24
  }

  enum Radius {
    static let sm: CGFloat = 10
    static let md: CGFloat = 14
    static let lg: CGFloat = 18
  }

  /// Same palette as the web (`src/index.css`, `tailwind.config.js`): neutral grays and brand gold.
  enum Color {
    static let accent = SwiftUI.Color(red: 0.831, green: 0.686, blue: 0.216) // brand-gold #D4AF37
    static let accentBright = SwiftUI.Color(red: 0.984, green: 0.749, blue: 0.141) // amber-400
    static let accentAlt = SwiftUI.Color(red: 0.25, green: 0.75, blue: 0.87) // --accent-2
    static let background = SwiftUI.Color(white: 0.04) // --bg
    static let surface = SwiftUI.Color(white: 0.07) // --surface-1
    static let surface2 = SwiftUI.Color(white: 0.10) // --surface-2
    static let surface3 = SwiftUI.Color(white: 0.14) // --surface-3
    static let border = SwiftUI.Color(white: 0.15) // neutral-800
    static let textPrimary = SwiftUI.Color(white: 0.98) // --text-1
    static let textSecondary = SwiftUI.Color(white: 0.64) // neutral-400
    static let textMuted = SwiftUI.Color(white: 0.45) // neutral-500
  }

  /// Playfair Display (bundled, like the web's `--font-serif`) for titles; the system font elsewhere.
  enum Typography {
    static func brandTitle(size: CGFloat = 42) -> Font {
      .custom("PlayfairDisplay-Regular", size: size)
    }

    static func sectionTitle(size: CGFloat = 18) -> Font {
      .custom("PlayfairDisplay-Medium", size: size)
    }

    static func serif(_ size: CGFloat, weight: SerifWeight = .regular) -> Font {
      .custom(weight.fontName, size: size)
    }

    enum SerifWeight {
      case regular
      case medium
      case semibold

      var fontName: String {
        switch self {
        case .regular: return "PlayfairDisplay-Regular"
        case .medium: return "PlayfairDisplay-Medium"
        case .semibold: return "PlayfairDisplay-SemiBold"
        }
      }
    }
  }
}

struct VCard<Content: View>: View {
  let content: Content

  init(@ViewBuilder content: () -> Content) {
    self.content = content()
  }

  var body: some View {
    content
      .padding(VinctusTokens.Spacing.md)
      .background(VinctusTokens.Color.surface)
      .clipShape(RoundedRectangle(cornerRadius: VinctusTokens.Radius.md, style: .continuous))
      .overlay(
        RoundedRectangle(cornerRadius: VinctusTokens.Radius.md, style: .continuous)
          .stroke(VinctusTokens.Color.border.opacity(0.55), lineWidth: 1)
      )
  }
}

enum VButtonVariant {
  case primary
  case secondary
  case destructive
}

struct VButtonStyle: ButtonStyle {
  let variant: VButtonVariant

  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .font(.headline)
      .frame(maxWidth: .infinity)
      .padding(.vertical, 12)
      .padding(.horizontal, 14)
      .background(background(configuration: configuration))
      .foregroundStyle(foreground)
      .clipShape(RoundedRectangle(cornerRadius: VinctusTokens.Radius.md, style: .continuous))
      .opacity(configuration.isPressed ? 0.86 : 1)
  }

  private var foreground: SwiftUI.Color {
    switch variant {
    case .primary, .destructive:
      return .black
    case .secondary:
      return VinctusTokens.Color.textPrimary
    }
  }

  private func background(configuration: Configuration) -> some View {
    let base: SwiftUI.Color
    switch variant {
    case .primary:
      base = VinctusTokens.Color.accent
    case .secondary:
      base = VinctusTokens.Color.surface2
    case .destructive:
      base = .red
    }

    return base
      .shadow(color: .black.opacity(0.22), radius: configuration.isPressed ? 0 : 8, y: 6)
  }
}

struct VButton: View {
  let title: String
  let variant: VButtonVariant
  let action: () -> Void

  init(_ title: String, variant: VButtonVariant = .primary, action: @escaping () -> Void) {
    self.title = title
    self.variant = variant
    self.action = action
  }

  var body: some View {
    Button(action: action) {
      Text(title)
    }
    .buttonStyle(VButtonStyle(variant: variant))
  }
}

struct VInlineStatus: View {
  let title: String
  let isGood: Bool

  var body: some View {
    HStack(spacing: 8) {
      Circle()
        .fill(isGood ? .green : .orange)
        .frame(width: 8, height: 8)
      Text(title)
        .font(.subheadline)
        .foregroundStyle(.secondary)
    }
  }
}

struct VLoadingOverlay: ViewModifier {
  let isLoading: Bool

  func body(content: Content) -> some View {
    ZStack {
      content
      if isLoading {
        SwiftUI.Color.black.opacity(0.08)
          .ignoresSafeArea()
        ProgressView()
          .padding(VinctusTokens.Spacing.lg)
          .background(VinctusTokens.Color.surface)
          .clipShape(RoundedRectangle(cornerRadius: VinctusTokens.Radius.md, style: .continuous))
          .tint(VinctusTokens.Color.accent)
      }
    }
  }
}

extension View {
  func vinctusLoading(_ isLoading: Bool) -> some View {
    modifier(VLoadingOverlay(isLoading: isLoading))
  }
}

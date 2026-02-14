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

  enum Color {
    static let accent = SwiftUI.Color(red: 0.91, green: 0.73, blue: 0.20) // Vinctus gold
    static let accentAlt = SwiftUI.Color(red: 0.07, green: 0.69, blue: 0.58)
    static let background = SwiftUI.Color(red: 0.02, green: 0.03, blue: 0.04)
    static let surface = SwiftUI.Color(red: 0.08, green: 0.09, blue: 0.11)
    static let surface2 = SwiftUI.Color(red: 0.12, green: 0.13, blue: 0.16)
    static let border = SwiftUI.Color(red: 0.23, green: 0.24, blue: 0.28)
    static let textPrimary = SwiftUI.Color(red: 0.95, green: 0.95, blue: 0.93)
    static let textMuted = SwiftUI.Color(red: 0.65, green: 0.66, blue: 0.69)
  }

  enum Typography {
    static func brandTitle(size: CGFloat = 42) -> Font {
      .system(size: size, weight: .regular, design: .serif)
    }

    static func sectionTitle(size: CGFloat = 18) -> Font {
      .system(size: size, weight: .semibold, design: .serif)
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

import SwiftUI

/// A text field with an icon, styled for the sign-in screens.
struct AuthField<Content: View>: View {
  let systemImage: String
  @ViewBuilder let content: () -> Content

  var body: some View {
    HStack(spacing: 12) {
      Image(systemName: systemImage)
        .foregroundStyle(VinctusTokens.Color.textMuted)
        .frame(width: 20)
      content()
    }
    .padding(.horizontal, 14)
    .frame(height: 52)
    .background(VinctusTokens.Color.surface2)
    .clipShape(RoundedRectangle(cornerRadius: VinctusTokens.Radius.md, style: .continuous))
    .overlay(
      RoundedRectangle(cornerRadius: VinctusTokens.Radius.md, style: .continuous)
        .stroke(VinctusTokens.Color.border.opacity(0.6), lineWidth: 1)
    )
  }
}

/// An error or info message on the sign-in screens.
struct AuthBanner: View {
  let text: String
  let systemImage: String
  let tint: SwiftUI.Color

  var body: some View {
    HStack(alignment: .top, spacing: 10) {
      Image(systemName: systemImage)
        .foregroundStyle(tint)
      Text(text)
        .font(.footnote)
        .foregroundStyle(VinctusTokens.Color.textPrimary)
      Spacer(minLength: 0)
    }
    .padding(12)
    .background(tint.opacity(0.12))
    .clipShape(RoundedRectangle(cornerRadius: VinctusTokens.Radius.sm, style: .continuous))
  }
}

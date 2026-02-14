import SwiftUI

struct DiscoverFloatingHeaderOverlay: View {
  let isVisible: Bool
  let onTapCreatePost: () -> Void

  var body: some View {
    GeometryReader { proxy in
      if isVisible {
        VinctusHeaderBar(onTapCreatePost: onTapCreatePost, showsDivider: false)
          .padding(.horizontal, 16)
          .padding(.top, proxy.safeAreaInsets.top + 2)
          .padding(.bottom, 6)
          .frame(maxWidth: .infinity, alignment: .top)
          .background(VinctusTokens.Color.background.opacity(0.98))
          .transition(.move(edge: .top).combined(with: .opacity))
      }
    }
    .allowsHitTesting(isVisible)
  }
}

struct DiscoverHeaderOffsetPreferenceKey: PreferenceKey {
  static var defaultValue: CGFloat = .zero

  static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
    value = nextValue()
  }
}

struct DiscoverCurationHero: View {
  @Binding var searchText: String

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      Text("DESCUBRIR")
        .font(.caption2.weight(.semibold))
        .tracking(3)
        .foregroundStyle(VinctusTokens.Color.textMuted)

      (
        Text("Curaduria de ")
          .foregroundStyle(VinctusTokens.Color.textPrimary) +
        Text("Intereses")
          .foregroundStyle(VinctusTokens.Color.accent)
      )
      .font(VinctusTokens.Typography.brandTitle(size: 26))
      .lineSpacing(2)

      HStack(spacing: 10) {
        Image(systemName: "line.3.horizontal.decrease.circle")
          .foregroundStyle(VinctusTokens.Color.textMuted)
        TextField("Buscar intereses o grupos...", text: $searchText)
          .font(.subheadline)
          .textInputAutocapitalization(.never)
          .autocorrectionDisabled()
          .foregroundStyle(VinctusTokens.Color.textPrimary)
        if !searchText.isEmpty {
          Button {
            searchText = ""
          } label: {
            Image(systemName: "xmark.circle.fill")
              .foregroundStyle(VinctusTokens.Color.textMuted.opacity(0.85))
          }
          .buttonStyle(.plain)
        }
        Image(systemName: "magnifyingglass")
          .foregroundStyle(VinctusTokens.Color.textMuted)
      }
      .padding(.horizontal, 12)
      .padding(.vertical, 10)
      .background(VinctusTokens.Color.surface)
      .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
      .overlay(
        RoundedRectangle(cornerRadius: 16, style: .continuous)
          .stroke(VinctusTokens.Color.border.opacity(0.48), lineWidth: 1)
      )
    }
    .padding(.bottom, 8)
  }
}

struct DiscoverStoryChip: View {
  let user: DiscoverUser

  var body: some View {
    VStack(spacing: 7) {
      ZStack {
        Circle()
          .stroke(VinctusTokens.Color.accent, lineWidth: 1.5)
          .frame(width: 60, height: 60)
        VAvatarView(name: user.displayName, photoURLString: user.photoURL, size: 52)
      }

      Text(user.displayName)
        .font(.caption2.weight(.medium))
        .tracking(0.5)
        .foregroundStyle(VinctusTokens.Color.textMuted)
        .lineLimit(1)
    }
    .frame(width: 76)
  }
}

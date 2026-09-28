import SwiftUI

// Building blocks of the Discover tab.

struct DiscoverAvatarView: View {
  let name: String
  let photoURLString: String?
  let size: CGFloat

  var body: some View {
    ZStack {
      Circle()
        .fill(VinctusTokens.Color.surface2)

      if let url = avatarURL {
        AsyncImage(url: url) { phase in
          switch phase {
          case .empty:
            ProgressView()
              .controlSize(.small)
          case .success(let image):
            image
              .resizable()
              .scaledToFill()
          case .failure:
            initials
          @unknown default:
            initials
          }
        }
      } else {
        initials
      }
    }
    .frame(width: size, height: size)
    .clipShape(Circle())
  }

  private var avatarURL: URL? {
    guard let photoURLString else { return nil }
    return URL(string: photoURLString)
  }

  private var initials: some View {
    Text(String(name.prefix(1)).uppercased())
      .font(.subheadline)
      .foregroundStyle(VinctusTokens.Color.textMuted)
  }
}

struct DiscoverHeaderBar: View {
  let onTapCreatePost: () -> Void

  var body: some View {
    HStack(spacing: 10) {
      Image("Logo")
        .resizable()
        .scaledToFill()
        .frame(width: 34, height: 34)
        .clipShape(RoundedRectangle(cornerRadius: 9, style: .continuous))
        .accessibilityHidden(true)

      Text("Vinctus")
        .font(VinctusTokens.Typography.brandTitle(size: 28))
        .foregroundStyle(VinctusTokens.Color.textPrimary)

      Spacer()

      Button(action: onTapCreatePost) {
        Image(systemName: "plus")
          .font(.system(size: 17, weight: .bold))
          .foregroundStyle(.black)
          .frame(width: 38, height: 38)
          .background(VinctusTokens.Color.accent)
          .clipShape(Circle())
      }
      .buttonStyle(.plain)
      .accessibilityLabel("Crear publicación")
    }
    .padding(.top, 2)
    .padding(.bottom, 4)
  }
}

struct DiscoverTopSafeAreaBackground: View {
  var body: some View {
    GeometryReader { proxy in
      VinctusTokens.Color.background
        .frame(height: proxy.safeAreaInsets.top)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .ignoresSafeArea(edges: .top)
        .allowsHitTesting(false)
    }
    .allowsHitTesting(false)
  }
}

struct DiscoverFloatingHeaderOverlay: View {
  let isVisible: Bool
  let onTapCreatePost: () -> Void

  var body: some View {
    GeometryReader { proxy in
      if isVisible {
        DiscoverHeaderBar(onTapCreatePost: onTapCreatePost)
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
    VStack(alignment: .leading, spacing: 14) {
      VStack(alignment: .leading, spacing: 4) {
        (
          Text("Descubre ")
            .foregroundStyle(VinctusTokens.Color.textPrimary) +
          Text("tus intereses")
            .foregroundStyle(VinctusTokens.Color.accent)
        )
        .font(VinctusTokens.Typography.brandTitle(size: 30))

        Text("Personas, grupos y temas que valen la pena.")
          .font(.subheadline)
          .foregroundStyle(VinctusTokens.Color.textMuted)
      }

      HStack(spacing: 10) {
        Image(systemName: "magnifyingglass")
          .foregroundStyle(VinctusTokens.Color.textMuted)
        TextField("Buscar intereses o grupos", text: $searchText)
          .textInputAutocapitalization(.never)
          .autocorrectionDisabled()
          .foregroundStyle(VinctusTokens.Color.textPrimary)
        if !searchText.isEmpty {
          Button {
            searchText = ""
          } label: {
            Image(systemName: "xmark.circle.fill")
              .foregroundStyle(VinctusTokens.Color.textMuted)
          }
          .accessibilityLabel("Borrar búsqueda")
        }
      }
      .padding(.horizontal, 14)
      .frame(height: 46)
      .background(VinctusTokens.Color.surface)
      .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
      .overlay(
        RoundedRectangle(cornerRadius: 14, style: .continuous)
          .stroke(VinctusTokens.Color.border.opacity(0.6), lineWidth: 1)
      )
    }
    .padding(.top, 4)
  }
}

struct DiscoverSectionHeader: View {
  let title: String

  var body: some View {
    Text(title)
      .font(VinctusTokens.Typography.sectionTitle(size: 22))
      .foregroundStyle(VinctusTokens.Color.textPrimary)
  }
}

struct DiscoverAIPromoCard: View {
  var body: some View {
    HStack(spacing: 14) {
      Image(systemName: "sparkles")
        .font(.system(size: 22, weight: .semibold))
        .foregroundStyle(.black)
        .frame(width: 48, height: 48)
        .background(VinctusTokens.Color.accent)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))

      VStack(alignment: .leading, spacing: 3) {
        Text("Pregúntale a la IA")
          .font(.headline)
          .foregroundStyle(VinctusTokens.Color.textPrimary)
        Text("Chat con IA y debates en Arena IA")
          .font(.footnote)
          .foregroundStyle(VinctusTokens.Color.textMuted)
      }

      Spacer()

      Image(systemName: "chevron.right")
        .font(.footnote.weight(.semibold))
        .foregroundStyle(VinctusTokens.Color.textMuted)
    }
    .padding(14)
    .background(
      LinearGradient(
        colors: [VinctusTokens.Color.accent.opacity(0.18), VinctusTokens.Color.surface],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
      )
    )
    .clipShape(RoundedRectangle(cornerRadius: VinctusTokens.Radius.lg, style: .continuous))
    .overlay(
      RoundedRectangle(cornerRadius: VinctusTokens.Radius.lg, style: .continuous)
        .stroke(VinctusTokens.Color.accent.opacity(0.35), lineWidth: 1)
    )
  }
}

struct DiscoverStoryChip: View {
  let user: DiscoverUser

  var body: some View {
    VStack(spacing: 8) {
      ZStack {
        Circle()
          .stroke(
            LinearGradient(
              colors: [VinctusTokens.Color.accent, VinctusTokens.Color.accentAlt],
              startPoint: .topLeading,
              endPoint: .bottomTrailing
            ),
            lineWidth: 2
          )
          .frame(width: 64, height: 64)
        DiscoverAvatarView(name: user.displayName, photoURLString: user.photoURL, size: 56)
      }

      Text(user.displayName.split(separator: " ").first.map(String.init) ?? user.displayName)
        .font(.caption)
        .foregroundStyle(VinctusTokens.Color.textPrimary)
        .lineLimit(1)
    }
    .frame(width: 76)
  }
}

struct DiscoverTrendCard: View {
  let trend: DiscoverTrend

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack {
        Image(systemName: trend.icon)
          .font(.system(size: 17, weight: .semibold))
          .foregroundStyle(VinctusTokens.Color.accent)
          .frame(width: 36, height: 36)
          .background(VinctusTokens.Color.accent.opacity(0.14))
          .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        Spacer()
        Text(trend.rankLabel)
          .font(.caption2.weight(.bold))
          .padding(.horizontal, 9)
          .padding(.vertical, 4)
          .background(VinctusTokens.Color.accent.opacity(0.18))
          .foregroundStyle(VinctusTokens.Color.accent)
          .clipShape(Capsule())
      }

      Text(trend.title)
        .font(VinctusTokens.Typography.sectionTitle(size: 20))
        .foregroundStyle(VinctusTokens.Color.textPrimary)
        .lineLimit(1)

      Text(trend.subtitle)
        .font(.footnote)
        .foregroundStyle(VinctusTokens.Color.textMuted)
        .lineLimit(2, reservesSpace: true)

      Text("\(trend.signalLabel) · \(trend.groupsLabel)")
        .font(.caption)
        .foregroundStyle(VinctusTokens.Color.textMuted)

      HStack(spacing: 6) {
        ForEach(trend.tags.prefix(2), id: \.self) { tag in
          Text(tag.capitalized)
            .font(.caption2.weight(.medium))
            .padding(.horizontal, 9)
            .padding(.vertical, 5)
            .background(VinctusTokens.Color.surface2)
            .foregroundStyle(VinctusTokens.Color.textMuted)
            .clipShape(Capsule())
            .lineLimit(1)
        }
      }
    }
    .padding(14)
    .frame(width: 250, alignment: .leading)
    .background(VinctusTokens.Color.surface)
    .clipShape(RoundedRectangle(cornerRadius: VinctusTokens.Radius.lg, style: .continuous))
    .overlay(
      RoundedRectangle(cornerRadius: VinctusTokens.Radius.lg, style: .continuous)
        .stroke(VinctusTokens.Color.border.opacity(0.55), lineWidth: 1)
    )
  }
}

struct DiscoverGroupCard: View {
  let group: GroupSummary

  var body: some View {
    VCard {
      HStack(spacing: VinctusTokens.Spacing.md) {
        DiscoverGroupIcon(name: group.name, iconURL: group.iconURL, size: 48)

        VStack(alignment: .leading, spacing: 4) {
          Text(group.name)
            .font(.headline)
            .foregroundStyle(VinctusTokens.Color.textPrimary)
            .lineLimit(1)

          Text(group.description.isEmpty ? "Sin descripción." : group.description)
            .font(.footnote)
            .foregroundStyle(VinctusTokens.Color.textMuted)
            .lineLimit(2)

          Text("\(group.memberCount) miembros")
            .font(.caption)
            .foregroundStyle(VinctusTokens.Color.textMuted)
        }

        Spacer()

        Image(systemName: "chevron.right")
          .font(.caption.weight(.semibold))
          .foregroundStyle(VinctusTokens.Color.textMuted)
      }
    }
  }
}

struct DiscoverGroupIcon: View {
  let name: String
  let iconURL: String?
  let size: CGFloat

  var body: some View {
    ZStack {
      RoundedRectangle(cornerRadius: 12, style: .continuous)
        .fill(VinctusTokens.Color.surface2)

      if let iconURL, let url = URL(string: iconURL) {
        AsyncImage(url: url) { phase in
          switch phase {
          case .empty:
            ProgressView()
              .controlSize(.small)
          case .success(let image):
            image
              .resizable()
              .scaledToFill()
          case .failure:
            initials
          @unknown default:
            initials
          }
        }
      } else {
        initials
      }
    }
    .frame(width: size, height: size)
    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
  }

  private var initials: some View {
    Text(String(name.prefix(1)).uppercased())
      .font(.headline)
      .foregroundStyle(VinctusTokens.Color.textMuted)
  }
}

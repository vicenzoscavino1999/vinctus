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
    FirebaseDiscoverRepo.safeHTTPURL(photoURLString)
  }

  private var initials: some View {
    Text(String(name.prefix(1)).uppercased())
      .font(.subheadline)
      .foregroundStyle(VinctusTokens.Color.textMuted)
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

/// A suggested person. The ring is neutral: the gold ring means "unseen story" (StoriesBar), so
/// it isn't used for people who are only suggestions.
struct DiscoverStoryChip: View {
  let user: DiscoverUser

  var body: some View {
    VStack(spacing: 8) {
      ZStack {
        Circle()
          .stroke(VinctusTokens.Color.border, lineWidth: 1.5)
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

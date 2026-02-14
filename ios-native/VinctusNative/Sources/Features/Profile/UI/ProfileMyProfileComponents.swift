import SwiftUI

struct ProfileMyProfileContent: View {
  let profile: UserProfile
  let previewText: String
  let onTapCreate: () -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: 18) {
      VStack(alignment: .leading, spacing: 8) {
        Text("SOBRE MI")
          .font(.caption2.weight(.semibold))
          .tracking(2.8)
          .foregroundStyle(VinctusTokens.Color.textMuted)

        if let bio = profile.bio, !bio.isEmpty {
          Text(bio)
            .font(.body)
            .foregroundStyle(VinctusTokens.Color.textPrimary)
            .multilineTextAlignment(.leading)
        } else {
          Text("Aun no has anadido una biografia. Cuentale al mundo sobre ti.")
            .font(.body.italic())
            .foregroundStyle(VinctusTokens.Color.textMuted)
            .multilineTextAlignment(.leading)
        }

        Button("+ Anadir biografia") {
          onTapCreate()
        }
        .buttonStyle(.plain)
        .font(.callout.weight(.semibold))
        .foregroundStyle(VinctusTokens.Color.accent)
      }

      VStack(alignment: .leading, spacing: 10) {
        Text("PUBLICACIONES")
          .font(.caption2.weight(.semibold))
          .tracking(2.8)
          .foregroundStyle(VinctusTokens.Color.textMuted)

        ScrollView(.horizontal, showsIndicators: false) {
          HStack(spacing: 10) {
            ForEach(0..<max(1, min(profile.postsCount, 3)), id: \.self) { index in
              ProfilePublicationCard(
                text: index == 0 ? previewText : "Publicacion \(index + 1)",
                subtitle: "Hola, probando"
              )
            }
          }
          .padding(.horizontal, 1)
        }
      }

      VStack(alignment: .leading, spacing: 10) {
        HStack {
          Text("PORTAFOLIO & CONTRIBUCIONES")
            .font(.caption2.weight(.semibold))
            .tracking(2.6)
            .foregroundStyle(VinctusTokens.Color.textMuted)

          Spacer()

          Button("+ Nueva") {
            onTapCreate()
          }
          .buttonStyle(.plain)
          .font(.callout.weight(.semibold))
          .foregroundStyle(VinctusTokens.Color.accent)
        }

        ProfilePortfolioEmptyCard(onTapCreate: onTapCreate)
      }
    }
  }
}

struct ProfilePublicationCard: View {
  let text: String
  let subtitle: String

  var body: some View {
    ZStack(alignment: .bottomLeading) {
      RoundedRectangle(cornerRadius: VinctusTokens.Radius.lg, style: .continuous)
        .fill(
          LinearGradient(
            colors: [
              VinctusTokens.Color.surface,
              VinctusTokens.Color.surface2.opacity(0.85)
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
          )
        )
        .overlay(
          RoundedRectangle(cornerRadius: VinctusTokens.Radius.lg, style: .continuous)
            .stroke(VinctusTokens.Color.border.opacity(0.5), lineWidth: 1)
        )

      VStack(alignment: .leading, spacing: 6) {
        Spacer()
        Text(text)
          .font(.headline)
          .foregroundStyle(VinctusTokens.Color.textPrimary)
          .lineLimit(3)
        Text(subtitle)
          .font(.caption)
          .foregroundStyle(VinctusTokens.Color.textMuted)
      }
      .padding(12)
    }
    .frame(width: 188, height: 188)
  }
}

struct ProfilePortfolioEmptyCard: View {
  let onTapCreate: () -> Void

  var body: some View {
    VStack(spacing: 10) {
      Image(systemName: "book")
        .font(.title2)
        .foregroundStyle(VinctusTokens.Color.textMuted.opacity(0.85))

      Text("Sin contribuciones publicadas aun.")
        .font(.body.italic())
        .foregroundStyle(VinctusTokens.Color.textMuted)
        .multilineTextAlignment(.center)

      Button("+ Publicar tu primera contribucion") {
        onTapCreate()
      }
      .buttonStyle(.plain)
      .font(.callout.weight(.semibold))
      .foregroundStyle(VinctusTokens.Color.accent)
    }
    .frame(maxWidth: .infinity)
    .padding(.vertical, 28)
    .overlay(
      RoundedRectangle(cornerRadius: VinctusTokens.Radius.md, style: .continuous)
        .stroke(VinctusTokens.Color.border.opacity(0.5), style: StrokeStyle(lineWidth: 1, dash: [5, 4]))
    )
  }
}

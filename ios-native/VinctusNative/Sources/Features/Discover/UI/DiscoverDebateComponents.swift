import SwiftUI

struct DiscoverInstantPreviewCard: View {
  let categoryTitle: String
  let overviewText: String
  let papers: [DiscoverPaperHighlight]
  let onTapCategory: () -> Void

  var body: some View {
    VCard {
      VStack(alignment: .leading, spacing: 12) {
        Text("PREVIEW INSTANTANEO")
          .font(.caption2.weight(.semibold))
          .tracking(2.6)
          .foregroundStyle(VinctusTokens.Color.textMuted)

        Text(categoryTitle)
          .font(VinctusTokens.Typography.sectionTitle(size: 24))
          .foregroundStyle(VinctusTokens.Color.textPrimary)

        Text(overviewText)
          .font(.subheadline)
          .foregroundStyle(VinctusTokens.Color.textMuted)
          .fixedSize(horizontal: false, vertical: true)

        Button(action: onTapCategory) {
          HStack(spacing: 10) {
            Text("VER CATEGORIA")
              .font(.caption.weight(.semibold))
              .tracking(1)
            Image(systemName: "arrow.right")
              .font(.caption.weight(.semibold))
          }
          .foregroundStyle(VinctusTokens.Color.textPrimary.opacity(0.95))
          .frame(maxWidth: .infinity, alignment: .leading)
          .padding(.horizontal, 14)
          .padding(.vertical, 10)
          .background(VinctusTokens.Color.surface.opacity(0.55))
          .clipShape(Capsule())
          .overlay(
            Capsule()
              .stroke(VinctusTokens.Color.border.opacity(0.8), lineWidth: 1)
          )
        }
        .buttonStyle(.plain)

        VStack(spacing: 10) {
          ForEach(papers.prefix(2)) { paper in
            DiscoverPaperHighlightCard(paper: paper)
          }
        }
      }
    }
  }
}

struct DiscoverPaperHighlightCard: View {
  let paper: DiscoverPaperHighlight

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      Text(paper.publishedAt)
        .font(.caption2.weight(.semibold))
        .tracking(1.1)
        .foregroundStyle(VinctusTokens.Color.textMuted)

      Text(paper.title)
        .font(VinctusTokens.Typography.sectionTitle(size: 16))
        .foregroundStyle(VinctusTokens.Color.textPrimary)
        .lineLimit(3)

      Text(paper.authors)
        .font(.subheadline)
        .foregroundStyle(VinctusTokens.Color.textMuted)
        .lineLimit(2)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(.horizontal, 14)
    .padding(.vertical, 12)
    .background(VinctusTokens.Color.background.opacity(0.75))
    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    .overlay(
      RoundedRectangle(cornerRadius: 14, style: .continuous)
        .stroke(VinctusTokens.Color.border.opacity(0.5), lineWidth: 1)
    )
  }
}

struct DiscoverDebateSpotlightSection: View {
  let debate: DiscoverDebateHighlight

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      (
        Text("Debates ")
          .foregroundStyle(VinctusTokens.Color.textPrimary) +
        Text("IA")
          .foregroundStyle(VinctusTokens.Color.accent) +
        Text(" destacados")
          .foregroundStyle(VinctusTokens.Color.textPrimary)
      )
      .font(VinctusTokens.Typography.sectionTitle(size: 24))

      VCard {
        VStack(alignment: .leading, spacing: 10) {
          HStack(alignment: .top, spacing: 10) {
            Text(debate.title)
              .font(VinctusTokens.Typography.sectionTitle(size: 20))
              .foregroundStyle(VinctusTokens.Color.textPrimary)
              .lineLimit(3)

            Spacer(minLength: 8)

            Text("\(debate.sourcesCount) FUENTES - \(debate.likesCount) LIKES")
              .font(.caption2.weight(.semibold))
              .tracking(1.1)
              .foregroundStyle(VinctusTokens.Color.accent)
              .padding(.horizontal, 9)
              .padding(.vertical, 6)
              .background(VinctusTokens.Color.accent.opacity(0.13))
              .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
          }

          Text(debate.matchupLabel)
            .font(.subheadline)
            .foregroundStyle(VinctusTokens.Color.textMuted)

          Text(debate.summary)
            .font(.subheadline)
            .foregroundStyle(VinctusTokens.Color.textMuted.opacity(0.95))
            .lineLimit(4)

          Text(debate.topicTag.uppercased())
            .font(.caption2.weight(.medium))
            .tracking(1.6)
            .foregroundStyle(VinctusTokens.Color.textMuted)
            .lineLimit(1)
            .padding(.horizontal, 10)
            .padding(.vertical, 7)
            .background(VinctusTokens.Color.surface2)
            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
      }
    }
    .padding(.bottom, 8)
  }
}

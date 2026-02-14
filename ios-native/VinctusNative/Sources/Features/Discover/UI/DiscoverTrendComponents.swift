import SwiftUI

struct DiscoverTrendCard: View {
  let trend: DiscoverTrend

  var body: some View {
    VCard {
      VStack(alignment: .leading, spacing: 10) {
        HStack {
          Image(systemName: trend.icon)
            .font(.caption.weight(.semibold))
            .foregroundStyle(SwiftUI.Color.blue)
          Spacer()
          Text(trend.rankLabel)
            .font(.caption2.weight(.semibold))
            .padding(.horizontal, 9)
            .padding(.vertical, 5)
            .background(VinctusTokens.Color.accent.opacity(0.14))
            .foregroundStyle(VinctusTokens.Color.accent)
            .clipShape(Capsule())
        }

        Text(trend.title)
          .font(VinctusTokens.Typography.sectionTitle(size: 22))
          .foregroundStyle(VinctusTokens.Color.textPrimary)
          .lineLimit(2)

        Text(trend.subtitle)
          .font(.caption)
          .foregroundStyle(VinctusTokens.Color.textMuted)
          .lineLimit(2)

        HStack(spacing: 8) {
          Text(trend.scoreLabel)
            .discoverBadgeStyle()
          Text("SIGUIENDO")
            .discoverBadgeStyle(selected: true)
        }

        HStack(spacing: 8) {
          Text(trend.signalLabel)
            .discoverBadgeStyle()
          Text(trend.groupsLabel)
            .discoverBadgeStyle()
        }

        WrapTags(tags: trend.tags)
      }
    }
    .frame(width: 286)
  }
}

struct DiscoverGroupCard: View {
  let group: GroupSummary

  var body: some View {
    VCard {
      HStack(spacing: VinctusTokens.Spacing.md) {
        VGroupIconView(name: group.name, iconURLString: group.iconURL, size: 48)

        VStack(alignment: .leading, spacing: 4) {
          Text(group.name)
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(VinctusTokens.Color.textPrimary)
            .lineLimit(1)

          Text(group.description.isEmpty ? "Sin descripcion." : group.description)
            .font(.caption)
            .foregroundStyle(VinctusTokens.Color.textMuted)
            .lineLimit(2)

          Text("\(group.memberCount) miembros")
            .font(.caption2)
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

struct WrapTags: View {
  let tags: [String]

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      ForEach(rows, id: \.self) { row in
        HStack(spacing: 6) {
          ForEach(row, id: \.self) { tag in
            Text(tag.uppercased())
              .font(.caption2)
              .padding(.horizontal, 9)
              .padding(.vertical, 5)
              .background(VinctusTokens.Color.surface2)
              .foregroundStyle(VinctusTokens.Color.textMuted)
              .clipShape(Capsule())
          }
        }
      }
    }
  }

  private var rows: [[String]] {
    var result: [[String]] = []
    var current: [String] = []

    for (index, tag) in tags.enumerated() {
      current.append(tag)
      if current.count == 2 || index == tags.count - 1 {
        result.append(current)
        current = []
      }
    }

    return result
  }
}

fileprivate extension View {
  func discoverBadgeStyle(selected: Bool = false) -> some View {
    self
      .font(.caption2.weight(.semibold))
      .padding(.horizontal, 9)
      .padding(.vertical, 5)
      .background(selected ? VinctusTokens.Color.accent.opacity(0.16) : VinctusTokens.Color.surface2)
      .foregroundStyle(selected ? VinctusTokens.Color.accent : VinctusTokens.Color.textMuted)
      .clipShape(Capsule())
  }
}

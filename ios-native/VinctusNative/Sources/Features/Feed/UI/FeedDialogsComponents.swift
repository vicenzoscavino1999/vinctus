import SwiftUI

enum ConversationsSegment: String, CaseIterable, Identifiable {
  case groups = "Grupos"
  case privates = "Privados"

  var id: String { rawValue }
}

struct FeedDialogsSearchField: View {
  @Binding var searchText: String
  let placeholder: String

  var body: some View {
    HStack(spacing: 10) {
      TextField(placeholder, text: $searchText)
        .font(.subheadline)
        .textInputAutocapitalization(.never)
        .autocorrectionDisabled()
        .foregroundStyle(VinctusTokens.Color.textPrimary)

      if !searchText.isEmpty {
        Button {
          searchText = ""
        } label: {
          Image(systemName: "xmark.circle.fill")
            .foregroundStyle(VinctusTokens.Color.textMuted.opacity(0.9))
        }
        .buttonStyle(.plain)
      }

      Image(systemName: "magnifyingglass")
        .foregroundStyle(VinctusTokens.Color.textMuted)
    }
    .padding(.horizontal, 12)
    .padding(.vertical, 9)
    .background(VinctusTokens.Color.surface)
    .clipShape(RoundedRectangle(cornerRadius: 15, style: .continuous))
    .overlay(
      RoundedRectangle(cornerRadius: 15, style: .continuous)
        .stroke(VinctusTokens.Color.border.opacity(0.46), lineWidth: 1)
    )
  }
}

struct FeedConversationsSegmentedControl: View {
  @Binding var selectedSegment: ConversationsSegment

  var body: some View {
    HStack(spacing: 6) {
      ForEach(ConversationsSegment.allCases) { segment in
        Button {
          selectedSegment = segment
        } label: {
          Text(segment.rawValue)
            .font(.callout.weight(.semibold))
            .foregroundStyle(
              selectedSegment == segment
                ? VinctusTokens.Color.textPrimary
                : VinctusTokens.Color.textMuted
            )
            .frame(maxWidth: .infinity)
            .padding(.vertical, 8)
            .background(
              Capsule()
                .fill(
                  selectedSegment == segment
                    ? VinctusTokens.Color.surface2
                    : SwiftUI.Color.clear
                )
            )
        }
        .buttonStyle(.plain)
      }
    }
    .padding(3)
    .background(VinctusTokens.Color.surface.opacity(0.85))
    .clipShape(Capsule())
    .overlay(
      Capsule()
        .stroke(VinctusTokens.Color.border.opacity(0.5), lineWidth: 1)
    )
    .padding(.horizontal, 64)
  }
}

struct FeedRecentConversationCard: View {
  let group: GroupSummary
  let subtitle: String
  let relativeTime: String

  var body: some View {
    VCard {
      HStack(spacing: VinctusTokens.Spacing.md) {
        FeedGroupAvatar(name: group.name, iconURL: group.iconURL, size: 46)

        VStack(alignment: .leading, spacing: 4) {
          HStack(spacing: 8) {
            Text(group.name)
              .font(.subheadline.weight(.semibold))
              .foregroundStyle(VinctusTokens.Color.textPrimary)
              .lineLimit(1)

            Text("Grupo")
              .font(.caption2.weight(.medium))
              .foregroundStyle(VinctusTokens.Color.textMuted)
              .padding(.horizontal, 6)
              .padding(.vertical, 2.5)
              .background(VinctusTokens.Color.surface2)
              .clipShape(Capsule())
          }

          Text(subtitle)
            .font(.caption)
            .foregroundStyle(VinctusTokens.Color.textMuted)
            .lineLimit(1)
        }

        Spacer(minLength: 8)

        HStack(spacing: 8) {
          Text(relativeTime)
            .font(.callout)
            .foregroundStyle(VinctusTokens.Color.textMuted)
            .lineLimit(1)
          Image(systemName: "chevron.right")
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(VinctusTokens.Color.textMuted)
        }
      }
    }
  }
}

struct FeedGroupDialogCard: View {
  let group: GroupSummary

  var body: some View {
    VCard {
      VStack(alignment: .leading, spacing: 10) {
        HStack(alignment: .top, spacing: VinctusTokens.Spacing.md) {
          FeedGroupAvatar(name: group.name, iconURL: group.iconURL, size: 44)

          VStack(alignment: .leading, spacing: 4) {
            Text(group.name)
              .font(.title3.weight(.semibold))
              .foregroundStyle(VinctusTokens.Color.textPrimary)
              .lineLimit(1)

            Text(group.description.isEmpty ? "Sin descripcion disponible" : group.description)
              .font(.footnote)
              .foregroundStyle(VinctusTokens.Color.textMuted)
              .lineLimit(1)
          }

          Spacer(minLength: 8)

          Text("Chat")
            .font(.caption2.weight(.semibold))
            .foregroundStyle(VinctusTokens.Color.textPrimary)
            .padding(.horizontal, 9)
            .padding(.vertical, 5)
            .background(VinctusTokens.Color.surface2)
            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        }

        HStack {
          Text("\(group.memberCount) miembros · 0 posts/semana")
            .font(.caption2)
            .foregroundStyle(VinctusTokens.Color.textMuted)
          Spacer()
          Text("Ver grupo")
            .font(.caption2.weight(.medium))
            .foregroundStyle(VinctusTokens.Color.textMuted)
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    }
  }
}

private struct FeedGroupAvatar: View {
  let name: String
  let iconURL: String?
  let size: CGFloat

  var body: some View {
    VGroupIconView(
      name: name,
      iconURLString: iconURL,
      size: size,
      cornerRadius: 14,
      textColor: VinctusTokens.Color.textMuted,
      textFont: .headline.weight(.semibold)
    )
  }
}

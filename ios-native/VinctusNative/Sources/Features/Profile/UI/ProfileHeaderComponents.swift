import SwiftUI

struct ProfileIdentityCard: View {
  let profile: UserProfile
  let memberLabel: String
  let locationLabel: String
  let onTapSettings: () -> Void
  let onTapEdit: () -> Void

  var body: some View {
    HStack(alignment: .top, spacing: 12) {
      VAvatarView(
        name: profile.displayName,
        photoURLString: profile.photoURL,
        size: 82,
        ringColor: VinctusTokens.Color.accent.opacity(0.42),
        ringWidth: 1.2,
        textColor: VinctusTokens.Color.accent.opacity(0.9),
        textFont: VinctusTokens.Typography.sectionTitle(size: 28)
      )

      VStack(alignment: .leading, spacing: 5) {
        Text(displayName)
          .font(VinctusTokens.Typography.sectionTitle(size: 34))
          .foregroundStyle(VinctusTokens.Color.textPrimary)
          .lineLimit(1)
          .minimumScaleFactor(0.68)
          .allowsTightening(true)
          .layoutPriority(1)

        Text(memberLabel)
          .font(.subheadline)
          .foregroundStyle(VinctusTokens.Color.textMuted)

        HStack(spacing: 6) {
          Image(systemName: "location")
            .font(.subheadline)
            .foregroundStyle(VinctusTokens.Color.textMuted)

          Text(locationLabel)
            .font(.subheadline)
            .foregroundStyle(VinctusTokens.Color.textMuted)
            .lineLimit(1)
            .truncationMode(.tail)

          Button(action: onTapSettings) {
            Circle()
              .fill(VinctusTokens.Color.surface.opacity(0.82))
              .frame(width: 28, height: 28)
              .overlay(
                Image(systemName: "gearshape")
                  .font(.footnote.weight(.semibold))
                  .foregroundStyle(VinctusTokens.Color.textMuted)
              )
              .overlay(
                Circle()
                  .stroke(VinctusTokens.Color.border.opacity(0.62), lineWidth: 1)
              )
          }
          .buttonStyle(.plain)
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .layoutPriority(1)
      .padding(.top, 2)

      Spacer(minLength: 8)

      Button(action: onTapEdit) {
        HStack(spacing: 6) {
          Image(systemName: "pencil")
            .font(.callout.weight(.semibold))
          Text("Editar perfil")
            .font(.callout.weight(.semibold))
            .lineLimit(1)
            .fixedSize(horizontal: true, vertical: false)
        }
        .foregroundStyle(VinctusTokens.Color.textPrimary)
        .padding(.horizontal, 11)
        .padding(.vertical, 9)
        .overlay(
          RoundedRectangle(cornerRadius: 14, style: .continuous)
            .stroke(VinctusTokens.Color.border.opacity(0.62), lineWidth: 1)
        )
      }
      .buttonStyle(.plain)
      .padding(.top, 2)
    }
    .padding(.vertical, 2)
  }

  private var displayName: String {
    let trimmed = profile.displayName.trimmingCharacters(in: .whitespacesAndNewlines)
    return trimmed.isEmpty ? "Usuario" : trimmed
  }
}

struct ProfileStatTile: View {
  let title: String
  let value: Int

  var body: some View {
    VStack(spacing: 6) {
      Text(title.uppercased())
        .font(.caption2.weight(.semibold))
        .tracking(1.1)
        .foregroundStyle(VinctusTokens.Color.textMuted)
      Text("\(value)")
        .font(.title3.weight(.semibold))
        .foregroundStyle(VinctusTokens.Color.textPrimary)
    }
    .frame(maxWidth: .infinity)
    .padding(.vertical, 12)
    .background(VinctusTokens.Color.surface)
    .clipShape(RoundedRectangle(cornerRadius: 13, style: .continuous))
    .overlay(
      RoundedRectangle(cornerRadius: 13, style: .continuous)
        .stroke(VinctusTokens.Color.border.opacity(0.55), lineWidth: 1)
    )
  }
}

struct ProfileStoryBubble: View {
  let item: ProfileStoryItem
  let fallbackName: String

  var body: some View {
    VStack(spacing: 7) {
      ZStack(alignment: .bottomTrailing) {
        VAvatarView(
          name: fallbackName,
          photoURLString: item.imageURL,
          size: 68,
          ringColor: item.isOwnStory ? VinctusTokens.Color.border.opacity(0.75) : VinctusTokens.Color.accent
        )

        if item.isOwnStory {
          Circle()
            .fill(VinctusTokens.Color.accent)
            .frame(width: 22, height: 22)
            .overlay(
              Image(systemName: "plus")
                .font(.caption2.weight(.bold))
                .foregroundStyle(.black)
            )
            .offset(x: 3, y: 3)
        }
      }

      Text(item.title)
        .font(.caption)
        .foregroundStyle(VinctusTokens.Color.textPrimary)
        .lineLimit(1)
        .frame(width: 74)
    }
  }
}

struct ProfileTabSelector: View {
  @Binding var selectedTab: ProfileContentTab

  var body: some View {
    HStack(spacing: 6) {
      ForEach(ProfileContentTab.allCases) { tab in
        Button {
          selectedTab = tab
        } label: {
          Label(tab.rawValue, systemImage: tab == .myProfile ? "person.crop.square" : "book")
            .font(.callout.weight(.semibold))
            .foregroundStyle(
              selectedTab == tab
                ? VinctusTokens.Color.textPrimary
                : VinctusTokens.Color.textMuted
            )
            .frame(maxWidth: .infinity)
            .padding(.vertical, 9)
            .background(
              Capsule()
                .fill(
                  selectedTab == tab
                    ? VinctusTokens.Color.surface2
                    : SwiftUI.Color.clear
                )
            )
        }
        .buttonStyle(.plain)
      }
    }
    .padding(3)
    .background(VinctusTokens.Color.surface.opacity(0.86))
    .clipShape(Capsule())
    .overlay(
      Capsule()
        .stroke(VinctusTokens.Color.border.opacity(0.5), lineWidth: 1)
    )
    .padding(.horizontal, 18)
  }
}

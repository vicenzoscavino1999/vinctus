import SwiftUI

/// Photo, name, role, username and account visibility at the top of a profile.
struct ProfileHeader: View {
  let profile: UserProfile

  var body: some View {
    VStack(spacing: 10) {
      AvatarView(name: profile.displayName, photoURLString: profile.photoURL, size: 96)
        .overlay(
          Circle()
            .stroke(
              LinearGradient(
                colors: [VinctusTokens.Color.accent, VinctusTokens.Color.accentBright],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
              ),
              lineWidth: 2
            )
            .padding(-5)
        )
        .padding(.top, 8)

      Text(profile.displayName)
        .font(VinctusTokens.Typography.brandTitle(size: 28))
        .foregroundStyle(VinctusTokens.Color.textPrimary)
        .multilineTextAlignment(.center)

      Text(profile.role ?? "Nuevo miembro")
        .font(.subheadline)
        .foregroundStyle(VinctusTokens.Color.textMuted)

      HStack(spacing: 8) {
        if let username = profile.username {
          Text("@\(username)")
            .foregroundStyle(VinctusTokens.Color.textMuted)
        }
        Label(
          profile.accountVisibility == .private ? "Privada" : "Pública",
          systemImage: profile.accountVisibility == .private ? "lock.fill" : "globe"
        )
        .font(.caption.weight(.semibold))
        .padding(.horizontal, 8)
        .padding(.vertical, 3)
        .background(VinctusTokens.Color.surface2)
        .foregroundStyle(VinctusTokens.Color.textMuted)
        .clipShape(Capsule())
      }
      .font(.subheadline)
    }
    .frame(maxWidth: .infinity)
  }
}

/// Posts, followers, following and reputation. Followers and following open their lists when
/// the profile's content can be seen.
struct ProfileStatsBar: View {
  let profile: UserProfile
  let canOpenLists: Bool
  let onOpenList: (FollowListKind) -> Void

  var body: some View {
    HStack(spacing: 0) {
      stat(value: profile.postsCount, label: "Publicaciones")
      divider
      Button { onOpenList(.followers) } label: {
        stat(value: profile.followersCount, label: "Seguidores")
      }
      .buttonStyle(.plain)
      .disabled(!canOpenLists)
      divider
      Button { onOpenList(.following) } label: {
        stat(value: profile.followingCount, label: "Siguiendo")
      }
      .buttonStyle(.plain)
      .disabled(!canOpenLists)
      divider
      stat(value: profile.reputation, label: "Reputación")
    }
    .padding(.vertical, 14)
    .background(VinctusTokens.Color.surface)
    .clipShape(RoundedRectangle(cornerRadius: VinctusTokens.Radius.lg, style: .continuous))
    .overlay(
      RoundedRectangle(cornerRadius: VinctusTokens.Radius.lg, style: .continuous)
        .stroke(VinctusTokens.Color.border.opacity(0.55), lineWidth: 1)
    )
  }

  private var divider: some View {
    Rectangle()
      .fill(VinctusTokens.Color.border.opacity(0.6))
      .frame(width: 1, height: 30)
  }

  private func stat(value: Int, label: String) -> some View {
    VStack(spacing: 2) {
      Text("\(value)")
        .font(.title3.weight(.bold))
        .foregroundStyle(VinctusTokens.Color.textPrimary)
      Text(label)
        .font(.caption2)
        .foregroundStyle(VinctusTokens.Color.textMuted)
        .lineLimit(1)
        .minimumScaleFactor(0.8)
    }
    .frame(maxWidth: .infinity)
    .contentShape(Rectangle())
  }
}

/// Location, email (only on your own profile) and join date.
struct ProfileDetailsSection: View {
  let profile: UserProfile
  let isOwnProfile: Bool

  struct Row: Hashable {
    let icon: String
    let text: String
  }

  static func rows(for profile: UserProfile, isOwnProfile: Bool) -> [Row] {
    var rows: [Row] = []
    if let location = profile.location {
      rows.append(Row(icon: "mappin.and.ellipse", text: location))
    }
    if isOwnProfile, let email = profile.email {
      rows.append(Row(icon: "envelope", text: email))
    }
    rows.append(
      Row(
        icon: "calendar",
        text: "Se unió en \(profile.createdAt.formatted(.dateTime.month(.wide).year()))"
      )
    )
    return rows
  }

  var body: some View {
    ProfileSectionCard(title: isOwnProfile ? "Contacto" : "Detalles", icon: "info.circle") {
      VStack(alignment: .leading, spacing: 10) {
        ForEach(Self.rows(for: profile, isOwnProfile: isOwnProfile), id: \.self) { row in
          Label(row.text, systemImage: row.icon)
            .font(.subheadline)
            .foregroundStyle(VinctusTokens.Color.textMuted)
        }
      }
    }
  }
}

/// Opens your collections; shown on your own profile.
struct ProfileCollectionsLink: View {
  var body: some View {
    NavigationLink {
      CollectionsView()
    } label: {
      HStack(spacing: VinctusTokens.Spacing.sm) {
        Image(systemName: "books.vertical")
          .foregroundStyle(VinctusTokens.Color.accent)
        VStack(alignment: .leading, spacing: 2) {
          Text("Colecciones")
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(VinctusTokens.Color.textPrimary)
          Text("Tus enlaces y notas guardados, solo para ti")
            .font(.caption)
            .foregroundStyle(VinctusTokens.Color.textMuted)
        }
        Spacer()
        Image(systemName: "chevron.right")
          .foregroundStyle(VinctusTokens.Color.textMuted)
      }
      .padding(VinctusTokens.Spacing.md)
      .background(VinctusTokens.Color.surface)
      .clipShape(RoundedRectangle(cornerRadius: VinctusTokens.Radius.lg, style: .continuous))
    }
    .buttonStyle(.plain)
  }
}

/// Shown instead of the content of a private account you don't follow.
struct PrivateProfileNotice: View {
  var body: some View {
    VStack(spacing: 8) {
      Image(systemName: "lock.fill")
        .font(.system(size: 28))
        .foregroundStyle(VinctusTokens.Color.accent)
      Text("Cuenta privada")
        .font(.headline)
      Text("Sigue a esta persona para ver sus publicaciones, aportes y seguidores.")
        .font(.footnote)
        .foregroundStyle(VinctusTokens.Color.textMuted)
        .multilineTextAlignment(.center)
    }
    .frame(maxWidth: .infinity)
    .padding(VinctusTokens.Spacing.xl)
    .background(VinctusTokens.Color.surface)
    .clipShape(RoundedRectangle(cornerRadius: VinctusTokens.Radius.lg, style: .continuous))
  }
}

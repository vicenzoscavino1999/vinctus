import SwiftUI

/// Photo, name, role, username and account visibility at the top of a profile.
struct ProfileHeader: View {
  let profile: UserProfile
  var isOwnProfile: Bool = true

  var body: some View {
    VStack(spacing: 8) {
      AvatarView(name: profile.displayName, photoURLString: profile.photoURL, size: 88)
        .overlay(
          Circle()
            .stroke(VinctusTokens.Color.accent.opacity(0.45), lineWidth: 1)
            .padding(-4)
        )
        .padding(.top, 8)
        .padding(.bottom, 4)

      Text(profile.displayName)
        .font(VinctusTokens.Typography.brandTitle(size: 26))
        .foregroundStyle(VinctusTokens.Color.textPrimary)
        .multilineTextAlignment(.center)

      // Role, username and visibility on one quiet line.
      HStack(spacing: 6) {
        let showsRole = isOwnProfile || profile.role != nil
        if showsRole {
          Text(profile.role ?? "Nuevo miembro")
        }
        if let username = profile.username {
          if showsRole { Text("·") }
          Text("@\(username)")
        }
        if showsRole || profile.username != nil {
          Text("·")
        }
        Label(
          profile.accountVisibility == .private ? "Privada" : "Pública",
          systemImage: profile.accountVisibility == .private ? "lock" : "globe"
        )
        .labelStyle(.titleAndIcon)
      }
      .font(.footnote)
      .foregroundStyle(VinctusTokens.Color.textMuted)
      .lineLimit(1)
      .minimumScaleFactor(0.85)
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
    .padding(.vertical, 4)
  }

  /// Just space between the numbers: no box, no lines.
  private var divider: some View {
    SwiftUI.Color.clear.frame(width: 1, height: 1)
  }

  private func stat(value: Int, label: String) -> some View {
    VStack(spacing: 2) {
      Text(value.formatted())
        .font(.headline)
        .monospacedDigit()
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
      ProfileLinkRow(
        icon: "books.vertical",
        title: "Colecciones",
        subtitle: "Tus enlaces y notas guardados, solo para ti"
      )
    }
    .buttonStyle(.plain)
  }
}

/// A card row that opens another screen of the profile (Colecciones, Publicaciones guardadas).
struct ProfileLinkRow: View {
  let icon: String
  let title: String
  let subtitle: String

  var body: some View {
    HStack(spacing: VinctusTokens.Spacing.sm) {
      Image(systemName: icon)
        .foregroundStyle(VinctusTokens.Color.accent)
        .frame(width: 24)
      VStack(alignment: .leading, spacing: 2) {
        Text(title)
          .font(.subheadline.weight(.semibold))
          .foregroundStyle(VinctusTokens.Color.textPrimary)
        Text(subtitle)
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
    .contentShape(Rectangle())
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

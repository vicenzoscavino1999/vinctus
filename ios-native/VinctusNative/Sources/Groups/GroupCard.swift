import SwiftUI

/// A group like the web's "Grupos recomendados" cards (`src/features/discover/pages/DiscoverPage.tsx`):
/// round icon, name, description, the join button, and members, posts and visibility underneath.
struct GroupCard: View {
  let group: GroupSummary
  var repo: any GroupsRepo = AppRepos.groups()
  /// Opens the group; the join button keeps its own action.
  let onOpen: () -> Void

  @EnvironmentObject private var authVM: AuthViewModel
  @State private var status: GroupMembershipStatus?
  @State private var isWorking = false
  @State private var errorMessage: String?

  private var isPrivate: Bool { group.visibility == .private }

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      HStack(alignment: .top, spacing: 12) {
        GroupRoundIcon(iconURL: group.iconURL, size: 48)

        VStack(alignment: .leading, spacing: 4) {
          Text(group.name)
            .font(VinctusTokens.Typography.serif(19, weight: .medium))
            .foregroundStyle(VinctusTokens.Color.textPrimary)
            .lineLimit(1)
          Text(group.description.isEmpty ? "Sin descripción." : group.description)
            .font(.subheadline)
            .foregroundStyle(VinctusTokens.Color.textMuted)
            .lineLimit(2)
        }

        Spacer(minLength: 8)

        actionButton
      }

      if let errorMessage {
        Text(errorMessage)
          .font(.caption)
          .foregroundStyle(.red)
          .padding(.top, 8)
      }

      Rectangle()
        .fill(VinctusTokens.Color.border.opacity(0.5))
        .frame(height: 0.5)
        .padding(.top, 16)

      HStack {
        Text("\(group.memberCount.formatted()) miembros")
          .font(.caption)
          .foregroundStyle(VinctusTokens.Color.textMuted)
        Spacer()
        Text(isPrivate ? "PRIVADO" : "PÚBLICO")
          .font(.system(size: 10))
          .tracking(1)
          .foregroundStyle(VinctusTokens.Color.textMuted)
      }
      .padding(.top, 12)
    }
    .padding(20)
    .background(VinctusTokens.Color.surface)
    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
    .overlay(
      RoundedRectangle(cornerRadius: 10, style: .continuous)
        .stroke(VinctusTokens.Color.border.opacity(0.5), lineWidth: 1)
    )
    .contentShape(Rectangle())
    .onTapGesture(perform: onOpen)
    .accessibilityAddTraits(.isButton)
    .task(id: authVM.currentUserID) { await loadStatus() }
  }

  @ViewBuilder
  private var actionButton: some View {
    if let status {
      let joined = status.isJoined
      Button(action: act) {
        Text(isWorking ? "Procesando..." : status.buttonTitle(isPrivate: isPrivate))
          .font(.caption)
          .padding(.horizontal, 12)
          .padding(.vertical, 7)
          .foregroundStyle(joined ? SwiftUI.Color.black : (status == .pending ? VinctusTokens.Color.textMuted : SwiftUI.Color(white: 0.83)))
          .background(joined ? VinctusTokens.Color.accent : VinctusTokens.Color.surface3)
          .clipShape(RoundedRectangle(cornerRadius: 5, style: .continuous))
      }
      .buttonStyle(.borderless)
      .disabled(isWorking || joined || status == .pending)
    }
  }

  private func loadStatus() async {
    guard let uid = authVM.currentUserID else { return }
    status = try? await repo.membershipStatus(groupID: group.id, ownerID: group.ownerID, uid: uid)
  }

  /// Joins a public group or asks to join a private one, like the web's `handleGroupAction`.
  private func act() {
    guard let uid = authVM.currentUserID, status == GroupMembershipStatus.none else { return }
    isWorking = true
    errorMessage = nil
    Task {
      do {
        if isPrivate {
          guard let ownerID = group.ownerID else { throw GroupsRepoError.privateGroup }
          try await repo.requestToJoin(groupID: group.id, groupName: group.name, ownerID: ownerID, uid: uid)
          status = .pending
        } else {
          try await repo.joinGroup(groupID: group.id, uid: uid)
          status = .member
        }
      } catch {
        errorMessage = error.localizedDescription
      }
      isWorking = false
    }
  }
}

/// Round group icon with the photo, or a people symbol when there is none (web style).
struct GroupRoundIcon: View {
  let iconURL: String?
  let size: CGFloat

  var body: some View {
    ZStack {
      Circle().fill(VinctusTokens.Color.surface2)
      if let iconURL, let url = URL(string: iconURL) {
        AsyncImage(url: url) { phase in
          if case .success(let image) = phase {
            image.resizable().scaledToFill()
          } else {
            placeholder
          }
        }
      } else {
        placeholder
      }
    }
    .frame(width: size, height: size)
    .clipShape(Circle())
    .overlay(Circle().stroke(VinctusTokens.Color.border, lineWidth: 1))
  }

  private var placeholder: some View {
    Image(systemName: "person.2")
      .font(.system(size: size * 0.36, weight: .light))
      .foregroundStyle(VinctusTokens.Color.textMuted)
  }
}

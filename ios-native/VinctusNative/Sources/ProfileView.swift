import SwiftUI

struct ProfileView: View {
  let userID: String

  @StateObject private var vm: ProfileViewModel
  @EnvironmentObject private var authVM: AuthViewModel
  @EnvironmentObject private var blockedUsers: BlockedUsersStore
  @State private var isEditing = false
  @State private var openedConversationID: String?
  @State private var isOpeningConversation = false
  @State private var messageError: String?

  private let repo: ProfileRepo
  private let chatRepo: ChatRepo

  init(repo: ProfileRepo, userID: String, chatRepo: ChatRepo = AppRepos.chat()) {
    self.userID = userID
    self.repo = repo
    self.chatRepo = chatRepo
    _vm = StateObject(wrappedValue: ProfileViewModel(repo: repo))
  }

  private var isOwnProfile: Bool { userID == authVM.currentUserID }

  var body: some View {
    ScrollView {
      VStack(spacing: VinctusTokens.Spacing.lg) {
        if let profile = vm.profile {
          header(profile)
          stats(profile)
          actions(profile)
          details(profile)
        } else if vm.isLoading {
          ProgressView()
            .padding(.top, 80)
        } else if let error = vm.errorMessage {
          VCard {
            VStack(alignment: .leading, spacing: VinctusTokens.Spacing.sm) {
              Text(error)
                .font(.footnote)
                .foregroundStyle(.red)
              VButton("Reintentar", variant: .secondary) {
                Task { await vm.load(userID: userID) }
              }
            }
          }
        }
      }
      .padding(VinctusTokens.Spacing.lg)
    }
    .background(VinctusTokens.Color.background)
    .navigationTitle(isOwnProfile ? "Mi perfil" : (vm.profile?.displayName ?? "Perfil"))
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      ToolbarItem(placement: .topBarTrailing) {
        if !isOwnProfile {
          ModerationMenu(
            target: .user(userID: userID),
            authorID: userID,
            authorName: vm.profile?.displayName ?? "este usuario"
          )
        }
      }
    }
    .navigationDestination(item: $openedConversationID) { conversationID in
      ConversationView(
        repo: chatRepo,
        profileRepo: repo,
        conversationID: conversationID,
        title: vm.profile?.displayName ?? "Mensajes",
        otherUserID: userID
      )
    }
    .sheet(isPresented: $isEditing) {
      if let profile = vm.profile {
        EditProfileSheet(profile: profile, repo: repo) {
          Task { await vm.load(userID: userID) }
        }
      }
    }
    .task(id: userID) {
      await vm.load(userID: userID)
    }
    .refreshable {
      await vm.load(userID: userID)
    }
  }

  // MARK: Sections

  private func header(_ profile: UserProfile) -> some View {
    VStack(spacing: 10) {
      AvatarView(name: profile.displayName, photoURLString: profile.photoURL, size: 96)
        .overlay(
          Circle()
            .stroke(
              LinearGradient(
                colors: [VinctusTokens.Color.accent, VinctusTokens.Color.accentAlt],
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

      if let bio = profile.bio, !bio.isEmpty {
        Text(bio)
          .font(.body)
          .foregroundStyle(VinctusTokens.Color.textPrimary)
          .multilineTextAlignment(.center)
          .padding(.top, 2)
      } else if isOwnProfile {
        Text("Agrega una biografía para que la gente sepa quién eres.")
          .font(.footnote)
          .foregroundStyle(VinctusTokens.Color.textMuted)
          .multilineTextAlignment(.center)
      }
    }
    .frame(maxWidth: .infinity)
  }

  private func stats(_ profile: UserProfile) -> some View {
    HStack(spacing: 0) {
      stat(value: profile.postsCount, label: "Publicaciones")
      divider
      stat(value: profile.followersCount, label: "Seguidores")
      divider
      stat(value: profile.followingCount, label: "Siguiendo")
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
  }

  @ViewBuilder
  private func actions(_ profile: UserProfile) -> some View {
    if isOwnProfile {
      VButton("Editar perfil", variant: .secondary) {
        isEditing = true
      }
    } else if !blockedUsers.isBlocked(userID) {
      VStack(alignment: .leading, spacing: 6) {
        HStack(spacing: VinctusTokens.Spacing.sm) {
          FollowButton(targetUID: userID, isPrivate: profile.accountVisibility == .private)

          Button(action: openConversation) {
            HStack(spacing: 6) {
              if isOpeningConversation {
                ProgressView()
                  .controlSize(.small)
              } else {
                Image(systemName: "bubble.left.fill")
              }
              Text("Mensaje")
                .font(.subheadline.weight(.semibold))
            }
            .frame(maxWidth: .infinity)
            .frame(height: 40)
            .foregroundStyle(VinctusTokens.Color.textPrimary)
            .background(VinctusTokens.Color.surface2)
            .clipShape(RoundedRectangle(cornerRadius: VinctusTokens.Radius.sm, style: .continuous))
          }
          .buttonStyle(.plain)
          .disabled(isOpeningConversation)
        }

        if let messageError {
          Text(messageError)
            .font(.caption)
            .foregroundStyle(.red)
        }
      }
    } else {
      Text("Bloqueaste a esta persona. Puedes desbloquearla en Ajustes > Usuarios bloqueados.")
        .font(.footnote)
        .foregroundStyle(VinctusTokens.Color.textMuted)
        .multilineTextAlignment(.center)
    }
  }

  private struct DetailRow: Hashable {
    let icon: String
    let text: String
  }

  private func detailRows(_ profile: UserProfile) -> [DetailRow] {
    var rows: [DetailRow] = []
    if let role = profile.role {
      rows.append(DetailRow(icon: "briefcase", text: role))
    }
    if let location = profile.location {
      rows.append(DetailRow(icon: "mappin.and.ellipse", text: location))
    }
    rows.append(
      DetailRow(
        icon: "calendar",
        text: "Se unió en \(profile.createdAt.formatted(.dateTime.month(.wide).year()))"
      )
    )
    return rows
  }

  private func details(_ profile: UserProfile) -> some View {
    VStack(alignment: .leading, spacing: 10) {
      ForEach(detailRows(profile), id: \.self) { row in
        Label(row.text, systemImage: row.icon)
          .font(.subheadline)
          .foregroundStyle(VinctusTokens.Color.textMuted)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(VinctusTokens.Spacing.md)
    .background(VinctusTokens.Color.surface)
    .clipShape(RoundedRectangle(cornerRadius: VinctusTokens.Radius.lg, style: .continuous))
  }

  private func openConversation() {
    isOpeningConversation = true
    messageError = nil
    Task {
      do {
        openedConversationID = try await chatRepo.openDirectConversation(with: userID)
      } catch {
        messageError = (error as? LocalizedError)?.errorDescription ?? "No se pudo abrir la conversación."
      }
      isOpeningConversation = false
    }
  }
}

/// Edits the signed-in user's name, bio and location.
private struct EditProfileSheet: View {
  let profile: UserProfile
  let repo: ProfileRepo
  let onSaved: () -> Void

  @Environment(\.dismiss) private var dismiss
  @State private var displayName: String
  @State private var bio: String
  @State private var location: String
  @State private var isSaving = false
  @State private var errorMessage: String?

  private static let nameLimit = 60
  private static let bioLimit = 300

  init(profile: UserProfile, repo: ProfileRepo, onSaved: @escaping () -> Void) {
    self.profile = profile
    self.repo = repo
    self.onSaved = onSaved
    _displayName = State(initialValue: profile.displayName)
    _bio = State(initialValue: profile.bio ?? "")
    _location = State(initialValue: profile.location ?? "")
  }

  private var trimmedName: String { displayName.trimmingCharacters(in: .whitespacesAndNewlines) }

  private var canSave: Bool {
    !isSaving && !trimmedName.isEmpty && trimmedName.count <= Self.nameLimit && bio.count <= Self.bioLimit
  }

  var body: some View {
    NavigationStack {
      Form {
        Section("Nombre") {
          TextField("Tu nombre", text: $displayName)
            .textContentType(.name)
        }
        Section {
          TextField("Cuéntale a la comunidad sobre ti", text: $bio, axis: .vertical)
            .lineLimit(3...6)
        } header: {
          Text("Biografía")
        } footer: {
          Text("\(Self.bioLimit - bio.count) caracteres restantes")
            .foregroundStyle(bio.count > Self.bioLimit ? .red : .secondary)
        }
        Section("Ubicación") {
          TextField("Ciudad, país", text: $location)
        }
        if let errorMessage {
          Section {
            Text(errorMessage)
              .foregroundStyle(.red)
          }
        }
      }
      .navigationTitle("Editar perfil")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("Cancelar") { dismiss() }
        }
        ToolbarItem(placement: .confirmationAction) {
          Button("Guardar", action: save)
            .disabled(!canSave)
        }
      }
      .vinctusLoading(isSaving)
    }
  }

  private func save() {
    isSaving = true
    errorMessage = nil
    let bioValue = bio.trimmingCharacters(in: .whitespacesAndNewlines)
    let locationValue = location.trimmingCharacters(in: .whitespacesAndNewlines)
    Task {
      do {
        try await repo.updateProfile(
          uid: profile.id,
          displayName: trimmedName,
          bio: bioValue.isEmpty ? nil : bioValue,
          location: locationValue.isEmpty ? nil : locationValue
        )
        onSaved()
        dismiss()
      } catch {
        errorMessage = "No se pudo guardar. Intenta de nuevo."
      }
      isSaving = false
    }
  }
}

struct AvatarView: View {
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
          case .success(let image):
            image
              .resizable()
              .scaledToFill()
          case .failure:
            initialText
          @unknown default:
            initialText
          }
        }
      } else {
        initialText
      }
    }
    .frame(width: size, height: size)
    .clipShape(Circle())
    .overlay(
      Circle()
        .stroke(VinctusTokens.Color.border.opacity(0.35), lineWidth: 1)
    )
  }

  private var avatarURL: URL? {
    guard let photoURLString else { return nil }
    return URL(string: photoURLString)
  }

  private var initialText: some View {
    Text(String(name.prefix(1)).uppercased())
      .font(.system(size: size * 0.38, weight: .semibold))
      .foregroundStyle(.secondary)
  }
}

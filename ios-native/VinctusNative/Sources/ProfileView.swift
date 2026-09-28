import PhotosUI
import SwiftUI
import UIKit

struct ProfileView: View {
  let userID: String

  @StateObject private var vm: ProfileViewModel
  @EnvironmentObject private var authVM: AuthViewModel
  @EnvironmentObject private var blockedUsers: BlockedUsersStore
  @State private var isEditing = false
  @State private var openedConversationID: String?
  @State private var isOpeningConversation = false
  @State private var messageError: String?
  @State private var followStatus: FollowStatus?
  @State private var followList: FollowListKind?
  /// The person on this profile asked to follow the signed-in user.
  @State private var hasIncomingRequest = false
  @State private var isAnsweringRequest = false
  /// Pending follow requests to the signed-in user, shown on their own profile.
  @State private var incomingRequestCount = 0
  @State private var reloadToken = 0

  private let repo: ProfileRepo
  private let chatRepo: ChatRepo
  private let contentRepo: ProfileContentRepo

  init(
    repo: ProfileRepo,
    userID: String,
    chatRepo: ChatRepo = AppRepos.chat(),
    contentRepo: ProfileContentRepo = AppRepos.profileContent()
  ) {
    self.userID = userID
    self.repo = repo
    self.chatRepo = chatRepo
    self.contentRepo = contentRepo
    _vm = StateObject(wrappedValue: ProfileViewModel(repo: repo))
  }

  private var isOwnProfile: Bool { userID == authVM.currentUserID }

  /// Same rule as `canViewPrivateContent` in the web's UserProfilePage.
  private func canViewContent(_ profile: UserProfile) -> Bool {
    isOwnProfile || profile.accountVisibility == .public || followStatus == .following
  }

  var body: some View {
    ScrollViewReader { proxy in
    ScrollView {
      VStack(spacing: VinctusTokens.Spacing.lg) {
        if let profile = vm.profile {
          header(profile)
          stats(profile)
          actions(profile)
          content(profile)
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
    .task(id: vm.profile?.id) {
      // Screenshot builds scroll to a section with `-VinctusScrollTo <id>`.
      guard vm.profile != nil, let target = AppRepos.demoArgument("-VinctusScrollTo") else { return }
      try? await Task.sleep(nanoseconds: 500_000_000)
      proxy.scrollTo(target, anchor: .top)
    }
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
    .navigationDestination(item: $followList) { kind in
      FollowListView(
        repo: contentRepo,
        profileRepo: repo,
        userID: userID,
        initialKind: kind,
        showsRequests: isOwnProfile
      )
    }
    .sheet(isPresented: $isEditing) {
      if let profile = vm.profile {
        EditProfileSheet(profile: profile, repo: repo) {
          Task { await reload() }
        }
      }
    }
    .task(id: userID) {
      await reload()
    }
    .refreshable {
      await reload()
    }
  }

  private func reload() async {
    await vm.load(userID: userID)
    reloadToken += 1
    if isOwnProfile {
      incomingRequestCount = (try? await contentRepo.fetchIncomingFollowRequests().count) ?? 0
    } else {
      hasIncomingRequest = (try? await contentRepo.hasPendingFollowRequest(from: userID)) ?? false
    }
  }

  // MARK: Header

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

  // MARK: Stats

  private func stats(_ profile: UserProfile) -> some View {
    let canOpenLists = canViewContent(profile)
    return HStack(spacing: 0) {
      stat(value: profile.postsCount, label: "Publicaciones")
      divider
      Button { followList = .followers } label: {
        stat(value: profile.followersCount, label: "Seguidores")
      }
      .buttonStyle(.plain)
      .disabled(!canOpenLists)
      divider
      Button { followList = .following } label: {
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

  // MARK: Actions

  @ViewBuilder
  private func actions(_ profile: UserProfile) -> some View {
    if isOwnProfile {
      VStack(spacing: VinctusTokens.Spacing.sm) {
        VButton("Editar perfil", variant: .secondary) {
          isEditing = true
        }
        if incomingRequestCount > 0 {
          Button { followList = .followers } label: {
            Label(
              incomingRequestCount == 1
                ? "1 solicitud de seguimiento"
                : "\(incomingRequestCount) solicitudes de seguimiento",
              systemImage: "person.badge.clock"
            )
            .font(.subheadline.weight(.semibold))
            .frame(maxWidth: .infinity)
            .frame(height: 40)
            .foregroundStyle(SwiftUI.Color.black)
            .background(VinctusTokens.Color.accent)
            .clipShape(RoundedRectangle(cornerRadius: VinctusTokens.Radius.sm, style: .continuous))
          }
          .buttonStyle(.plain)
        }
      }
    } else if !blockedUsers.isBlocked(userID) {
      VStack(alignment: .leading, spacing: 6) {
        if hasIncomingRequest {
          incomingRequestBanner(profile)
        }

        HStack(spacing: VinctusTokens.Spacing.sm) {
          FollowButton(
            targetUID: userID,
            isPrivate: profile.accountVisibility == .private,
            onStatusChange: { followStatus = $0 }
          )

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

  private func incomingRequestBanner(_ profile: UserProfile) -> some View {
    VStack(alignment: .leading, spacing: 8) {
      Text("\(profile.displayName) quiere seguirte")
        .font(.subheadline.weight(.semibold))
      HStack(spacing: VinctusTokens.Spacing.sm) {
        VButton("Aceptar") { answerRequest(accept: true) }
        VButton("Rechazar", variant: .secondary) { answerRequest(accept: false) }
      }
      .disabled(isAnsweringRequest)
    }
    .padding(VinctusTokens.Spacing.md)
    .background(VinctusTokens.Color.surface)
    .clipShape(RoundedRectangle(cornerRadius: VinctusTokens.Radius.lg, style: .continuous))
  }

  // MARK: Content

  @ViewBuilder
  private func content(_ profile: UserProfile) -> some View {
    if !isOwnProfile && blockedUsers.isBlocked(userID) {
      EmptyView()
    } else if canViewContent(profile) {
      ProfileAboutSection(profile: profile, isOwnProfile: isOwnProfile) { isEditing = true }
      ProfileReputationSection(reputation: profile.reputation, karma: profile.karmaByInterest)
      if isOwnProfile {
        ProfileCategoriesSection(repo: contentRepo)
          .id("categories")
        ProfileSavedDebatesSection(repo: contentRepo)
      }
      ProfilePostsSection(repo: contentRepo, profileRepo: repo, userID: userID, reloadToken: reloadToken)
        .id("posts")
      ProfileContributionsSection(repo: contentRepo, userID: userID, canEdit: isOwnProfile, reloadToken: reloadToken)
      details(profile)
    } else {
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

  private struct DetailRow: Hashable {
    let icon: String
    let text: String
  }

  private func detailRows(_ profile: UserProfile) -> [DetailRow] {
    var rows: [DetailRow] = []
    if let location = profile.location {
      rows.append(DetailRow(icon: "mappin.and.ellipse", text: location))
    }
    if isOwnProfile, let email = profile.email {
      rows.append(DetailRow(icon: "envelope", text: email))
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
    ProfileSectionCard(title: isOwnProfile ? "Contacto" : "Detalles", icon: "info.circle") {
      VStack(alignment: .leading, spacing: 10) {
        ForEach(detailRows(profile), id: \.self) { row in
          Label(row.text, systemImage: row.icon)
            .font(.subheadline)
            .foregroundStyle(VinctusTokens.Color.textMuted)
        }
      }
    }
  }

  // MARK: Actions

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

  private func answerRequest(accept: Bool) {
    isAnsweringRequest = true
    Task {
      do {
        try await contentRepo.answerFollowRequest(from: userID, accept: accept)
        hasIncomingRequest = false
      } catch {
        messageError = "No se pudo responder la solicitud."
      }
      isAnsweringRequest = false
    }
  }
}

/// Edits the signed-in user's photo, name, role, bio and location, like the web's EditProfileModal.
private struct EditProfileSheet: View {
  let profile: UserProfile
  let repo: ProfileRepo
  let onSaved: () -> Void

  @Environment(\.dismiss) private var dismiss
  @State private var displayName: String
  @State private var role: String
  @State private var bio: String
  @State private var location: String
  @State private var photoItem: PhotosPickerItem?
  @State private var newPhoto: UIImage?
  @State private var removesPhoto = false
  @State private var isSaving = false
  @State private var errorMessage: String?

  // Limits of `userProfileUpdateSchema` in src/features/profile/api/types.ts.
  private static let nameLimit = 120
  private static let roleLimit = 120
  private static let bioLimit = 500
  private static let locationLimit = 120

  init(profile: UserProfile, repo: ProfileRepo, onSaved: @escaping () -> Void) {
    self.profile = profile
    self.repo = repo
    self.onSaved = onSaved
    _displayName = State(initialValue: profile.displayName)
    _role = State(initialValue: profile.role ?? "")
    _bio = State(initialValue: profile.bio ?? "")
    _location = State(initialValue: profile.location ?? "")
  }

  private var trimmedName: String { displayName.trimmingCharacters(in: .whitespacesAndNewlines) }

  private var canSave: Bool {
    !isSaving && !trimmedName.isEmpty && trimmedName.count <= Self.nameLimit
      && role.count <= Self.roleLimit && bio.count <= Self.bioLimit && location.count <= Self.locationLimit
  }

  var body: some View {
    NavigationStack {
      Form {
        Section {
          HStack(spacing: VinctusTokens.Spacing.md) {
            photoPreview
              .frame(width: 72, height: 72)
              .clipShape(Circle())
            VStack(alignment: .leading, spacing: 8) {
              PhotosPicker(selection: $photoItem, matching: .images) {
                Label("Cambiar foto", systemImage: "photo")
              }
              if newPhoto != nil || (profile.photoURL != nil && !removesPhoto) {
                Button("Quitar foto", role: .destructive) {
                  newPhoto = nil
                  photoItem = nil
                  removesPhoto = true
                }
              }
            }
          }
        } header: {
          Text("Foto de perfil")
        }
        Section("Nombre") {
          TextField("Tu nombre", text: $displayName)
            .textContentType(.name)
        }
        Section("Rol") {
          TextField("Ej. Estudiante de física, músico…", text: $role)
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
      .onChange(of: photoItem) { _, item in
        guard let item else { return }
        Task {
          if let data = try? await item.loadTransferable(type: Data.self), let image = UIImage(data: data) {
            newPhoto = image
            removesPhoto = false
          } else {
            errorMessage = "No se pudo leer la imagen."
          }
        }
      }
    }
  }

  @ViewBuilder
  private var photoPreview: some View {
    if let newPhoto {
      Image(uiImage: newPhoto)
        .resizable()
        .scaledToFill()
    } else {
      AvatarView(name: trimmedName.isEmpty ? profile.displayName : trimmedName,
                 photoURLString: removesPhoto ? nil : profile.photoURL, size: 72)
    }
  }

  private func save() {
    isSaving = true
    errorMessage = nil
    func optional(_ value: String) -> String? {
      let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
      return trimmed.isEmpty ? nil : trimmed
    }
    var update = ProfileUpdate(
      displayName: trimmedName,
      bio: optional(bio),
      role: optional(role),
      location: optional(location)
    )
    let photo = newPhoto
    Task {
      do {
        if let photo, let data = Self.jpegData(photo) {
          update.photo = .set(try await repo.uploadProfilePhoto(uid: profile.id, jpegData: data))
        } else if removesPhoto {
          update.photo = .remove
        }
        try await repo.updateProfile(uid: profile.id, update)
        onSaved()
        dismiss()
      } catch {
        errorMessage = "No se pudo guardar. Intenta de nuevo."
      }
      isSaving = false
    }
  }

  /// Scales the photo down to 1024 px (storage.rules allows up to 10 MB) and encodes it as JPEG.
  private static func jpegData(_ image: UIImage) -> Data? {
    let maxSide: CGFloat = 1024
    let scale = min(1, maxSide / max(image.size.width, image.size.height))
    let size = CGSize(width: image.size.width * scale, height: image.size.height * scale)
    let format = UIGraphicsImageRendererFormat()
    format.scale = 1
    let resized = UIGraphicsImageRenderer(size: size, format: format).image { _ in
      image.draw(in: CGRect(origin: .zero, size: size))
    }
    return resized.jpegData(compressionQuality: 0.85)
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

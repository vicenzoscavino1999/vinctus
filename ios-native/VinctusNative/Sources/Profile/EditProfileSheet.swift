import PhotosUI
import SwiftUI
import UIKit

/// Edits the signed-in user's photo, name, role, bio and location, like the web's EditProfileModal.
struct EditProfileSheet: View {
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
  static func jpegData(_ image: UIImage) -> Data? {
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

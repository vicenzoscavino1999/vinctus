import UIKit

/// The signed-in user's editable profile fields and photo, like the web's EditProfileModal.
@MainActor
final class EditProfileViewModel: ObservableObject {
  @Published var displayName: String
  @Published var role: String
  @Published var bio: String
  @Published var location: String
  @Published private(set) var newPhoto: UIImage?
  @Published private(set) var removesPhoto = false
  @Published private(set) var isSaving = false
  @Published private(set) var errorMessage: String?

  // Limits of `userProfileUpdateSchema` in src/features/profile/api/types.ts.
  static let nameLimit = 120
  static let roleLimit = 120
  static let bioLimit = 500
  static let locationLimit = 120

  let profile: UserProfile
  private let repo: ProfileRepo

  init(profile: UserProfile, repo: ProfileRepo) {
    self.profile = profile
    self.repo = repo
    displayName = profile.displayName
    role = profile.role ?? ""
    bio = profile.bio ?? ""
    location = profile.location ?? ""
  }

  var trimmedName: String { displayName.trimmingCharacters(in: .whitespacesAndNewlines) }

  var canSave: Bool {
    !isSaving && !trimmedName.isEmpty && trimmedName.count <= Self.nameLimit
      && role.count <= Self.roleLimit && bio.count <= Self.bioLimit && location.count <= Self.locationLimit
  }

  var bioCharactersLeft: Int { Self.bioLimit - bio.count }

  /// The name under the avatar preview: what the user is typing, or the saved name.
  var previewName: String { trimmedName.isEmpty ? profile.displayName : trimmedName }

  /// The saved photo, unless the user removed it.
  var previewPhotoURL: String? { removesPhoto ? nil : profile.photoURL }

  var canRemovePhoto: Bool { newPhoto != nil || (profile.photoURL != nil && !removesPhoto) }

  /// `data` is what the photo picker returned; nil or unreadable data shows an error.
  func setPickedPhoto(_ data: Data?) {
    guard let data, let image = UIImage(data: data) else {
      errorMessage = "No se pudo leer la imagen."
      return
    }
    newPhoto = image
    removesPhoto = false
  }

  func removePhoto() {
    newPhoto = nil
    removesPhoto = true
  }

  /// Uploads the new photo first, if any. Returns true when the profile was saved.
  func save() async -> Bool {
    guard canSave else { return false }
    isSaving = true
    errorMessage = nil
    defer { isSaving = false }
    var update = ProfileUpdate(
      displayName: trimmedName,
      bio: Self.optional(bio),
      role: Self.optional(role),
      location: Self.optional(location)
    )
    do {
      if let newPhoto, let data = Self.jpegData(newPhoto) {
        update.photo = .set(try await repo.uploadProfilePhoto(uid: profile.id, jpegData: data))
      } else if removesPhoto {
        update.photo = .remove
      }
      try await repo.updateProfile(uid: profile.id, update)
      return true
    } catch {
      errorMessage = "No se pudo guardar. Intenta de nuevo."
      return false
    }
  }

  /// Scales the photo down to 1024 px (storage.rules allows up to 10 MB) and encodes it as JPEG.
  nonisolated static func jpegData(_ image: UIImage) -> Data? {
    ImageEncoding.jpegData(image, maxSide: 1024)
  }

  /// Trimmed text, or nil when empty so the field is cleared.
  nonisolated static func optional(_ value: String) -> String? {
    let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
    return trimmed.isEmpty ? nil : trimmed
  }
}

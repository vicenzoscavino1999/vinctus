import PhotosUI
import SwiftUI
import UIKit

/// Edits the signed-in user's photo, name, role, bio and location, like the web's EditProfileModal.
struct EditProfileSheet: View {
  let onSaved: () -> Void

  @Environment(\.dismiss) private var dismiss
  @StateObject private var vm: EditProfileViewModel
  @State private var photoItem: PhotosPickerItem?

  init(profile: UserProfile, repo: ProfileRepo, onSaved: @escaping () -> Void) {
    self.onSaved = onSaved
    _vm = StateObject(wrappedValue: EditProfileViewModel(profile: profile, repo: repo))
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
              if vm.canRemovePhoto {
                Button("Quitar foto", role: .destructive) {
                  photoItem = nil
                  vm.removePhoto()
                }
              }
            }
          }
        } header: {
          Text("Foto de perfil")
        }
        Section("Nombre") {
          TextField("Tu nombre", text: $vm.displayName)
            .textContentType(.name)
        }
        Section("Rol") {
          TextField("Ej. Estudiante de física, músico…", text: $vm.role)
        }
        Section {
          TextField("Cuéntale a la comunidad sobre ti", text: $vm.bio, axis: .vertical)
            .lineLimit(3...6)
        } header: {
          Text("Biografía")
        } footer: {
          Text("\(vm.bioCharactersLeft) caracteres restantes")
            .foregroundStyle(vm.bioCharactersLeft < 0 ? .red : .secondary)
        }
        Section("Ubicación") {
          TextField("Ciudad, país", text: $vm.location)
        }
        if let errorMessage = vm.errorMessage {
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
          Button("Guardar") {
            Task {
              if await vm.save() {
                onSaved()
                dismiss()
              }
            }
          }
          .disabled(!vm.canSave)
        }
      }
      .vinctusLoading(vm.isSaving)
      .onChange(of: photoItem) { _, item in
        guard let item else { return }
        Task {
          vm.setPickedPhoto(try? await item.loadTransferable(type: Data.self))
        }
      }
    }
  }

  @ViewBuilder
  private var photoPreview: some View {
    if let newPhoto = vm.newPhoto {
      Image(uiImage: newPhoto)
        .resizable()
        .scaledToFill()
    } else {
      AvatarView(name: vm.previewName, photoURLString: vm.previewPhotoURL, size: 72)
    }
  }
}

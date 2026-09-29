import PhotosUI
import SwiftUI
import UIKit

@MainActor
final class EditGroupViewModel: ObservableObject {
  @Published var name: String
  @Published var description: String
  @Published var categoryID: String?
  @Published var visibility: ProfileAccountVisibility
  @Published var newIcon: UIImage?
  @Published private(set) var isSaving = false
  @Published private(set) var errorMessage: String?
  /// Set when the icon failed to upload but the other changes were saved, like the web's warning toast.
  @Published private(set) var iconWarning: String?

  let detail: GroupDetail
  private let repo: any GroupsRepo

  init(detail: GroupDetail, repo: any GroupsRepo) {
    self.detail = detail
    self.repo = repo
    name = detail.name
    description = detail.description
    categoryID = detail.categoryID
    visibility = detail.visibility
  }

  private var update: GroupUpdate {
    GroupUpdate(name: name, description: description, categoryID: categoryID,
                visibility: visibility, iconURL: detail.iconURL)
  }

  var canSave: Bool { !isSaving && update.validated() != nil }

  /// Mirrors GroupEditPage.handleSubmit: uploads the new icon first, then saves the fields.
  /// Returns true when the group was saved.
  func save(ownerID: String?) async -> Bool {
    guard var update = update.validated() else {
      errorMessage = GroupsRepoError.invalidUpdate.errorDescription
      return false
    }
    isSaving = true
    errorMessage = nil
    iconWarning = nil
    defer { isSaving = false }

    if let newIcon, let ownerID, let data = ImageEncoding.jpegData(newIcon, maxSide: 512) {
      do {
        update.iconURL = try await repo.uploadGroupIcon(ownerID: ownerID, groupID: detail.id, jpegData: data)
      } catch {
        iconWarning = "No se pudo actualizar el ícono. Se guardaron los demás cambios."
      }
    }

    do {
      try await repo.updateGroup(groupID: detail.id, update)
      return true
    } catch {
      errorMessage = "No se pudo actualizar el grupo."
      return false
    }
  }
}

/// Lets the owner change the group's icon, name, description, category and visibility,
/// like the web's GroupEditPage.
struct EditGroupSheet: View {
  @StateObject private var vm: EditGroupViewModel
  @Environment(\.dismiss) private var dismiss
  @State private var photoItem: PhotosPickerItem?

  private let ownerID: String?
  private let onSaved: () -> Void

  init(detail: GroupDetail, repo: any GroupsRepo, ownerID: String?, onSaved: @escaping () -> Void) {
    _vm = StateObject(wrappedValue: EditGroupViewModel(detail: detail, repo: repo))
    self.ownerID = ownerID
    self.onSaved = onSaved
  }

  var body: some View {
    NavigationStack {
      Form {
        Section("Ícono") {
          HStack(spacing: VinctusTokens.Spacing.md) {
            iconPreview
            PhotosPicker(selection: $photoItem, matching: .images) {
              Label("Cambiar ícono", systemImage: "photo")
            }
          }
        }
        Section("Nombre") {
          TextField("Nombre del grupo", text: $vm.name)
        }
        Section {
          TextField("¿De qué trata el grupo?", text: $vm.description, axis: .vertical)
            .lineLimit(3...6)
        } header: {
          Text("Descripción")
        } footer: {
          Text("\(GroupUpdate.descriptionLimit - vm.description.count) caracteres restantes")
            .foregroundStyle(vm.description.count > GroupUpdate.descriptionLimit ? .red : .secondary)
        }
        Section("Categoría") {
          Picker("Categoría", selection: $vm.categoryID) {
            Text("Sin categoría").tag(String?.none)
            ForEach(InterestCategory.all) { category in
              Text(category.title).tag(String?.some(category.id))
            }
          }
        }
        Section {
          Picker("Visibilidad", selection: $vm.visibility) {
            Text("Público").tag(ProfileAccountVisibility.public)
            Text("Privado").tag(ProfileAccountVisibility.private)
          }
          .pickerStyle(.segmented)
        } header: {
          Text("Visibilidad")
        } footer: {
          Text(vm.visibility == .private
               ? "Las personas deben enviar una solicitud para unirse."
               : "Cualquiera puede unirse.")
        }
        if let message = vm.errorMessage {
          Section {
            Text(message).foregroundStyle(.red)
          }
        }
      }
      .scrollContentBackground(.hidden)
      .background(VinctusTokens.Color.background)
      .navigationTitle("Editar grupo")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("Cancelar") { dismiss() }
        }
        ToolbarItem(placement: .confirmationAction) {
          Button("Guardar") {
            Task {
              if await vm.save(ownerID: ownerID) {
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
          if let data = try? await item.loadTransferable(type: Data.self), let image = UIImage(data: data) {
            vm.newIcon = image
          }
        }
      }
    }
  }

  @ViewBuilder
  private var iconPreview: some View {
    if let icon = vm.newIcon {
      Image(uiImage: icon)
        .resizable()
        .scaledToFill()
        .frame(width: 64, height: 64)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    } else {
      GroupSquareIcon(name: vm.name.isEmpty ? vm.detail.name : vm.name, iconURL: vm.detail.iconURL, size: 64)
    }
  }
}

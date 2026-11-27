import PhotosUI
import SwiftUI
import UIKit

/// Creates a group like the web's CreateGroupModal: the group first, then its icon and the
/// initial members (people the owner follows). A failed icon or member does not undo the group;
/// it ends as a warning, like the web's toasts.
@MainActor
final class CreateGroupViewModel: ObservableObject {
  @Published var name = ""
  @Published var description = ""
  @Published var categoryID: String?
  @Published var visibility: ProfileAccountVisibility = .public
  @Published var newIcon: UIImage?
  @Published private(set) var selectedMembers: [ProfileUserSummary] = []
  @Published private(set) var following: [ProfileUserSummary] = []
  @Published private(set) var isLoadingFollowing = false
  @Published private(set) var followingError: String?
  @Published private(set) var isSaving = false
  @Published private(set) var errorMessage: String?

  static let followingLimit = 200

  private let repo: any GroupsRepo
  private let contentRepo: ProfileContentRepo

  /// `preselected`: people already chosen, like "Crear grupo con esta persona" in a chat.
  init(repo: any GroupsRepo, contentRepo: ProfileContentRepo, preselected: [ProfileUserSummary] = []) {
    self.repo = repo
    self.contentRepo = contentRepo
    self.selectedMembers = preselected
  }

  private var draft: GroupUpdate {
    GroupUpdate(name: name, description: description, categoryID: categoryID, visibility: visibility, iconURL: nil)
  }

  var canCreate: Bool { !isSaving && draft.validated() != nil }

  func isSelected(_ person: ProfileUserSummary) -> Bool {
    selectedMembers.contains { $0.id == person.id }
  }

  func toggle(_ person: ProfileUserSummary) {
    if isSelected(person) {
      selectedMembers.removeAll { $0.id == person.id }
    } else {
      selectedMembers.append(person)
    }
  }

  /// The people the owner follows, to pick initial members from (the web's `getFollowing`).
  func loadFollowing(uid: String?) async {
    guard let uid, following.isEmpty, !isLoadingFollowing else { return }
    isLoadingFollowing = true
    followingError = nil
    defer { isLoadingFollowing = false }
    do {
      following = try await contentRepo.fetchFollowList(
        uid: uid, kind: .following, limit: Self.followingLimit, after: nil
      ).items
    } catch {
      followingError = "No se pudo cargar a quién sigues."
    }
  }

  /// Returns the new group's id and an optional warning, or nil when the group was not created.
  func create(ownerID: String?) async -> (groupID: String, warning: String?)? {
    guard let ownerID else {
      errorMessage = "Debes iniciar sesión para crear un grupo."
      return nil
    }
    guard let draft = draft.validated() else {
      errorMessage = GroupsRepoError.invalidUpdate.errorDescription
      return nil
    }
    isSaving = true
    errorMessage = nil
    defer { isSaving = false }

    let groupID: String
    do {
      groupID = try await repo.createGroup(draft, ownerID: ownerID)
    } catch {
      errorMessage = "No se pudo crear el grupo."
      return nil
    }

    var warnings: [String] = []
    if let newIcon {
      do {
        guard let data = ImageEncoding.jpegData(newIcon, maxSide: 512) else { throw GroupsRepoError.invalidUpdate }
        var withIcon = draft
        withIcon.iconURL = try await repo.uploadGroupIcon(ownerID: ownerID, groupID: groupID, jpegData: data)
        try await repo.updateGroup(groupID: groupID, withIcon)
      } catch {
        warnings.append("no se pudo subir el ícono")
      }
    }

    // One person failing (for example, a block) does not stop the others.
    var failedMembers = 0
    for member in selectedMembers where member.id != ownerID {
      do {
        try await repo.addMember(groupID: groupID, uid: member.id)
      } catch {
        failedMembers += 1
      }
    }
    if failedMembers > 0 { warnings.append("algunos miembros no se pudieron agregar") }

    let warning = warnings.isEmpty ? nil : "Grupo creado, pero \(warnings.joined(separator: " y "))."
    return (groupID, warning)
  }
}

struct CreateGroupSheet: View {
  @EnvironmentObject private var authVM: AuthViewModel
  @StateObject private var vm: CreateGroupViewModel
  @Environment(\.dismiss) private var dismiss
  @State private var photoItem: PhotosPickerItem?

  private let onCreated: (_ groupID: String, _ warning: String?) -> Void

  init(
    repo: any GroupsRepo,
    contentRepo: ProfileContentRepo,
    preselected: [ProfileUserSummary] = [],
    onCreated: @escaping (_ groupID: String, _ warning: String?) -> Void
  ) {
    _vm = StateObject(wrappedValue: CreateGroupViewModel(repo: repo, contentRepo: contentRepo, preselected: preselected))
    self.onCreated = onCreated
  }

  var body: some View {
    NavigationStack {
      Form {
        Section("Ícono") {
          HStack(spacing: VinctusTokens.Spacing.md) {
            iconPreview
            VStack(alignment: .leading, spacing: 8) {
              PhotosPicker(selection: $photoItem, matching: .images) {
                Label(vm.newIcon == nil ? "Elegir ícono" : "Cambiar ícono", systemImage: "photo")
              }
              if vm.newIcon != nil {
                Button("Quitar ícono", role: .destructive) {
                  photoItem = nil
                  vm.newIcon = nil
                }
                .font(.caption)
              }
            }
          }
        }
        Section {
          TextField("Ej: Exploradores Cuánticos", text: $vm.name)
        } header: {
          Text("Nombre")
        } footer: {
          Text("\(GroupUpdate.nameLimit - vm.name.count) caracteres restantes")
            .foregroundStyle(vm.name.count > GroupUpdate.nameLimit ? .red : .secondary)
        }
        Section {
          TextField("Cuenta de qué trata el grupo…", text: $vm.description, axis: .vertical)
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
        Section {
          ForEach(vm.selectedMembers) { person in
            HStack(spacing: VinctusTokens.Spacing.sm) {
              AvatarView(name: person.name, photoURLString: person.photoURL, size: 32)
              Text(person.name)
                .lineLimit(1)
              Spacer()
              Button {
                vm.toggle(person)
              } label: {
                Image(systemName: "xmark.circle.fill")
                  .foregroundStyle(VinctusTokens.Color.textMuted)
              }
              .buttonStyle(.borderless)
              .accessibilityLabel("Quitar a \(person.name)")
            }
          }
          NavigationLink {
            CreateGroupMemberPicker(vm: vm)
          } label: {
            Label("Agregar personas", systemImage: "person.badge.plus")
          }
        } header: {
          Text("Miembros iniciales (\(vm.selectedMembers.count))")
        } footer: {
          Text("Personas que sigues. Puedes invitar a más después.")
        }
        if let message = vm.errorMessage {
          Section {
            Text(message).foregroundStyle(.red)
          }
        }
      }
      .scrollContentBackground(.hidden)
      .background(VinctusTokens.Color.background)
      .navigationTitle("Crear grupo")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("Cancelar") { dismiss() }
        }
        ToolbarItem(placement: .confirmationAction) {
          Button("Crear") {
            Task {
              if let created = await vm.create(ownerID: authVM.currentUserID) {
                onCreated(created.groupID, created.warning)
                dismiss()
              }
            }
          }
          .disabled(!vm.canCreate)
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
      GroupSquareIcon(name: vm.name.isEmpty ? "Grupo" : vm.name, iconURL: nil, size: 64)
    }
  }
}

/// The people the owner follows, with a search, to add as initial members.
private struct CreateGroupMemberPicker: View {
  @EnvironmentObject private var authVM: AuthViewModel
  @ObservedObject var vm: CreateGroupViewModel
  @State private var query = ""

  private var people: [ProfileUserSummary] {
    vm.following.filter { InboxFormat.matches($0.name, query: query) }
  }

  var body: some View {
    List {
      if vm.isLoadingFollowing, vm.following.isEmpty {
        HStack {
          Spacer()
          ProgressView()
          Spacer()
        }
        .listRowBackground(SwiftUI.Color.clear)
      } else if let error = vm.followingError {
        Text(error)
          .font(.footnote)
          .foregroundStyle(.red)
      } else if vm.following.isEmpty {
        Text("Aún no sigues a nadie. Sigue a personas para invitarlas a tus grupos.")
          .font(.footnote)
          .foregroundStyle(VinctusTokens.Color.textMuted)
      } else if people.isEmpty {
        Text("Nadie coincide con la búsqueda.")
          .font(.footnote)
          .foregroundStyle(VinctusTokens.Color.textMuted)
      } else {
        ForEach(people) { person in
          Button {
            vm.toggle(person)
          } label: {
            HStack(spacing: VinctusTokens.Spacing.md) {
              AvatarView(name: person.name, photoURLString: person.photoURL, size: 40)
              VStack(alignment: .leading, spacing: 2) {
                Text(person.name)
                  .foregroundStyle(VinctusTokens.Color.textPrimary)
                if let username = person.username, !username.isEmpty {
                  Text("@\(username)")
                    .font(.caption)
                    .foregroundStyle(VinctusTokens.Color.textMuted)
                }
              }
              Spacer()
              Image(systemName: vm.isSelected(person) ? "checkmark.circle.fill" : "circle")
                .foregroundStyle(vm.isSelected(person) ? VinctusTokens.Color.accent : VinctusTokens.Color.textMuted)
            }
            .contentShape(Rectangle())
          }
          .buttonStyle(.plain)
          .accessibilityAddTraits(vm.isSelected(person) ? .isSelected : [])
        }
      }
    }
    .scrollContentBackground(.hidden)
    .background(VinctusTokens.Color.background)
    .navigationTitle("Agregar personas")
    .navigationBarTitleDisplayMode(.inline)
    .searchable(text: $query, prompt: "Buscar por nombre…")
    .task {
      await vm.loadFollowing(uid: authVM.currentUserID)
    }
  }
}

import SwiftUI

/// Your private collections of links, notes and files, like the web's Colecciones tab.
struct CollectionsView: View {
  @EnvironmentObject private var authVM: AuthViewModel
  @StateObject private var vm: CollectionsViewModel
  @State private var editing: CollectionEditorTarget?
  @State private var pendingDelete: UserCollection?

  init(repo: CollectionsRepo = AppRepos.collections()) {
    _vm = StateObject(wrappedValue: CollectionsViewModel(repo: repo))
  }

  var body: some View {
    List {
      if vm.isLoading {
        ProgressView()
          .frame(maxWidth: .infinity)
      } else if let error = vm.errorMessage, vm.collections.isEmpty {
        VStack(spacing: 10) {
          Text(error)
            .font(.footnote)
            .foregroundStyle(.red)
            .multilineTextAlignment(.center)
          Button("Reintentar") {
            Task { await vm.load() }
          }
          .buttonStyle(.bordered)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 24)
        .listRowBackground(SwiftUI.Color.clear)
      } else if vm.collections.isEmpty {
        VStack(spacing: 10) {
          Image(systemName: "books.vertical")
            .font(.system(size: 36))
            .foregroundStyle(VinctusTokens.Color.accent)
          Text("Aún no tienes colecciones")
            .font(.headline)
          Text("Guarda enlaces, notas y archivos en carpetas privadas. Solo tú puedes verlas.")
            .font(.footnote)
            .foregroundStyle(VinctusTokens.Color.textMuted)
            .multilineTextAlignment(.center)
          VButton("Crear colección") { editing = .new }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 30)
        .listRowBackground(SwiftUI.Color.clear)
      } else if vm.visibleCollections.isEmpty {
        VStack(spacing: 10) {
          Text("No hay colecciones para esa búsqueda.")
            .font(.footnote)
            .foregroundStyle(VinctusTokens.Color.textMuted)
            .multilineTextAlignment(.center)
          Button("Limpiar búsqueda") {
            vm.searchText = ""
          }
          .buttonStyle(.bordered)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 24)
        .listRowBackground(SwiftUI.Color.clear)
      } else {
        ForEach(vm.visibleCollections) { collection in
          NavigationLink {
            CollectionDetailView(collection: collection, repo: vm.repo) {
              Task { await vm.load() }
            }
          } label: {
            CollectionRow(collection: collection)
          }
          .swipeActions {
            Button("Eliminar", role: .destructive) { pendingDelete = collection }
            Button("Editar") { editing = .existing(collection) }
              .tint(VinctusTokens.Color.accentAlt)
          }
        }
        if let error = vm.errorMessage {
          Text(error)
            .font(.footnote)
            .foregroundStyle(.red)
        }
      }
    }
    // Pinned under the title: iOS 26 would otherwise put it at the bottom, behind our tab bar.
    .searchable(text: $vm.searchText, placement: .navigationBarDrawer(displayMode: .always), prompt: "Buscar colecciones")
    .navigationTitle("Colecciones")
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      ToolbarItem(placement: .topBarTrailing) {
        Button {
          editing = .new
        } label: {
          Image(systemName: "plus")
        }
        .accessibilityLabel("Nueva colección")
      }
    }
    .sheet(item: $editing) { target in
      CollectionEditorSheet(target: target, repo: vm.repo) {
        Task { await vm.load() }
      }
    }
    .confirmationDialog(
      "¿Eliminar \(pendingDelete?.name ?? "la colección")?",
      isPresented: Binding(get: { pendingDelete != nil }, set: { if !$0 { pendingDelete = nil } }),
      titleVisibility: .visible
    ) {
      Button("Eliminar con todo su contenido", role: .destructive) {
        guard let collection = pendingDelete else { return }
        pendingDelete = nil
        Task { await vm.delete(collection) }
      }
    }
    .task(id: authVM.currentUserID) {
      guard authVM.currentUserID != nil else {
        vm.reset()
        return
      }
      await vm.load()
    }
    .refreshable {
      guard authVM.currentUserID != nil else { return }
      await vm.load()
    }
  }
}

private struct CollectionRow: View {
  let collection: UserCollection

  var body: some View {
    HStack(spacing: VinctusTokens.Spacing.md) {
      Image(systemName: collection.icon.systemImage)
        .font(.title3)
        .foregroundStyle(VinctusTokens.Color.accent)
        .frame(width: 40, height: 40)
        .background(VinctusTokens.Color.surface2)
        .clipShape(RoundedRectangle(cornerRadius: VinctusTokens.Radius.sm, style: .continuous))
      VStack(alignment: .leading, spacing: 2) {
        Text(collection.name)
          .font(.headline)
        Text(collection.itemCount == 1 ? "1 elemento" : "\(collection.itemCount) elementos")
          .font(.caption)
          .foregroundStyle(VinctusTokens.Color.textMuted)
      }
    }
    .padding(.vertical, 2)
  }
}

// MARK: - Create / edit

enum CollectionEditorTarget: Identifiable {
  case new
  case existing(UserCollection)

  var id: String {
    switch self {
    case .new: return "new"
    case let .existing(collection): return collection.id
    }
  }
}

private struct CollectionEditorSheet: View {
  let onSaved: () -> Void

  @Environment(\.dismiss) private var dismiss
  @StateObject private var vm: CollectionEditorViewModel

  init(target: CollectionEditorTarget, repo: CollectionsRepo, onSaved: @escaping () -> Void) {
    self.onSaved = onSaved
    _vm = StateObject(wrappedValue: CollectionEditorViewModel(target: target, repo: repo))
  }

  var body: some View {
    NavigationStack {
      Form {
        Section {
          TextField("Ej. Libros por leer", text: $vm.name)
        } header: {
          Text("Nombre")
        } footer: {
          let count = vm.name.trimmingCharacters(in: .whitespacesAndNewlines).count
          Text("\(count)/\(Limits.Collections.nameMaxLength)")
            .foregroundStyle(count > Limits.Collections.nameMaxLength ? .red : VinctusTokens.Color.textMuted)
        }
        Section("Icono") {
          Picker("Icono", selection: $vm.icon) {
            ForEach(CollectionIcon.allCases) { icon in
              Label(icon.title, systemImage: icon.systemImage).tag(icon)
            }
          }
          .pickerStyle(.inline)
          .labelsHidden()
        }
        if let errorMessage = vm.errorMessage {
          Section {
            Text(errorMessage)
              .foregroundStyle(.red)
          }
        }
      }
      .navigationTitle(vm.title)
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("Cancelar") { dismiss() }
            .disabled(vm.isSaving)
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
      .interactiveDismissDisabled(vm.isSaving)
      .vinctusLoading(vm.isSaving)
    }
  }
}

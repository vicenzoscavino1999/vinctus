import SwiftUI

/// Your private collections of links, notes and files, like the web's Colecciones: the folders as
/// cards and "Recientes" across them.
struct CollectionsView: View {
  @EnvironmentObject private var authVM: AuthViewModel
  @Environment(\.openURL) private var openURL
  @StateObject private var vm: CollectionsViewModel
  @State private var editing: CollectionEditorTarget?
  @State private var pendingDelete: UserCollection?
  @State private var openedNote: RecentCollectionItem?

  init(repo: CollectionsRepo = AppRepos.collections()) {
    _vm = StateObject(wrappedValue: CollectionsViewModel(repo: repo))
  }

  var body: some View {
    withSheets(page)
  }

  private var page: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 28) {
        Text("Tus enlaces, notas y archivos. Solo tú puedes verlos.")
          .font(.subheadline)
          .foregroundStyle(VinctusTokens.Color.textMuted)
        foldersSection
        if !vm.collections.isEmpty {
          recentsSection
        }
      }
      .padding(VinctusTokens.Spacing.lg)
      .padding(.bottom, 24)
    }
    .background(VinctusTokens.Color.background)
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

  private var isConfirmingDelete: Binding<Bool> {
    Binding(get: { pendingDelete != nil }, set: { if !$0 { pendingDelete = nil } })
  }

  private func withSheets<V: View>(_ view: V) -> some View {
    view
      .sheet(item: $editing) { (target: CollectionEditorTarget) in
        CollectionEditorSheet(target: target, repo: vm.repo) {
          Task { await vm.load() }
        }
      }
      .sheet(item: $openedNote) { (note: RecentCollectionItem) in
        CollectionNoteSheet(note: note)
      }
      .confirmationDialog(
        "¿Eliminar \(pendingDelete?.name ?? "la colección")?",
        isPresented: isConfirmingDelete,
        titleVisibility: .visible
      ) {
        Button("Eliminar con todo su contenido", role: .destructive) {
          guard let collection = pendingDelete else { return }
          pendingDelete = nil
          Task { await vm.delete(collection) }
        }
      }
  }

  // MARK: Folders

  private var foldersSection: some View {
    VStack(alignment: .leading, spacing: 12) {
      HStack {
        Text("Carpetas")
          .font(.headline)
          .foregroundStyle(VinctusTokens.Color.textPrimary)
        Spacer()
        Button {
          editing = .new
        } label: {
          Label("Nueva carpeta", systemImage: "folder.badge.plus")
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(.black)
            .padding(.horizontal, 14)
            .frame(height: 34)
            .background(VinctusTokens.Color.accent, in: Capsule())
        }
        .buttonStyle(.plain)
      }
      foldersContent
      if let error = vm.errorMessage, !vm.collections.isEmpty {
        Text(error)
          .font(.footnote)
          .foregroundStyle(.red)
      }
    }
  }

  @ViewBuilder
  private var foldersContent: some View {
    if vm.isLoading && vm.collections.isEmpty {
      ProgressView()
        .frame(maxWidth: .infinity)
        .padding(.vertical, 30)
    } else if let error = vm.errorMessage, vm.collections.isEmpty {
      VStack(spacing: 10) {
        Text(error)
          .font(.footnote)
          .foregroundStyle(.red)
        Button("Reintentar") {
          Task { await vm.load() }
        }
        .buttonStyle(.bordered)
      }
      .frame(maxWidth: .infinity)
      .padding(.vertical, 24)
    } else if vm.collections.isEmpty {
      CollectionsEmptyNote(text: "Crea tu primera carpeta para guardar enlaces, notas y archivos.")
    } else if vm.visibleCollections.isEmpty {
      CollectionsEmptyNote(text: "No hay colecciones para esa búsqueda.")
    } else {
      LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) {
        ForEach(vm.visibleCollections) { collection in
          folderLink(collection)
        }
      }
    }
  }

  private func folderLink(_ collection: UserCollection) -> some View {
    NavigationLink {
      CollectionDetailView(collection: collection, repo: vm.repo) {
        Task { await vm.load() }
      }
    } label: {
      CollectionFolderCard(collection: collection)
    }
    .buttonStyle(.plain)
    .contextMenu {
      Button {
        editing = .existing(collection)
      } label: {
        Label("Editar", systemImage: "pencil")
      }
      Button(role: .destructive) {
        pendingDelete = collection
      } label: {
        Label("Eliminar", systemImage: "trash")
      }
    }
  }

  // MARK: Recents

  private var recentsSection: some View {
    VStack(alignment: .leading, spacing: 12) {
      Text("Recientes")
        .font(.headline)
        .foregroundStyle(VinctusTokens.Color.textPrimary)
      if vm.visibleRecents.isEmpty {
        CollectionsEmptyNote(text: "No se encontraron elementos recientes.")
      } else {
        VStack(spacing: 10) {
          ForEach(vm.visibleRecents) { recent in
            Button {
              open(recent)
            } label: {
              CollectionRecentRow(recent: recent)
            }
            .buttonStyle(.plain)
          }
        }
      }
    }
  }

  private func open(_ recent: RecentCollectionItem) {
    switch recent.item.type {
    case .note:
      openedNote = recent
    case .link, .file:
      if let value = recent.item.url, let url = URL(string: value), url.scheme == "https" || url.scheme == "http" {
        openURL(url)
      }
    }
  }
}

private struct CollectionsEmptyNote: View {
  let text: String

  var body: some View {
    Text(text)
      .font(.subheadline)
      .foregroundStyle(VinctusTokens.Color.textMuted)
      .multilineTextAlignment(.center)
      .frame(maxWidth: .infinity)
      .padding(.vertical, 28)
      .overlay(
        RoundedRectangle(cornerRadius: 18, style: .continuous)
          .stroke(VinctusTokens.Color.border.opacity(0.7), style: StrokeStyle(lineWidth: 1, dash: [4, 4]))
      )
  }
}

/// A folder: its icon on a gold tile, the name and how many things it holds.
private struct CollectionFolderCard: View {
  let collection: UserCollection

  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      Image(systemName: collection.icon.systemImage)
        .font(.system(size: 17, weight: .medium))
        .foregroundStyle(VinctusTokens.Color.accent)
        .frame(width: 40, height: 40)
        .background(VinctusTokens.Color.accent.opacity(0.15), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .padding(.bottom, 8)
      Text(collection.name)
        .font(.subheadline.weight(.semibold))
        .foregroundStyle(VinctusTokens.Color.textPrimary)
        .lineLimit(1)
      Text(collection.itemCount == 1 ? "1 guardado" : "\(collection.itemCount) guardados")
        .font(.caption)
        .foregroundStyle(VinctusTokens.Color.textMuted)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(14)
    .background(VinctusTokens.Color.surface, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    .overlay(
      RoundedRectangle(cornerRadius: 18, style: .continuous)
        .stroke(VinctusTokens.Color.border.opacity(0.6), lineWidth: 0.5)
    )
    .contentShape(Rectangle())
  }
}

private struct CollectionRecentRow: View {
  let recent: RecentCollectionItem

  private var icon: String {
    switch recent.item.type {
    case .link: return "link"
    case .file: return "doc"
    case .note: return "note.text"
    }
  }

  var body: some View {
    HStack(spacing: 12) {
      Image(systemName: icon)
        .font(.system(size: 16))
        .foregroundStyle(VinctusTokens.Color.textSecondary)
        .frame(width: 42, height: 42)
        .background(VinctusTokens.Color.surface2, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
      VStack(alignment: .leading, spacing: 2) {
        Text(recent.item.title)
          .font(.subheadline)
          .foregroundStyle(VinctusTokens.Color.textPrimary)
          .lineLimit(1)
        Text("Colección: \(recent.collectionName)")
          .font(.caption)
          .foregroundStyle(VinctusTokens.Color.textMuted)
          .lineLimit(1)
      }
      Spacer(minLength: 8)
      Text(ConnectionsFormat.relativeAge(recent.item.createdAt))
        .font(.caption)
        .foregroundStyle(VinctusTokens.Color.textMuted)
    }
    .padding(12)
    .background(VinctusTokens.Color.surface, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    .contentShape(Rectangle())
  }
}

/// A note from "Recientes", to read it without opening its folder.
private struct CollectionNoteSheet: View {
  let note: RecentCollectionItem
  @Environment(\.dismiss) private var dismiss

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: 12) {
          Text(note.item.title)
            .font(VinctusTokens.Typography.serif(26))
            .foregroundStyle(VinctusTokens.Color.textPrimary)
          Text("Colección: \(note.collectionName) · \(ConnectionsFormat.relativeAge(note.item.createdAt))")
            .font(.caption)
            .foregroundStyle(VinctusTokens.Color.textMuted)
          Text(note.item.text ?? "Sin contenido.")
            .textSelection(.enabled)
            .foregroundStyle(VinctusTokens.Color.textSecondary)
            .padding(.top, 6)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(VinctusTokens.Spacing.lg)
      }
      .background(VinctusTokens.Color.background)
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("Cerrar") { dismiss() }
        }
      }
    }
    .presentationDetents([.medium, .large])
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

import SwiftUI

// MARK: - List

@MainActor
final class CollectionsViewModel: ObservableObject {
  @Published private(set) var collections: [UserCollection] = []
  @Published private(set) var isLoading = true
  @Published var errorMessage: String?
  @Published var searchText = ""

  let repo: CollectionsRepo

  init(repo: CollectionsRepo) {
    self.repo = repo
  }

  /// Same search as the web's CollectionsPanel: by name, ignoring case.
  var visibleCollections: [UserCollection] {
    let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !query.isEmpty else { return collections }
    return collections.filter { $0.name.localizedCaseInsensitiveContains(query) }
  }

  func load() async {
    do {
      collections = try await repo.fetchCollections()
      errorMessage = nil
    } catch {
      errorMessage = "No se pudieron cargar tus colecciones."
    }
    isLoading = false
  }

  func delete(_ collection: UserCollection) async {
    let previous = collections
    collections.removeAll { $0.id == collection.id }
    do {
      try await repo.deleteCollection(id: collection.id)
    } catch {
      collections = previous
      errorMessage = "No se pudo eliminar la colección."
    }
  }
}

/// Your private collections of links and notes, like the web's Colecciones tab.
struct CollectionsView: View {
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
        Text(error)
          .foregroundStyle(.red)
      } else if vm.collections.isEmpty {
        VStack(spacing: 10) {
          Image(systemName: "books.vertical")
            .font(.system(size: 36))
            .foregroundStyle(VinctusTokens.Color.accent)
          Text("Aún no tienes colecciones")
            .font(.headline)
          Text("Guarda enlaces y notas en carpetas privadas. Solo tú puedes verlas.")
            .font(.footnote)
            .foregroundStyle(VinctusTokens.Color.textMuted)
            .multilineTextAlignment(.center)
          VButton("Crear colección") { editing = .new }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 30)
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
    .searchable(text: $vm.searchText, prompt: "Buscar colecciones")
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
        Task { await vm.delete(collection) }
      }
    }
    .task { await vm.load() }
    .refreshable { await vm.load() }
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
        Section("Nombre") {
          TextField("Ej. Libros por leer", text: $vm.name)
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
    }
  }
}

// MARK: - Detail

struct CollectionDetailView: View {
  let collection: UserCollection
  let repo: CollectionsRepo
  let onChange: () -> Void

  @Environment(\.openURL) private var openURL
  @StateObject private var vm: CollectionDetailViewModel
  @State private var isAdding = false
  @State private var openedNote: CollectionItem?

  init(collection: UserCollection, repo: CollectionsRepo, onChange: @escaping () -> Void) {
    self.collection = collection
    self.repo = repo
    self.onChange = onChange
    _vm = StateObject(wrappedValue: CollectionDetailViewModel(collection: collection, repo: repo))
  }

  var body: some View {
    List {
      if vm.isLoading {
        ProgressView()
          .frame(maxWidth: .infinity)
      } else if vm.items.isEmpty {
        VStack(spacing: 8) {
          Image(systemName: collection.icon.systemImage)
            .font(.system(size: 30))
            .foregroundStyle(VinctusTokens.Color.accent)
          Text("Esta colección está vacía")
            .font(.headline)
          Text("Toca + para guardar un enlace o una nota.")
            .font(.footnote)
            .foregroundStyle(VinctusTokens.Color.textMuted)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 24)
        .listRowBackground(SwiftUI.Color.clear)
      } else {
        ForEach(vm.items) { item in
          Button {
            open(item)
          } label: {
            itemRow(item)
          }
          .buttonStyle(.plain)
          .swipeActions {
            Button("Eliminar", role: .destructive) {
              Task {
                if await vm.delete(item) { onChange() }
              }
            }
          }
        }
      }
      if let errorMessage = vm.errorMessage {
        Text(errorMessage)
          .font(.footnote)
          .foregroundStyle(.red)
      }
    }
    .navigationTitle(collection.name)
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      ToolbarItem(placement: .topBarTrailing) {
        Button {
          isAdding = true
        } label: {
          Image(systemName: "plus")
        }
        .accessibilityLabel("Añadir a la colección")
      }
    }
    .sheet(isPresented: $isAdding) {
      NewCollectionItemSheet(collection: collection, repo: repo) {
        Task { await vm.load() }
        onChange()
      }
    }
    .sheet(item: $openedNote) { note in
      NavigationStack {
        ScrollView {
          Text(note.text ?? "")
            .textSelection(.enabled)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding()
        }
        .navigationTitle(note.title)
        .navigationBarTitleDisplayMode(.inline)
      }
      .presentationDetents([.medium, .large])
    }
    .task { await vm.load() }
    .refreshable { await vm.load() }
  }

  private func itemRow(_ item: CollectionItem) -> some View {
    HStack(alignment: .top, spacing: VinctusTokens.Spacing.sm) {
      Image(systemName: icon(for: item.type))
        .foregroundStyle(VinctusTokens.Color.accent)
        .frame(width: 24)
      VStack(alignment: .leading, spacing: 3) {
        Text(item.title)
          .font(.subheadline.weight(.semibold))
          .foregroundStyle(VinctusTokens.Color.textPrimary)
        if let detail = item.url ?? item.text ?? item.fileName {
          Text(detail)
            .font(.caption)
            .foregroundStyle(VinctusTokens.Color.textMuted)
            .lineLimit(2)
        }
      }
      Spacer()
    }
    .contentShape(Rectangle())
    .padding(.vertical, 2)
  }

  private func icon(for type: CollectionItemType) -> String {
    switch type {
    case .link: return "link"
    case .note: return "note.text"
    case .file: return "doc"
    }
  }

  private func open(_ item: CollectionItem) {
    if item.type == .note {
      openedNote = item
    } else if let link = item.url, let url = URL(string: link) {
      openURL(url)
    }
  }

}

private struct NewCollectionItemSheet: View {
  let onSaved: () -> Void

  @Environment(\.dismiss) private var dismiss
  @StateObject private var vm: NewCollectionItemViewModel

  init(collection: UserCollection, repo: CollectionsRepo, onSaved: @escaping () -> Void) {
    self.onSaved = onSaved
    _vm = StateObject(wrappedValue: NewCollectionItemViewModel(collection: collection, repo: repo))
  }

  var body: some View {
    NavigationStack {
      Form {
        Section {
          Picker("Tipo", selection: $vm.draft.kind) {
            ForEach(NewCollectionItem.Kind.allCases) { kind in
              Text(kind.title).tag(kind)
            }
          }
          .pickerStyle(.segmented)
        }
        Section("Título") {
          TextField("¿Qué es?", text: $vm.draft.title)
        }
        switch vm.draft.kind {
        case .link:
          Section {
            TextField("https://", text: $vm.draft.url)
              .keyboardType(.URL)
              .textInputAutocapitalization(.never)
              .autocorrectionDisabled()
          } header: {
            Text("Enlace")
          } footer: {
            Text("Para guardar archivos, usa la versión web.")
          }
        case .note:
          Section("Nota") {
            TextField("Escribe tu nota", text: $vm.draft.text, axis: .vertical)
              .lineLimit(4...10)
          }
        }
        if let errorMessage = vm.errorMessage {
          Section {
            Text(errorMessage)
              .foregroundStyle(.red)
          }
        }
      }
      .navigationTitle("Añadir a \(vm.collection.name)")
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
          .disabled(vm.isSaving)
        }
      }
      .vinctusLoading(vm.isSaving)
    }
  }
}

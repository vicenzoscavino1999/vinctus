import SwiftUI

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

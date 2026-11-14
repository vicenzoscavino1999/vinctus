import SwiftUI
import PhotosUI
import UniformTypeIdentifiers
import FirebaseAuth
import FirebaseCore

struct CreatePostView: View {
  @StateObject private var vm: CreatePostViewModel
  @State private var selectedPhotos: [PhotosPickerItem] = []
  @State private var importingDocuments = false
  @State private var confirmingDiscard = false
  @Environment(\.scenePhase) private var scenePhase

  init(repo: CreatePostRepo, groupID: String? = nil) {
    let uid = !AppRepos.isDemo && FirebaseApp.app() != nil && Auth.auth().currentUser?.isAnonymous == false ? Auth.auth().currentUser?.uid : nil
    let session = uid.map { PostDraftSession(uid: $0, groupID: groupID) }
    _vm = StateObject(wrappedValue: CreatePostViewModel(repo: repo, groupID: groupID, draftSession: session,
      currentUserID: { FirebaseApp.app() != nil ? Auth.auth().currentUser?.uid : nil }))
  }

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: VinctusTokens.Spacing.lg) {
        VCard {
          VStack(alignment: .leading, spacing: VinctusTokens.Spacing.md) {
            Text("Nueva publicación")
              .font(.headline)

            Text(!vm.supportsDraftRecovery ? "Borrador temporal" : vm.draftSaveError != nil ? "Borrador pendiente de recuperar o guardar" : vm.isRestoringDraft ? "Recuperando borrador…" : vm.isDraftSaving ? "Guardando borrador…" : "Borrador guardado en este dispositivo")
              .font(.caption).foregroundStyle(.secondary)
            if let error = vm.draftSaveError {
              Text(error).font(.footnote).foregroundStyle(.red)
              Button("Reintentar guardado") { Task { await vm.retryDraftSave() } }
            }
            Button("Descartar borrador", role: .destructive) { confirmingDiscard = true }
              .disabled(vm.isSubmitting || vm.isPreparingMedia || !vm.draftLoaded)

            TextField("Título (opcional)", text: $vm.draftTitle)
              .textFieldStyle(.roundedBorder)
              .disabled(vm.isSubmitting || !vm.draftLoaded)
            Text("\(vm.draftTitle.count)/120")
              .font(.caption)
              .foregroundStyle(vm.draftTitle.count > 120 ? .red : .secondary)

            ZStack(alignment: .topLeading) {
              if vm.draftText.isEmpty {
                Text("Comparte una idea con la comunidad...")
                  .foregroundStyle(.secondary)
                  .padding(.top, 12)
                  .padding(.leading, 10)
              }

              TextEditor(text: $vm.draftText)
                .disabled(!vm.draftLoaded || vm.isDiscardingDraft)
                .frame(minHeight: 170)
                .padding(.horizontal, 6)
                .padding(.vertical, 8)
                .onChange(of: vm.draftText) { _, _ in
                  vm.clearFeedbackIfNeeded()
                }
            }
            .background(VinctusTokens.Color.surface2)
            .clipShape(RoundedRectangle(cornerRadius: VinctusTokens.Radius.md, style: .continuous))
            .overlay(
              RoundedRectangle(cornerRadius: VinctusTokens.Radius.md, style: .continuous)
                .stroke(
                  vm.remainingCharacters < 0
                    ? SwiftUI.Color.red.opacity(0.45)
                    : VinctusTokens.Color.border.opacity(0.35),
                  lineWidth: 1
                )
            )

            HStack {
              Text("Maximo \(vm.characterLimit) caracteres")
                .font(.caption)
                .foregroundStyle(.secondary)

              Spacer()

              Text("\(vm.remainingCharacters)")
                .font(.caption.monospacedDigit())
                .foregroundStyle(vm.remainingCharacters < 0 ? .red : .secondary)
            }

            TextField("Enlace de YouTube (opcional)", text: $vm.youtubeURL)
              .keyboardType(.URL)
              .textInputAutocapitalization(.never)
              .autocorrectionDisabled()
              .textFieldStyle(.roundedBorder)
              .disabled(vm.isSubmitting || !vm.draftLoaded)

            HStack {
              PhotosPicker(selection: $selectedPhotos, maxSelectionCount: max(1, 10 - vm.attachments.count),
                matching: .any(of: [.images, .videos]), preferredItemEncoding: .compatible) {
                Label("Fotos o videos", systemImage: "photo.on.rectangle")
              }
              Button { importingDocuments = true } label: { Label("Documentos", systemImage: "doc") }
            }
            .font(.subheadline)
            .disabled(vm.isSubmitting || vm.isPreparingMedia || !vm.draftLoaded || vm.attachments.count >= 10)

            ForEach(vm.attachments) { file in
              HStack {
                Label(file.fileName, systemImage: file.kind == .image ? "photo" : file.kind == .video ? "video" : "doc")
                  .lineLimit(1)
                Spacer()
                Text(ByteCountFormatter.string(fromByteCount: Int64(file.size), countStyle: .file)).font(.caption)
                Button { vm.removeAttachment(file.id) } label: { Image(systemName: "xmark.circle") }
                  .accessibilityLabel("Quitar \(file.fileName)")
                  .disabled(vm.isSubmitting)
              }
            }
            if vm.isPreparingMedia {
              ProgressView("Preparando archivos…")
            }
            if vm.isSubmitting {
              ProgressView(value: vm.uploadProgress)
                .accessibilityLabel("Progreso de publicación")
            }

            if let error = vm.errorMessage {
              Text(error)
                .font(.footnote)
                .foregroundStyle(.red)
            }

            if let info = vm.infoMessage {
              Text(info)
                .font(.footnote)
                .foregroundStyle(VinctusTokens.Color.accent)
            }

            VStack(spacing: VinctusTokens.Spacing.sm) {
              VButton("Publicar ahora") {
                vm.submit()
              }
              .disabled(!vm.canSubmit)

              if vm.canRetryPendingSubmission {
                VButton("Reintentar envío", variant: .secondary) {
                  vm.retryPendingSubmission()
                }
              }
            }
          }
        }
      }
      .padding(VinctusTokens.Spacing.lg)
    }
    .background(SwiftUI.Color(uiColor: .systemGroupedBackground).ignoresSafeArea())
    .navigationTitle("Crear")
    .vinctusLoading(vm.isSubmitting)
    .task { await vm.restoreDraft() }
    .onChange(of: scenePhase) { _, phase in if phase != .active { Task { await vm.flushDraft() } } }
    .onDisappear { Task { await vm.flushDraft() } }
    .confirmationDialog("¿Descartar este borrador y sus adjuntos guardados en este dispositivo?", isPresented: $confirmingDiscard) {
      Button("Descartar", role: .destructive) { Task { await vm.discardDraft() } }
      Button("Cancelar", role: .cancel) {}
    }
    .task(id: selectedPhotos) {
      guard !selectedPhotos.isEmpty else { return }
      await vm.preparePhotos(selectedPhotos)
      selectedPhotos = []
    }
    .fileImporter(isPresented: $importingDocuments, allowedContentTypes: [.data], allowsMultipleSelection: true) { result in
      switch result {
      case .success(let urls): Task { await vm.importDocuments(urls) }
      case .failure(let error): vm.errorMessage = error.localizedDescription
      }
    }
  }
}

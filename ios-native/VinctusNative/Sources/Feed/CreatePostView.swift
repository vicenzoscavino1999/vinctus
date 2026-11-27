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

  init(repo: CreatePostRepo, groupID: String? = nil, categoryID: String? = nil) {
    self.groupID = groupID
    let uid = !AppRepos.isDemo && FirebaseApp.app() != nil && Auth.auth().currentUser?.isAnonymous == false ? Auth.auth().currentUser?.uid : nil
    let session = uid.map { PostDraftSession(uid: $0, groupID: groupID) }
    _vm = StateObject(wrappedValue: CreatePostViewModel(repo: repo, groupID: groupID, categoryID: categoryID, draftSession: session,
      currentUserID: { FirebaseApp.app() != nil ? Auth.auth().currentUser?.uid : nil }))
  }

  private let groupID: String?
  @State private var showsYouTubeField = false
  @ObservedObject private var groupNames = GroupNames.shared

  private var showsYouTube: Bool { showsYouTubeField || !vm.youtubeURL.isEmpty }
  private var titleLimit: Int { 120 }
  private var mediaLocked: Bool {
    vm.isSubmitting || vm.isPreparingMedia || !vm.draftLoaded || vm.attachments.count >= 10
  }

  private var draftStatus: String {
    if !vm.supportsDraftRecovery { return "Borrador temporal" }
    if vm.draftSaveError != nil { return "Borrador pendiente de recuperar o guardar" }
    if vm.isRestoringDraft { return "Recuperando borrador…" }
    if vm.isDraftSaving { return "Guardando borrador…" }
    return "Borrador guardado en este dispositivo"
  }

  /// Like the web's composer: where it goes, the title and the text without boxes, the
  /// attachments, then the draft status and one toolbar with Publicar.
  var body: some View {
    VStack(spacing: 0) {
      ScrollView {
        VStack(alignment: .leading, spacing: VinctusTokens.Spacing.md) {
          Label(
            groupID == nil
              ? "Se publicará en tu perfil"
              : "Se publicará en \(groupNames.name(for: groupID) ?? "el grupo")",
            systemImage: groupID == nil ? "person.crop.circle" : "person.2"
          )
          .font(.footnote)
          .foregroundStyle(VinctusTokens.Color.textMuted)

          TextField("Título (opcional)", text: $vm.draftTitle, axis: .vertical)
            .font(VinctusTokens.Typography.serif(24))
            .foregroundStyle(VinctusTokens.Color.textPrimary)
            .disabled(vm.isSubmitting || !vm.draftLoaded)
          if vm.draftTitle.count >= titleLimit * 8 / 10 {
            Text("\(vm.draftTitle.count)/\(titleLimit)")
              .font(.caption.monospacedDigit())
              .foregroundStyle(vm.draftTitle.count > titleLimit ? .red : VinctusTokens.Color.textMuted)
              .frame(maxWidth: .infinity, alignment: .trailing)
          }

          ZStack(alignment: .topLeading) {
            if vm.draftText.isEmpty {
              Text("¿Qué quieres compartir?")
                .font(.body)
                .foregroundStyle(VinctusTokens.Color.textMuted)
                .padding(.top, 8)
                .padding(.leading, 5)
            }
            TextEditor(text: $vm.draftText)
              .font(.body)
              .scrollContentBackground(.hidden)
              .disabled(!vm.draftLoaded || vm.isDiscardingDraft)
              .frame(minHeight: 180)
              .onChange(of: vm.draftText) { _, _ in
                vm.clearFeedbackIfNeeded()
              }
              .accessibilityLabel("Texto de la publicación")
          }
          if vm.remainingCharacters < vm.characterLimit / 5 {
            Text("\(vm.remainingCharacters)")
              .font(.caption.monospacedDigit())
              .foregroundStyle(vm.remainingCharacters < 0 ? .red : VinctusTokens.Color.textMuted)
              .frame(maxWidth: .infinity, alignment: .trailing)
          }

          if showsYouTube {
            HStack(spacing: 10) {
              Image(systemName: "link")
                .foregroundStyle(VinctusTokens.Color.textMuted)
              TextField("Pega un enlace de YouTube", text: $vm.youtubeURL)
                .keyboardType(.URL)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .disabled(vm.isSubmitting || !vm.draftLoaded)
                .accessibilityLabel("Enlace de YouTube (opcional)")
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 11)
            .overlay(Capsule().stroke(VinctusTokens.Color.border.opacity(0.7), lineWidth: 1))
          }

          ForEach(vm.attachments) { file in
            HStack(spacing: 10) {
              Image(systemName: file.kind == .image ? "photo" : file.kind == .video ? "video" : "doc")
                .foregroundStyle(VinctusTokens.Color.accent.opacity(0.85))
              Text(file.fileName)
                .font(.subheadline)
                .foregroundStyle(VinctusTokens.Color.textPrimary)
                .lineLimit(1)
              Spacer()
              Text(ByteCountFormatter.string(fromByteCount: Int64(file.size), countStyle: .file))
                .font(.caption)
                .foregroundStyle(VinctusTokens.Color.textMuted)
              Button { vm.removeAttachment(file.id) } label: {
                Image(systemName: "xmark.circle.fill")
                  .foregroundStyle(VinctusTokens.Color.textMuted)
              }
              .buttonStyle(.borderless)
              .accessibilityLabel("Quitar \(file.fileName)")
              .disabled(vm.isSubmitting)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 11)
            .background(VinctusTokens.Color.surface, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
          }

          if vm.isPreparingMedia {
            ProgressView("Preparando archivos…")
              .font(.footnote)
          }
          if vm.isSubmitting {
            ProgressView(value: vm.uploadProgress)
              .tint(VinctusTokens.Color.accent)
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
        }
        .padding(.horizontal, 20)
        .padding(.vertical, VinctusTokens.Spacing.md)
      }

      footer
    }
    .background(VinctusTokens.Color.background.ignoresSafeArea())
    .navigationTitle("Crear publicación")
    .navigationBarTitleDisplayMode(.inline)
    .vinctusLoading(vm.isSubmitting)
    .task { await vm.restoreDraft() }
    .task(id: groupID) {
      if let groupID { await groupNames.load(groupID) }
    }
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

  private var footer: some View {
    VStack(alignment: .leading, spacing: 8) {
      HStack(spacing: 12) {
        Text(draftStatus)
          .font(.caption)
          .foregroundStyle(VinctusTokens.Color.textMuted)
        Button("Descartar") { confirmingDiscard = true }
          .font(.caption.weight(.medium))
          .foregroundStyle(VinctusTokens.Color.textSecondary)
          .disabled(vm.isSubmitting || vm.isPreparingMedia || !vm.draftLoaded)
          .accessibilityLabel("Descartar borrador")
        Spacer()
        if !vm.attachments.isEmpty {
          Text("\(vm.attachments.count)/10")
            .font(.caption.monospacedDigit())
            .foregroundStyle(VinctusTokens.Color.textMuted)
        }
      }
      if let error = vm.draftSaveError {
        HStack(spacing: 8) {
          Text(error)
            .font(.caption)
            .foregroundStyle(.red)
          Button("Reintentar guardado") { Task { await vm.retryDraftSave() } }
            .font(.caption.weight(.semibold))
        }
      }

      HStack(spacing: 6) {
        PhotosPicker(selection: $selectedPhotos, maxSelectionCount: max(1, 10 - vm.attachments.count),
          matching: .any(of: [.images, .videos]), preferredItemEncoding: .compatible) {
          toolIcon("photo.on.rectangle")
        }
        .accessibilityLabel("Fotos o videos")
        .disabled(mediaLocked)

        Button { importingDocuments = true } label: { toolIcon("doc") }
          .accessibilityLabel("Documentos")
          .disabled(mediaLocked)

        Button { showsYouTubeField = true } label: { toolIcon("play.rectangle") }
          .accessibilityLabel("Enlace de YouTube")
          .disabled(vm.isSubmitting || !vm.draftLoaded)

        Spacer()

        if vm.canRetryPendingSubmission {
          Button("Reintentar envío") { vm.retryPendingSubmission() }
            .font(.subheadline.weight(.medium))
            .foregroundStyle(VinctusTokens.Color.textSecondary)
        }
        Button {
          vm.submit()
        } label: {
          Text("Publicar")
            .font(.subheadline.weight(.semibold))
            .padding(.horizontal, 20)
            .padding(.vertical, 9)
            .foregroundStyle(.black)
            .background(VinctusTokens.Color.accent.opacity(vm.canSubmit ? 1 : 0.4), in: Capsule())
        }
        .buttonStyle(.plain)
        .disabled(!vm.canSubmit)
      }
    }
    .padding(.horizontal, 16)
    .padding(.top, 10)
    .padding(.bottom, 10)
    .background(VinctusTokens.Color.background)
    .overlay(alignment: .top) {
      Rectangle()
        .fill(VinctusTokens.Color.border.opacity(0.5))
        .frame(height: 0.5)
    }
  }

  private func toolIcon(_ name: String) -> some View {
    Image(systemName: name)
      .font(.title3)
      .foregroundStyle(VinctusTokens.Color.textSecondary)
      .frame(width: 40, height: 40)
      .contentShape(Rectangle())
  }
}

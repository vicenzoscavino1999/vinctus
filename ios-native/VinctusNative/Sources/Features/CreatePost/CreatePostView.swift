import PhotosUI
import SwiftUI
import UIKit
import UniformTypeIdentifiers

private enum CreatePostFocusField: Hashable {
  case title
  case description
  case link
}

struct CreatePostView: View {
  @Environment(\.dismiss) private var dismiss
  @EnvironmentObject private var authVM: AuthViewModel
  @StateObject private var vm: CreatePostViewModel
  @State private var photoSelections: [PhotosPickerItem] = []
  @State private var videoSelections: [PhotosPickerItem] = []
  @State private var isCameraPresented = false
  @State private var isFileImporterPresented = false
  @FocusState private var focusedField: CreatePostFocusField?
  private let onPublished: ((String) -> Void)?

  init(repo: CreatePostRepo, onPublished: ((String) -> Void)? = nil) {
    self.onPublished = onPublished
    _vm = StateObject(wrappedValue: CreatePostViewModel(repo: repo))
  }

  var body: some View {
    ZStack {
      VinctusTokens.Color.background
        .ignoresSafeArea()

      ScrollView(showsIndicators: false) {
        VStack(spacing: 0) {
          VStack(alignment: .leading, spacing: 14) {
            headerRow
            Divider()
              .overlay(VinctusTokens.Color.border.opacity(0.35))
            authorSummaryRow
            titleInput
            descriptionInput
            youtubeInput
            mediaComposer
            submissionStatus
            actionButtons
          }
          .padding(14)
          .background(VinctusTokens.Color.surface.opacity(0.98))
          .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
          .overlay(
            RoundedRectangle(cornerRadius: 24, style: .continuous)
              .stroke(VinctusTokens.Color.border.opacity(0.45), lineWidth: 1)
          )
        }
        .padding(.horizontal, 12)
        .padding(.top, 14)
        .padding(.bottom, 28)
      }
    }
    .simultaneousGesture(TapGesture().onEnded { focusedField = nil })
    .toolbar(.hidden, for: .navigationBar)
    .onChange(of: vm.lastPublishedPostID) { _, postID in
      guard let postID else { return }
      onPublished?(postID)
    }
    .onChange(of: photoSelections) { _, newValue in
      guard !newValue.isEmpty else { return }
      Task {
        await importSelectedPhotos(newValue)
        await MainActor.run {
          photoSelections = []
        }
      }
    }
    .onChange(of: videoSelections) { _, newValue in
      guard !newValue.isEmpty else { return }
      Task {
        await importSelectedVideos(newValue)
        await MainActor.run {
          videoSelections = []
        }
      }
    }
    .onChange(of: vm.draftText) { _, _ in
      vm.clearFeedbackIfNeeded()
    }
    .onChange(of: vm.draftYouTubeURL) { _, _ in
      vm.clearFeedbackIfNeeded()
    }
    .sheet(isPresented: $isCameraPresented) {
      CameraImagePicker(isPresented: $isCameraPresented) { image in
        vm.addImageAttachment(image, sourceFileName: "camera_\(Int(Date().timeIntervalSince1970)).jpg")
      }
    }
    .fileImporter(
      isPresented: $isFileImporterPresented,
      allowedContentTypes: [.content, .data],
      allowsMultipleSelection: true
    ) { result in
      switch result {
      case .success(let urls):
        guard !urls.isEmpty else { return }
        Task {
          await importSelectedFiles(urls)
        }
      case .failure:
        vm.errorMessage = "No se pudo seleccionar el archivo."
      }
    }
  }

  private var headerRow: some View {
    CreatePostHeaderRow {
      dismiss()
    }
  }

  private var authorSummaryRow: some View {
    CreatePostAuthorSummaryRow(
      displayName: authVM.currentUserDisplayName,
      email: authVM.currentUserEmail ?? "sin-email@vinctus.app",
      authorInitial: authorInitial
    )
  }

  private var draftTitleBinding: Binding<String> {
    Binding(
      get: { vm.draftTitle },
      set: { vm.updateDraftTitle($0) }
    )
  }

  private var titleInput: some View {
    VStack(alignment: .leading, spacing: 6) {
      Text("TITULO (OPCIONAL)")
        .font(.system(size: 11, weight: .semibold))
        .tracking(2)
        .foregroundStyle(VinctusTokens.Color.textMuted)

      TextField("Escribe un titulo breve", text: draftTitleBinding)
        .font(.system(size: 16, weight: .regular))
        .foregroundColor(VinctusTokens.Color.textPrimary)
        .padding(.horizontal, 11)
        .padding(.vertical, 10)
        .background(VinctusTokens.Color.surface2)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(
          RoundedRectangle(cornerRadius: 12, style: .continuous)
            .stroke(VinctusTokens.Color.border.opacity(0.42), lineWidth: 1)
        )
        .focused($focusedField, equals: .title)
        .disabled(vm.isSubmitting)

      HStack {
        Spacer()
        Text("\(vm.titleCount)/\(vm.titleCharacterLimit)")
          .font(.caption2.monospacedDigit())
          .foregroundStyle(vm.remainingTitleCharacters < 0 ? .red : VinctusTokens.Color.textMuted)
      }
    }
  }

  private var descriptionInput: some View {
    VStack(alignment: .leading, spacing: 6) {
      ZStack(alignment: .topLeading) {
        if vm.draftText.isEmpty {
          Text("Escribe la descripcion de tu publicacion")
            .font(.system(size: 15, weight: .regular))
            .foregroundStyle(VinctusTokens.Color.textMuted.opacity(0.9))
            .padding(.top, 4)
            .allowsHitTesting(false)
        }

        TextEditor(text: $vm.draftText)
          .font(.system(size: 15, weight: .regular))
          .foregroundStyle(VinctusTokens.Color.textPrimary)
          .frame(minHeight: 130)
          .scrollContentBackground(.hidden)
          .padding(.horizontal, -4)
          .padding(.vertical, -2)
          .focused($focusedField, equals: .description)
          .disabled(vm.isSubmitting)
      }

      HStack {
        Spacer()
        Text("\(vm.characterCount)/\(vm.characterLimit)")
          .font(.caption2.monospacedDigit())
          .foregroundStyle(vm.remainingCharacters < 0 ? .red : VinctusTokens.Color.textMuted)
      }
    }
  }

  private var youtubeInput: some View {
    VStack(alignment: .leading, spacing: 6) {
      Text("LINK DE YOUTUBE (OPCIONAL)")
        .font(.system(size: 11, weight: .semibold))
        .tracking(2)
        .foregroundStyle(VinctusTokens.Color.textMuted)

      HStack(spacing: 10) {
        Image(systemName: "link")
          .font(.footnote.weight(.semibold))
          .foregroundStyle(VinctusTokens.Color.textMuted)

        TextField("https://www.youtube.com/watch?v=...", text: $vm.draftYouTubeURL)
          .font(.system(size: 15, weight: .regular))
          .foregroundColor(VinctusTokens.Color.textPrimary)
          .autocapitalization(.none)
          .textInputAutocapitalization(.never)
          .disableAutocorrection(true)
          .focused($focusedField, equals: .link)
          .disabled(vm.isSubmitting)
      }
      .padding(.horizontal, 11)
      .padding(.vertical, 10)
      .background(VinctusTokens.Color.surface2)
      .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
      .overlay(
        RoundedRectangle(cornerRadius: 12, style: .continuous)
          .stroke(VinctusTokens.Color.border.opacity(0.42), lineWidth: 1)
      )
    }
  }

  @ViewBuilder
  private var submissionStatus: some View {
    CreatePostSubmissionStatusView(
      uploadProgress: vm.uploadProgress,
      isSubmitting: vm.isSubmitting,
      errorMessage: vm.errorMessage,
      infoMessage: vm.infoMessage
    )
  }

  @ViewBuilder
  private var actionButtons: some View {
    CreatePostActionButtons(
      isSubmitting: vm.isSubmitting,
      canSubmit: vm.canSubmit,
      canRetryPendingSubmission: vm.canRetryPendingSubmission,
      canCancelSubmission: vm.canCancelSubmission,
      onSubmit: {
        focusedField = nil
        vm.submit()
      },
      onRetry: { vm.retryPendingSubmission() },
      onCancel: { vm.cancelSubmission() }
    )
  }

  @ViewBuilder
  private var mediaComposer: some View {
    CreatePostMediaComposer(
      photoSelections: $photoSelections,
      videoSelections: $videoSelections,
      attachments: vm.attachments,
      remainingAttachmentSlots: vm.remainingAttachmentSlots,
      maxAttachmentCount: vm.maxAttachmentCount,
      canAddMoreAttachments: vm.canAddMoreAttachments,
      canUseCamera: vm.canUseCamera,
      isSubmitting: vm.isSubmitting,
      onTapFiles: {
        isFileImporterPresented = true
      },
      onTapCamera: {
        isCameraPresented = true
      },
      onRemoveAttachment: { id in
        vm.removeAttachment(id: id)
      }
    )
  }

  private var authorInitial: String {
    let firstCharacter = authVM.currentUserDisplayName.trimmingCharacters(in: .whitespacesAndNewlines).first
    return firstCharacter.map { String($0).uppercased() } ?? "V"
  }

  private func importSelectedPhotos(_ items: [PhotosPickerItem]) async {
    for item in items.prefix(vm.remainingAttachmentSlots) {
      if Task.isCancelled { return }
      do {
        guard let data = try await item.loadTransferable(type: Data.self) else { continue }
        guard let image = UIImage(data: data) else { continue }
        await MainActor.run {
          vm.addImageAttachment(image)
        }
      } catch {
        await MainActor.run {
          vm.errorMessage = "No se pudo cargar una imagen seleccionada."
        }
      }
    }
  }

  private func importSelectedVideos(_ items: [PhotosPickerItem]) async {
    for (offset, item) in items.prefix(vm.remainingAttachmentSlots).enumerated() {
      if Task.isCancelled { return }
      do {
        guard let data = try await item.loadTransferable(type: Data.self) else { continue }
        let mediaType = item.supportedContentTypes.first(where: { type in
          type.conforms(to: .movie) || type.conforms(to: .video)
        }) ?? item.supportedContentTypes.first

        let mimeType = mediaType?.preferredMIMEType ?? "video/mp4"
        let fileExtension = mediaType?.preferredFilenameExtension ?? "mp4"
        let fileName = "video_\(Int(Date().timeIntervalSince1970))_\(offset).\(fileExtension)"

        await MainActor.run {
          vm.addVideoAttachment(
            data: data,
            sourceFileName: fileName,
            contentType: mimeType
          )
        }
      } catch {
        await MainActor.run {
          vm.errorMessage = "No se pudo cargar un video seleccionado."
        }
      }
    }
  }

  private func importSelectedFiles(_ urls: [URL]) async {
    for url in urls.prefix(vm.remainingAttachmentSlots) {
      if Task.isCancelled { return }

      let accessGranted = url.startAccessingSecurityScopedResource()
      defer {
        if accessGranted {
          url.stopAccessingSecurityScopedResource()
        }
      }

      do {
        let data = try Data(contentsOf: url)
        let fileName = url.lastPathComponent.isEmpty
          ? "archivo_\(Int(Date().timeIntervalSince1970)).bin"
          : url.lastPathComponent
        let contentType = UTType(filenameExtension: url.pathExtension)?.preferredMIMEType ?? "application/octet-stream"

        await MainActor.run {
          vm.addFileAttachment(
            data: data,
            sourceFileName: fileName,
            contentType: contentType
          )
        }
      } catch {
        await MainActor.run {
          vm.errorMessage = "No se pudo cargar un archivo seleccionado."
        }
      }
    }
  }
}

private struct CameraImagePicker: UIViewControllerRepresentable {
  @Binding var isPresented: Bool
  let onImagePicked: (UIImage) -> Void

  final class Coordinator: NSObject, UINavigationControllerDelegate, UIImagePickerControllerDelegate {
    let parent: CameraImagePicker

    init(parent: CameraImagePicker) {
      self.parent = parent
    }

    func imagePickerControllerDidCancel(_: UIImagePickerController) {
      parent.isPresented = false
    }

    func imagePickerController(
      _: UIImagePickerController,
      didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]
    ) {
      if let image = info[.originalImage] as? UIImage {
        parent.onImagePicked(image)
      }
      parent.isPresented = false
    }
  }

  func makeCoordinator() -> Coordinator {
    Coordinator(parent: self)
  }

  func makeUIViewController(context: Context) -> UIImagePickerController {
    let picker = UIImagePickerController()
    picker.delegate = context.coordinator
    picker.sourceType = .camera
    picker.cameraCaptureMode = .photo
    return picker
  }

  func updateUIViewController(_: UIImagePickerController, context _: Context) {}
}

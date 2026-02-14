import Foundation
import UIKit

struct CreatePostDraftAttachment: Identifiable {
  let id = UUID()
  let previewImage: UIImage
  let media: CreatePostMediaUpload
}

@MainActor
final class CreatePostViewModel: ObservableObject {
  @Published var draftTitle = ""
  @Published var draftText = ""
  @Published var draftYouTubeURL = ""
  @Published private(set) var isSubmitting = false
  @Published var errorMessage: String?
  @Published var infoMessage: String?
  @Published private(set) var lastPublishedPostID: String?
  @Published private(set) var pendingPostID: String?
  @Published private(set) var attachments: [CreatePostDraftAttachment] = []
  @Published private(set) var uploadProgress: Double?

  private let repo: CreatePostRepo
  private var pendingDraftText: String?
  private var pendingMediaFingerprint: String?
  private var lastPublishedDraftText: String?
  private var lastPublishedMediaFingerprint: String?
  private var lastPublishedAt: Date?
  private let duplicateWindow: TimeInterval = 25
  private let imageCompressionLimitBytes = 10 * 1024 * 1024
  private let videoSizeLimitBytes = 100 * 1024 * 1024
  private let fileSizeLimitBytes = 25 * 1024 * 1024
  private var submissionTask: Task<Void, Never>?

  init(repo: CreatePostRepo) {
    self.repo = repo
  }

  var characterLimit: Int { 5000 }
  var titleCharacterLimit: Int { 120 }
  var maxAttachmentCount: Int { 10 }
  var canUseCamera: Bool { UIImagePickerController.isSourceTypeAvailable(.camera) }

  var titleCount: Int {
    FirestoreHelpers.normalizedSingleLineText(draftTitle).count
  }

  var remainingTitleCharacters: Int {
    titleCharacterLimit - titleCount
  }

  var characterCount: Int {
    normalizedComposedDraft.count
  }

  var remainingCharacters: Int {
    characterLimit - characterCount
  }

  var remainingAttachmentSlots: Int {
    max(0, maxAttachmentCount - attachments.count)
  }

  var canAddMoreAttachments: Bool {
    !isSubmitting && attachments.count < maxAttachmentCount
  }

  var canSubmit: Bool {
    !isSubmitting
      && characterCount > 0
      && remainingCharacters >= 0
      && remainingTitleCharacters >= 0
  }

  var canRetryPendingSubmission: Bool {
    !isSubmitting
      && pendingPostID != nil
      && pendingDraftText == normalizedComposedDraft
      && pendingMediaFingerprint == currentMediaFingerprint
  }

  var canCancelSubmission: Bool {
    isSubmitting
  }

  func submit() {
    publish(allowDuplicateCooldownBypass: false)
  }

  func retryPendingSubmission() {
    publish(allowDuplicateCooldownBypass: true)
  }

  func cancelSubmission() {
    guard isSubmitting else { return }
    submissionTask?.cancel()
  }

  func clearFeedbackIfNeeded() {
    let currentDraft = normalizedComposedDraft
    if pendingDraftText != currentDraft || pendingMediaFingerprint != currentMediaFingerprint {
      errorMessage = nil
      infoMessage = nil
    }
  }

  func updateDraftTitle(_ value: String) {
    let limitedValue: String
    if value.count > titleCharacterLimit {
      limitedValue = String(value.prefix(titleCharacterLimit))
    } else {
      limitedValue = value
    }

    if draftTitle != limitedValue {
      draftTitle = limitedValue
    }
    clearFeedbackIfNeeded()
  }

  func addImageAttachment(_ image: UIImage, sourceFileName: String? = nil) {
    guard canAddMoreAttachments else {
      infoMessage = "Solo puedes adjuntar hasta \(maxAttachmentCount) imagenes."
      return
    }

    guard let compressed = CreatePostMediaProcessor.compressedImagePayload(
      from: image,
      maxBytes: imageCompressionLimitBytes
    ) else {
      errorMessage = "No se pudo preparar la imagen. Intenta con otra."
      return
    }

    let generatedName = sourceFileName ?? "photo_\(Int(Date().timeIntervalSince1970)).jpg"
    let media = CreatePostMediaUpload(
      data: compressed.data,
      kind: .image,
      contentType: "image/jpeg",
      fileName: CreatePostMediaProcessor.sanitizedFileName(generatedName),
      width: compressed.width,
      height: compressed.height
    )

    attachments.append(
      CreatePostDraftAttachment(
        previewImage: compressed.preview,
        media: media
      )
    )
    clearFeedbackIfNeeded()
  }

  func addVideoAttachment(data: Data, sourceFileName: String? = nil, contentType: String? = nil) {
    guard canAddMoreAttachments else {
      infoMessage = "Solo puedes adjuntar hasta \(maxAttachmentCount) archivos."
      return
    }

    guard !data.isEmpty else {
      errorMessage = "No se pudo leer el video seleccionado."
      return
    }

    guard data.count < videoSizeLimitBytes else {
      errorMessage = "El video supera el limite de 100 MB."
      return
    }

    let safeFileName = CreatePostMediaProcessor.sanitizedFileName(
      sourceFileName ?? "video_\(Int(Date().timeIntervalSince1970)).mp4"
    )
    let safeContentType = (contentType?.hasPrefix("video/") == true) ? (contentType ?? "video/mp4") : "video/mp4"

    let media = CreatePostMediaUpload(
      data: data,
      kind: .video,
      contentType: safeContentType,
      fileName: safeFileName,
      width: nil,
      height: nil
    )

    attachments.append(
      CreatePostDraftAttachment(
        previewImage: placeholderPreviewImage(systemName: "video.fill"),
        media: media
      )
    )
    clearFeedbackIfNeeded()
  }

  func addFileAttachment(data: Data, sourceFileName: String, contentType: String?) {
    guard canAddMoreAttachments else {
      infoMessage = "Solo puedes adjuntar hasta \(maxAttachmentCount) archivos."
      return
    }

    guard !data.isEmpty else {
      errorMessage = "No se pudo leer el archivo seleccionado."
      return
    }

    guard data.count < fileSizeLimitBytes else {
      errorMessage = "El archivo supera el limite de 25 MB."
      return
    }

    let safeFileName = CreatePostMediaProcessor.sanitizedFileName(sourceFileName)
    let safeContentType = (contentType?.hasPrefix("application/") == true)
      ? (contentType ?? "application/octet-stream")
      : "application/octet-stream"

    let media = CreatePostMediaUpload(
      data: data,
      kind: .file,
      contentType: safeContentType,
      fileName: safeFileName,
      width: nil,
      height: nil
    )

    attachments.append(
      CreatePostDraftAttachment(
        previewImage: placeholderPreviewImage(systemName: "doc.fill"),
        media: media
      )
    )
    clearFeedbackIfNeeded()
  }

  func removeAttachment(id: UUID) {
    attachments.removeAll { $0.id == id }
    clearFeedbackIfNeeded()
  }

  private var currentMediaFingerprint: String {
    CreatePostDraftComposer.mediaFingerprint(attachments.map(\.media))
  }

  private func placeholderPreviewImage(systemName: String) -> UIImage {
    let canvasSize = CGSize(width: 220, height: 220)
    let renderer = UIGraphicsImageRenderer(size: canvasSize)
    return renderer.image { context in
      UIColor(white: 0.12, alpha: 1).setFill()
      context.fill(CGRect(origin: .zero, size: canvasSize))

      guard
        let icon = UIImage(systemName: systemName)?
          .withTintColor(.white.withAlphaComponent(0.78), renderingMode: .alwaysOriginal)
      else {
        return
      }

      let iconSize = CGSize(width: 58, height: 58)
      let iconOrigin = CGPoint(
        x: (canvasSize.width - iconSize.width) / 2,
        y: (canvasSize.height - iconSize.height) / 2
      )
      icon.draw(in: CGRect(origin: iconOrigin, size: iconSize))
    }
  }

  private func publish(allowDuplicateCooldownBypass: Bool) {
    guard !isSubmitting else { return }

    errorMessage = nil
    infoMessage = nil
    uploadProgress = nil
    lastPublishedPostID = nil

    let normalizedDraft = normalizedComposedDraft
    guard !normalizedDraft.isEmpty else {
      errorMessage = "Escribe algo antes de publicar."
      return
    }
    guard normalizedDraft.count <= characterLimit else {
      errorMessage = "El texto supera el limite de \(characterLimit) caracteres."
      return
    }

    let mediaToUpload = attachments.map(\.media)
    let mediaFingerprint = CreatePostDraftComposer.mediaFingerprint(mediaToUpload)

    if !allowDuplicateCooldownBypass, CreatePostDraftComposer.isLikelyDuplicate(
      .init(
        draft: normalizedDraft,
        mediaFingerprint: mediaFingerprint,
        lastPublishedDraftText: lastPublishedDraftText,
        lastPublishedMediaFingerprint: lastPublishedMediaFingerprint,
        lastPublishedAt: lastPublishedAt,
        duplicateWindow: duplicateWindow
      )
    ) {
      infoMessage = "Este contenido ya se publico hace unos segundos."
      return
    }

    let postID: String
    do {
      if
        let pendingPostID,
        pendingDraftText == normalizedDraft,
        pendingMediaFingerprint == mediaFingerprint {
        postID = pendingPostID
      } else {
        postID = try repo.makePostID()
        pendingPostID = postID
        pendingDraftText = normalizedDraft
        pendingMediaFingerprint = mediaFingerprint
      }
    } catch {
      errorMessage = error.localizedDescription
      return
    }

    isSubmitting = true
    uploadProgress = mediaToUpload.isEmpty ? nil : 0
    AppLog.posts.info("createPost.submit.start")

    submissionTask?.cancel()
    submissionTask = Task { @MainActor [weak self] in
      guard let self else { return }
      defer {
        self.isSubmitting = false
        self.submissionTask = nil
        self.uploadProgress = nil
      }

      do {
        try await self.repo.publishTextPost(
          text: normalizedDraft,
          postID: postID,
          media: mediaToUpload,
          onProgress: { [weak self] progress in
            Task { @MainActor in
              self?.uploadProgress = min(max(progress, 0), 1)
            }
          }
        )

        AppLog.posts.info("createPost.submit.success postID=\(postID, privacy: .private)")
        self.pendingPostID = nil
        self.pendingDraftText = nil
        self.pendingMediaFingerprint = nil
        self.lastPublishedDraftText = normalizedDraft
        self.lastPublishedMediaFingerprint = mediaFingerprint
        self.lastPublishedAt = Date()
        self.lastPublishedPostID = postID
        self.draftTitle = ""
        self.draftText = ""
        self.draftYouTubeURL = ""
        self.attachments = []
        self.infoMessage = "Publicacion enviada."
      } catch {
        if error is CancellationError {
          AppLog.posts.info("createPost.submit.cancelled postID=\(postID, privacy: .private)")
          self.infoMessage = "Envio cancelado. Puedes reintentar."
          return
        }

        AppLog.posts.error(
          "createPost.submit.failed postID=\(postID, privacy: .private) errorType=\(AppLog.errorType(error), privacy: .public)"
        )
        self.errorMessage = error.localizedDescription
      }
    }
  }

  private var normalizedComposedDraft: String {
    CreatePostDraftComposer.composedDraft(
      title: draftTitle,
      body: draftText,
      youtubeURL: draftYouTubeURL
    )
  }
}

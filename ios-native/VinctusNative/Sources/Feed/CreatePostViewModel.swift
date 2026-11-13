import Foundation
import PhotosUI

@MainActor
final class CreatePostViewModel: ObservableObject {
  @Published var draftText = ""
  @Published var draftTitle = ""
  @Published var youtubeURL = ""
  @Published private(set) var attachments: [ChatPendingAttachment] = []
  @Published private(set) var isPreparingMedia = false
  @Published private(set) var uploadProgress = 0.0
  @Published private(set) var isSubmitting = false
  @Published var errorMessage: String?
  @Published var infoMessage: String?
  @Published private(set) var pendingPostID: String?

  private let repo: CreatePostRepo
  private let groupID: String?
  private var pendingDraft: DraftIdentity?
  private var lastPublishedDraft: DraftIdentity?
  private var lastPublishedAt: Date?
  private let duplicateWindow: TimeInterval = 25
  private var submissionGeneration = 0

  init(repo: CreatePostRepo, groupID: String? = nil) {
    self.groupID = groupID
    self.repo = repo
  }

  var characterLimit: Int { Limits.Posts.textMaxLength }

  var characterCount: Int {
    normalizedText(draftText).count
  }

  var remainingCharacters: Int {
    characterLimit - characterCount
  }

  private struct DraftIdentity: Equatable {
    let title: String?
    let text: String
    let fileIDs: [String]
    let youtubeID: String?
  }

  private var draft: NativePostDraft {
    NativePostDraft(title: draftTitle, text: normalizedText(draftText), files: attachments,
      youtubeVideoID: normalizedText(youtubeURL).isEmpty ? nil : YouTubeLink.videoID(from: youtubeURL))
  }

  private var identity: DraftIdentity {
    DraftIdentity(title: draft.normalizedTitle, text: draft.text, fileIDs: attachments.map(\.id), youtubeID: draft.youtubeVideoID)
  }

  var canSubmit: Bool {
    !isSubmitting && !isPreparingMedia && remainingCharacters >= 0
      && draftTitle.count <= Limits.Posts.titleMaxLength
      && (!draft.text.isEmpty || draft.normalizedTitle != nil)
      && (normalizedText(youtubeURL).isEmpty || draft.youtubeVideoID != nil)
      && attachments.count + (draft.youtubeVideoID == nil ? 0 : 1) <= 10
  }

  var canRetryPendingSubmission: Bool {
    !isSubmitting && !isPreparingMedia && pendingPostID != nil && pendingDraft == identity
  }

  func preparePhotos(_ items: [PhotosPickerItem]) async {
    guard !isPreparingMedia, !isSubmitting else { return }
    isPreparingMedia = true
    defer { isPreparingMedia = false }
    for item in items {
      do {
        try Task.checkCancellation()
        guard let file = try await item.loadTransferable(type: PostPickedMedia.self)?.file else { throw PostMediaError.invalidFile }
        try Task.checkCancellation()
        try addAttachment(file)
      } catch is CancellationError { return }
      catch { errorMessage = error.localizedDescription }
    }
  }

  func importDocuments(_ urls: [URL]) async {
    guard !isPreparingMedia, !isSubmitting else { return }
    isPreparingMedia = true
    defer { isPreparingMedia = false }
    for url in urls {
      do {
        try Task.checkCancellation()
        let file = try await Task.detached { try PostFiles.copy(from: url, movie: false) }.value
        try Task.checkCancellation()
        try addAttachment(file)
      } catch is CancellationError { return }
      catch { errorMessage = error.localizedDescription }
    }
  }

  func addAttachment(_ file: ChatPendingAttachment) throws {
    guard attachments.count + (draft.youtubeVideoID == nil ? 0 : 1) < 10 else { throw PostMediaError.tooManyFiles }
    try PostFiles.validate(contentType: file.contentType, size: file.size)
    attachments.append(file)
  }

  func removeAttachment(_ id: String) {
    guard !isSubmitting else { return }
    attachments.removeAll { $0.id == id }
  }

  @discardableResult
  func submit() -> Task<Void, Never>? {
    publish(allowDuplicateCooldownBypass: false)
  }

  @discardableResult
  func retryPendingSubmission() -> Task<Void, Never>? {
    publish(allowDuplicateCooldownBypass: true)
  }

  func clearFeedbackIfNeeded() {
    if pendingDraft != identity {
      errorMessage = nil
      infoMessage = nil
    }
  }

  private func publish(allowDuplicateCooldownBypass: Bool) -> Task<Void, Never>? {
    guard !isSubmitting, !isPreparingMedia else { return nil }

    errorMessage = nil
    infoMessage = nil

    let capturedDraft = draft
    let draftIdentity = identity
    do {
      if !normalizedText(youtubeURL).isEmpty && capturedDraft.youtubeVideoID == nil { throw PostMediaError.invalidYouTube }
      try capturedDraft.validate()
    } catch {
      errorMessage = error.localizedDescription
      return nil
    }
    if !allowDuplicateCooldownBypass, isLikelyDuplicate(draft: draftIdentity) {
      infoMessage = "Esta publicación ya se envió hace unos segundos."
      return nil
    }

    let postID: String
    do {
      if let pendingPostID, pendingDraft == draftIdentity {
        postID = pendingPostID
      } else {
        postID = try repo.makePostID()
        pendingPostID = postID
        pendingDraft = draftIdentity
      }
    } catch {
      errorMessage = error.localizedDescription
      return nil
    }

    isSubmitting = true
    submissionGeneration += 1
    let generation = submissionGeneration
    uploadProgress = 0
    AppLog.posts.info("createPost.submit.start")

    return Task {
      do {
        try await repo.publishPost(capturedDraft, postID: postID, groupID: groupID) { fraction in
          Task { @MainActor in
            if self.isSubmitting, self.submissionGeneration == generation { self.uploadProgress = fraction }
          }
        }
        AppLog.posts.info("createPost.submit.success postID=\(postID, privacy: .private)")

        pendingPostID = nil
        pendingDraft = nil
        lastPublishedDraft = draftIdentity
        lastPublishedAt = Date()
        if identity == draftIdentity {
          draftText = ""; draftTitle = ""; youtubeURL = ""; attachments = []
        }
        infoMessage = "Publicación enviada."
        isSubmitting = false
      } catch {
        AppLog.posts.error(
          "createPost.submit.failed postID=\(postID, privacy: .private) errorType=\(AppLog.errorType(error), privacy: .public)"
        )
        errorMessage = error.localizedDescription
        isSubmitting = false
      }
    }
  }

  private func isLikelyDuplicate(draft: DraftIdentity) -> Bool {
    guard
      let lastPublishedDraft,
      let lastPublishedAt
    else {
      return false
    }

    guard draft == lastPublishedDraft else { return false }
    return Date().timeIntervalSince(lastPublishedAt) < duplicateWindow
  }

  private func normalizedText(_ value: String) -> String {
    value.trimmingCharacters(in: .whitespacesAndNewlines)
  }
}

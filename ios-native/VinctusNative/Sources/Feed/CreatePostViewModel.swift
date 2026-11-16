import Foundation
import PhotosUI
import SwiftUI

extension Notification.Name {
  static let vinctusPostPublished = Notification.Name("vinctus.postPublished")
}

@MainActor
final class CreatePostViewModel: ObservableObject {
  @Published var draftText = "" { didSet { persistDraft() } }
  @Published var draftTitle = "" { didSet { persistDraft() } }
  @Published var youtubeURL = "" { didSet { persistDraft() } }
  @Published private(set) var attachments: [ChatPendingAttachment] = [] { didSet { persistDraft() } }
  @Published private(set) var isRestoringDraft = false
  @Published private(set) var isDraftSaving = false
  @Published private(set) var isDiscardingDraft = false
  @Published private(set) var draftSaveError: String?
  @Published private(set) var draftLoaded = true
  @Published private(set) var isPreparingMedia = false
  @Published private(set) var uploadProgress = 0.0
  @Published private(set) var isSubmitting = false
  @Published var errorMessage: String?
  @Published var infoMessage: String?
  @Published private(set) var pendingPostID: String?

  private let repo: CreatePostRepo
  private let groupID: String?
  private let categoryID: String?
  private var pendingDraft: NativePostDraftIdentity?
  private var lastPublishedDraft: NativePostDraftIdentity?
  private var lastPublishedAt: Date?
  private let duplicateWindow: TimeInterval = 25
  private var submissionGeneration = 0
  private let draftSession: PostDraftSession?
  private let currentUserID: (() -> String?)?
  private var applyingSnapshot = false

  init(
    repo: CreatePostRepo,
    groupID: String? = nil,
    categoryID: String? = nil,
    draftSession: PostDraftSession? = nil,
    currentUserID: (() -> String?)? = nil
  ) {
    self.groupID = groupID
    self.categoryID = categoryID
    self.repo = repo
    self.draftSession = draftSession
    self.currentUserID = currentUserID
    self.draftLoaded = draftSession == nil
    self.isRestoringDraft = draftSession != nil
    draftSession?.onState = { [weak self] saving, error in
      self?.isDraftSaving = saving; self?.draftSaveError = error
    }
  }

  var characterLimit: Int { Limits.Posts.textMaxLength }

  var characterCount: Int {
    normalizedText(draftText).count
  }

  var remainingCharacters: Int {
    characterLimit - characterCount
  }

  private var draft: NativePostDraft {
    NativePostDraft(title: draftTitle, text: normalizedText(draftText), files: attachments,
      youtubeVideoID: normalizedText(youtubeURL).isEmpty ? nil : YouTubeLink.videoID(from: youtubeURL))
  }

  private var identity: NativePostDraftIdentity {
    NativePostDraftIdentity(title: draft.normalizedTitle, text: draft.text, fileIDs: attachments.map(\.id), youtubeID: draft.youtubeVideoID)
  }

  var canSubmit: Bool {
    !isSubmitting && !isPreparingMedia && draftLoaded && !isRestoringDraft && draftSaveError == nil && remainingCharacters >= 0
      && draftTitle.count <= Limits.Posts.titleMaxLength
      && (!draft.text.isEmpty || draft.normalizedTitle != nil)
      && (normalizedText(youtubeURL).isEmpty || draft.youtubeVideoID != nil)
      && attachments.count + (draft.youtubeVideoID == nil ? 0 : 1) <= 10
  }

  var canRetryPendingSubmission: Bool {
    !isSubmitting && !isPreparingMedia && draftLoaded && draftSaveError == nil && pendingPostID != nil && pendingDraft == identity
  }
  var supportsDraftRecovery: Bool { draftSession != nil }

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
    guard !isSubmitting else { return }
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
    guard !isSubmitting, !isPreparingMedia, draftLoaded, !isRestoringDraft else { return nil }

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
    persistDraft()
    AppLog.posts.info("createPost.submit.start")

    return Task {
      var activePostID = postID
      do {
        try await draftSession?.flush()
        if let draftSession, currentUserID?() != draftSession.scope.uid { throw PostDraftStoreError.wrongAccount }
        do {
          try await repo.publishPost(capturedDraft, postID: activePostID, groupID: groupID, categoryID: categoryID) { fraction in
            Task { @MainActor in
              if self.isSubmitting, self.submissionGeneration == generation { self.uploadProgress = fraction }
            }
          }
        } catch CreatePostRepoError.postUploadAbandoned {
          let replacementID = try repo.makePostID()
          activePostID = replacementID
          pendingPostID = replacementID
          pendingDraft = draftIdentity
          uploadProgress = 0
          persistDraft()
          try await draftSession?.flush()
          if let draftSession, currentUserID?() != draftSession.scope.uid { throw PostDraftStoreError.wrongAccount }
          try await repo.publishPost(capturedDraft, postID: replacementID, groupID: groupID, categoryID: categoryID) { fraction in
            Task { @MainActor in
              if self.isSubmitting, self.submissionGeneration == generation { self.uploadProgress = fraction }
            }
          }
        }
        AppLog.posts.info("createPost.submit.success postID=\(activePostID, privacy: .private)")

        applyingSnapshot = true
        pendingPostID = nil
        pendingDraft = nil
        lastPublishedDraft = draftIdentity
        lastPublishedAt = Date()
        if identity == draftIdentity {
          draftText = ""; draftTitle = ""; youtubeURL = ""; attachments = []
        }
        applyingSnapshot = false
        persistDraft()
        // A local-clear failure does not turn a confirmed post into a failed send.
        do { try await draftSession?.flush() }
        catch { draftSaveError = "La publicación se envió, pero no se pudo actualizar el borrador local. Reintenta el guardado." }
        infoMessage = "Publicación enviada."
        isSubmitting = false
        NotificationCenter.default.post(
          name: .vinctusPostPublished,
          object: nil,
          userInfo: ["postID": activePostID, "groupID": groupID as Any]
        )
      } catch {
        AppLog.posts.error(
          "createPost.submit.failed postID=\(activePostID, privacy: .private) errorType=\(AppLog.errorType(error), privacy: .public)"
        )
        errorMessage = error.localizedDescription
        isSubmitting = false
      }
    }
  }

  private func isLikelyDuplicate(draft: NativePostDraftIdentity) -> Bool {
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

  private var snapshot: PostDraftSnapshot {
    let matches = pendingDraft == identity
    return PostDraftSnapshot(title: draftTitle, text: draftText, youtubeURL: youtubeURL, files: attachments,
      pendingPostID: matches ? pendingPostID : nil, pendingIdentity: matches ? pendingDraft : nil)
  }
  private func persistDraft() {
    guard !applyingSnapshot, draftLoaded, let draftSession else { return }
    let value = snapshot
    draftSession.save(value.isEmpty ? nil : value)
  }
  func restoreDraft() async {
    guard !draftLoaded, let draftSession, !applyingSnapshot else { return }
    isRestoringDraft = true
    defer { isRestoringDraft = false }
    do {
      let value = try await draftSession.load() ?? PostDraftSnapshot()
      applyingSnapshot = true
      draftTitle = value.title; draftText = value.text; youtubeURL = value.youtubeURL; attachments = value.files
      pendingPostID = value.pendingPostID; pendingDraft = value.pendingIdentity
      applyingSnapshot = false; draftLoaded = true; draftSaveError = nil
    } catch { draftSaveError = (error as? PostDraftStoreError)?.errorDescription ?? "No se pudo recuperar el borrador. Reintenta antes de escribir otro." }
  }
  func retryDraftSave() async {
    guard !isSubmitting else { return }
    if !draftLoaded { await restoreDraft(); return }
    do { try await draftSession?.retry() }
    catch { /* The session reports the save failure without losing the local edits. */ }
  }
  func discardDraft() async {
    guard !isSubmitting, !isPreparingMedia, draftLoaded else { return }
    isSubmitting = true
    isDiscardingDraft = true
    defer { isSubmitting = false; isDiscardingDraft = false }
    do {
      draftSession?.save(nil, retry: true); try await draftSession?.flush()
      applyingSnapshot = true
      draftTitle = ""; draftText = ""; youtubeURL = ""; attachments = []
      pendingPostID = nil; pendingDraft = nil; errorMessage = nil; infoMessage = nil
      applyingSnapshot = false
    } catch { /* Retain the current selection until the discard actually commits. */ }
  }
  func flushDraft() async { try? await draftSession?.flush() }
}

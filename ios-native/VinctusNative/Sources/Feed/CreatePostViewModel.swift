import Foundation

@MainActor
final class CreatePostViewModel: ObservableObject {
  @Published var draftText = ""
  @Published private(set) var isSubmitting = false
  @Published var errorMessage: String?
  @Published var infoMessage: String?
  @Published private(set) var pendingPostID: String?

  private let repo: CreatePostRepo
  private let groupID: String?
  private var pendingDraftText: String?
  private var lastPublishedDraftText: String?
  private var lastPublishedAt: Date?
  private let duplicateWindow: TimeInterval = 25

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

  var canSubmit: Bool {
    !isSubmitting
      && characterCount > 0
      && remainingCharacters >= 0
  }

  var canRetryPendingSubmission: Bool {
    !isSubmitting
      && pendingPostID != nil
      && pendingDraftText == normalizedText(draftText)
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
    if pendingDraftText != normalizedText(draftText) {
      errorMessage = nil
      infoMessage = nil
    }
  }

  private func publish(allowDuplicateCooldownBypass: Bool) -> Task<Void, Never>? {
    guard !isSubmitting else { return nil }

    errorMessage = nil
    infoMessage = nil

    let normalizedDraft = normalizedText(draftText)
    guard !normalizedDraft.isEmpty else {
      errorMessage = "Escribe algo antes de publicar."
      return nil
    }
    guard normalizedDraft.count <= characterLimit else {
      errorMessage = "El texto supera el límite de \(characterLimit) caracteres."
      return nil
    }

    if !allowDuplicateCooldownBypass, isLikelyDuplicate(draft: normalizedDraft) {
      infoMessage = "Este texto ya se publicó hace unos segundos."
      return nil
    }

    let postID: String
    do {
      if let pendingPostID, pendingDraftText == normalizedDraft {
        postID = pendingPostID
      } else {
        postID = try repo.makePostID()
        pendingPostID = postID
        pendingDraftText = normalizedDraft
      }
    } catch {
      errorMessage = error.localizedDescription
      return nil
    }

    isSubmitting = true
    AppLog.posts.info("createPost.submit.start")

    return Task {
      do {
        try await repo.publishTextPost(text: normalizedDraft, postID: postID, groupID: groupID)
        AppLog.posts.info("createPost.submit.success postID=\(postID, privacy: .private)")

        pendingPostID = nil
        pendingDraftText = nil
        lastPublishedDraftText = normalizedDraft
        lastPublishedAt = Date()
        if normalizedText(draftText) == normalizedDraft { draftText = "" }
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

  private func isLikelyDuplicate(draft: String) -> Bool {
    guard
      let lastPublishedDraftText,
      let lastPublishedAt
    else {
      return false
    }

    guard draft == lastPublishedDraftText else { return false }
    return Date().timeIntervalSince(lastPublishedAt) < duplicateWindow
  }

  private func normalizedText(_ value: String) -> String {
    value.trimmingCharacters(in: .whitespacesAndNewlines)
  }
}

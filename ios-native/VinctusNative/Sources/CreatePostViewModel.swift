import Foundation

@MainActor
final class CreatePostViewModel: ObservableObject {
  @Published var draftText = ""
  @Published private(set) var isSubmitting = false
  @Published var errorMessage: String?
  @Published var infoMessage: String?
  @Published private(set) var pendingPostID: String?

  private let repo: CreatePostRepo
  private var pendingDraftText: String?
  private var lastPublishedDraftText: String?
  private var lastPublishedAt: Date?
  private let duplicateWindow: TimeInterval = 25

  init(repo: CreatePostRepo) {
    self.repo = repo
  }

  var characterLimit: Int { 5000 }

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

  func submit() {
    publish(allowDuplicateCooldownBypass: false)
  }

  func retryPendingSubmission() {
    publish(allowDuplicateCooldownBypass: true)
  }

  func clearFeedbackIfNeeded() {
    if pendingDraftText != normalizedText(draftText) {
      errorMessage = nil
      infoMessage = nil
    }
  }

  private func publish(allowDuplicateCooldownBypass: Bool) {
    guard !isSubmitting else { return }

    errorMessage = nil
    infoMessage = nil

    let normalizedDraft = normalizedText(draftText)
    guard !normalizedDraft.isEmpty else {
      errorMessage = "Escribe algo antes de publicar."
      return
    }
    guard normalizedDraft.count <= characterLimit else {
      errorMessage = "El texto supera el limite de \(characterLimit) caracteres."
      return
    }

    if !allowDuplicateCooldownBypass, isLikelyDuplicate(draft: normalizedDraft) {
      infoMessage = "Este texto ya se publico hace unos segundos."
      return
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
      return
    }

    isSubmitting = true
    AppLog.posts.info("createPost.submit.start")

    Task {
      do {
        try await repo.publishTextPost(text: normalizedDraft, postID: postID)
        AppLog.posts.info("createPost.submit.success postID=\(postID, privacy: .private)")

        pendingPostID = nil
        pendingDraftText = nil
        lastPublishedDraftText = normalizedDraft
        lastPublishedAt = Date()
        draftText = ""
        infoMessage = "Publicacion enviada."
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

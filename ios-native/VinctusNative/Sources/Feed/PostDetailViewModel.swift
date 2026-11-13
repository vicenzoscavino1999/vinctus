import Foundation

@MainActor
final class PostDetailViewModel: ObservableObject {
  @Published private(set) var comments: [PostComment] = []
  @Published private(set) var isLoadingComments = false
  @Published private(set) var isSubmittingComment = false
  @Published private(set) var isShowingCachedData = false
  @Published var errorMessage: String?
  @Published var infoMessage: String?
  @Published var draftComment = ""

  private let commentLimit = Limits.Comments.textMaxLength
  private let postID: String
  private let repo: any PostCommentsRepo
  private var pendingComment: (text: String, id: String)?
  private var commentsRequest = 0

  init(postID: String, repo: any PostCommentsRepo) {
    self.postID = postID
    self.repo = repo
  }

  var remainingCharacters: Int {
    commentLimit - normalizedText(draftComment).count
  }

  var canSendComment: Bool {
    !isSubmittingComment && !normalizedText(draftComment).isEmpty && remainingCharacters >= 0
  }

  func refreshComments() async {
    commentsRequest += 1
    let request = commentsRequest
    isLoadingComments = true
    errorMessage = nil

    do {
      let page = try await repo.fetchComments(postID: postID, limit: 80)
      guard request == commentsRequest else { return }
      comments = page.items
      isShowingCachedData = page.isFromCache
    } catch {
      guard request == commentsRequest else { return }
      errorMessage = error.localizedDescription
    }

    isLoadingComments = false
  }

  @discardableResult
  func submitComment() -> Task<Void, Never>? {
    guard !isSubmittingComment else { return nil }

    let normalizedDraft = normalizedText(draftComment)
    guard !normalizedDraft.isEmpty else {
      errorMessage = "Escribe un comentario antes de enviar."
      return nil
    }
    guard normalizedDraft.count <= commentLimit else {
      errorMessage = "El comentario supera el límite de \(commentLimit) caracteres."
      return nil
    }

    isSubmittingComment = true
    errorMessage = nil
    infoMessage = nil
    AppLog.posts.info("comment.submit.start")
    if pendingComment?.text != normalizedDraft {
      pendingComment = (normalizedDraft, UUID().uuidString)
    }
    let commentID = pendingComment!.id

    return Task {
      do {
        try await repo.addComment(postID: postID, text: normalizedDraft, commentID: commentID)
        AppLog.posts.info("comment.submit.success")
        pendingComment = nil
        if normalizedText(draftComment) == normalizedDraft { draftComment = "" }
        infoMessage = "Comentario enviado."
        await refreshComments()
      } catch {
        AppLog.posts.error("comment.submit.failed errorType=\(AppLog.errorType(error), privacy: .public)")
        errorMessage = error.localizedDescription
      }
      isSubmittingComment = false
    }
  }

  func clearFeedbackIfNeeded() {
    if errorMessage != nil || infoMessage != nil {
      errorMessage = nil
      infoMessage = nil
    }
  }

  private func normalizedText(_ value: String) -> String {
    value.trimmingCharacters(in: .whitespacesAndNewlines)
  }
}

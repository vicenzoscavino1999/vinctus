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

  private let commentLimit = 1000
  private let postID: String
  private let repo: any PostCommentsRepo

  init(postID: String, repo: any PostCommentsRepo) {
    self.postID = postID
    self.repo = repo
  }

  var remainingCharacters: Int {
    commentLimit - FirestoreHelpers.normalizedText(draftComment).count
  }

  var canSendComment: Bool {
    !isSubmittingComment && !FirestoreHelpers.normalizedText(draftComment).isEmpty && remainingCharacters >= 0
  }

  func refreshComments() async {
    guard !isLoadingComments else { return }
    isLoadingComments = true
    errorMessage = nil

    do {
      let page = try await repo.fetchComments(postID: postID, limit: 80)
      comments = page.items
      isShowingCachedData = page.isFromCache
    } catch {
      errorMessage = error.localizedDescription
    }

    isLoadingComments = false
  }

  func submitComment() {
    guard !isSubmittingComment else { return }

    let normalizedDraft = FirestoreHelpers.normalizedText(draftComment)
    guard !normalizedDraft.isEmpty else {
      errorMessage = "Escribe un comentario antes de enviar."
      return
    }
    guard normalizedDraft.count <= commentLimit else {
      errorMessage = "El comentario supera el limite de \(commentLimit) caracteres."
      return
    }

    isSubmittingComment = true
    errorMessage = nil
    infoMessage = nil
    AppLog.posts.info("comment.submit.start")

    Task {
      do {
        try await repo.addComment(postID: postID, text: normalizedDraft)
        AppLog.posts.info("comment.submit.success")
        draftComment = ""
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

}

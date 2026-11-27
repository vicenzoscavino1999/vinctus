import Foundation

// Screenshot builds only (see App/DemoData.swift).

#if SCREENSHOTS
struct SamplePostCommentsRepo: PostCommentsRepo {
  func fetchComments(postID: String, limit: Int, after cursor: PostCommentsCursor?) async throws -> PostCommentsPage {
    let now = Date()
    let items = [
      PostComment(id: "c1", authorID: "u3", authorName: "Valentina Cruz",
                  text: "¡Qué buena foto! ¿Qué telescopio usaste?", createdAt: now.addingTimeInterval(-1_800)),
      PostComment(id: "c2", authorID: "u4", authorName: "Diego Salazar",
                  text: "El sábado hay cielo despejado, vamos al Morro Solar.", createdAt: now.addingTimeInterval(-5_400)),
      PostComment(id: "c3", authorID: AppRepos.demoUserID, authorName: "Lucía Fernández",
                  text: "Me apunto 🙌", createdAt: now.addingTimeInterval(-7_200)),
    ]
    return PostCommentsPage(items: Array(items.prefix(limit)), isFromCache: false)
  }

  func addComment(postID: String, text: String, commentID: String) async throws {}
}
#endif

import Foundation

// Screenshot builds only (see App/DemoData.swift).

#if SCREENSHOTS
struct SampleFeedRepo: FeedRepo {
  func fetchFeedPage(limit: Int, after cursor: FeedCursor?) async throws -> FeedPage {
    let items = [
      ("f1", "u2", "Mateo Rojas", "Anoche vi los anillos de Saturno con un telescopio pequeño. ¡Vale totalmente la pena!", 42, 8),
      ("f2", "u3", "Valentina Cruz", "¿Alguien más va al festival de jazz del sábado? Busco gente para ir.", 17, 5),
      ("f3", "u4", "Diego Salazar", "Terminé mi primera impresora 3D armada desde cero. Les dejo lo que aprendí.", 88, 21),
    ].map {
      FeedItem(id: $0.0, authorID: $0.1, authorName: $0.2, text: $0.3, createdAt: Date(), likeCount: $0.4, commentCount: $0.5)
    }
    return FeedPage(items: items, nextCursor: nil, hasMore: false, isFromCache: false)
  }
}
#endif

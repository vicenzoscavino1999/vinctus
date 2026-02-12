import Foundation

struct FeedItem: Identifiable, Hashable {
  let id: String
  let title: String
}

protocol FeedRepo {
  func fetchFeed(limit: Int) async throws -> [FeedItem]
}

// Skeleton repo (Semana 4 deliverable). Wire to Firestore contracts in Semana 10+.
final class FirebaseFeedRepo: FeedRepo {
  func fetchFeed(limit: Int) async throws -> [FeedItem] {
    // TODO: implement Firestore read path (feed) once contracts are finalized.
    return []
  }
}


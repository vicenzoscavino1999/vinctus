import Foundation

@MainActor
final class FeedViewModel: ObservableObject {
  @Published private(set) var items: [FeedItem] = []
  @Published var errorMessage: String?
  @Published private(set) var isLoading = false

  private let repo: FeedRepo

  init(repo: FeedRepo) {
    self.repo = repo
  }

  func refresh() {
    errorMessage = nil
    isLoading = true
    Task {
      do {
        let fetched = try await repo.fetchFeed(limit: 20)
        items = fetched
      } catch {
        errorMessage = error.localizedDescription
      }
      isLoading = false
    }
  }
}


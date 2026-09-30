import Foundation
import UIKit

@MainActor
final class StoriesViewModel: ObservableObject {
  @Published private(set) var groups: [StoryGroup] = []
  @Published private(set) var isLoading = false
  @Published private(set) var isPublishing = false
  @Published var errorMessage: String?
  /// Stories opened in this session, to dim the ring of people already seen (like the web).
  @Published private(set) var seenStoryIDs: Set<String> = []

  private let repo: StoriesRepo

  init(repo: StoriesRepo) {
    self.repo = repo
  }

  func load() async {
    isLoading = true
    defer { isLoading = false }
    do {
      groups = try await repo.fetchStoryGroups()
      errorMessage = nil
    } catch {
      errorMessage = "No se pudieron cargar las historias."
    }
  }

  func publish(_ image: UIImage) async -> Bool {
    guard let data = ImageEncoding.jpegData(image, maxSide: 1440) else {
      errorMessage = "No se pudo preparar la foto."
      return false
    }
    isPublishing = true
    defer { isPublishing = false }
    do {
      try await repo.publishImageStory(jpegData: data)
      await load()
      return true
    } catch {
      errorMessage = "No se pudo publicar la historia."
      return false
    }
  }

  func delete(_ story: Story) async {
    do {
      try await repo.deleteStory(story)
      await load()
    } catch {
      errorMessage = "No se pudo eliminar la historia."
    }
  }

  func markSeen(_ story: Story) {
    seenStoryIDs.insert(story.id)
  }

  func isSeen(_ group: StoryGroup) -> Bool {
    group.stories.allSatisfy { seenStoryIDs.contains($0.id) }
  }
}

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
  private var sessionGeneration = 0

  init(repo: StoriesRepo) {
    self.repo = repo
  }

  func reset() {
    sessionGeneration += 1
    groups = []
    seenStoryIDs = []
    errorMessage = nil
    isLoading = false
    isPublishing = false
  }

  func load() async {
    let generation = sessionGeneration
    isLoading = true
    defer {
      if sessionGeneration == generation {
        isLoading = false
      }
    }
    do {
      let fetched = try await repo.fetchStoryGroups()
      guard sessionGeneration == generation else { return }
      groups = fetched
      errorMessage = nil
    } catch {
      guard sessionGeneration == generation else { return }
      errorMessage = "No se pudieron cargar las historias."
    }
  }

  func publish(_ image: UIImage) async -> Bool {
    guard let data = ImageEncoding.jpegData(image, maxSide: 1440) else {
      errorMessage = "No se pudo preparar la foto."
      return false
    }
    let generation = sessionGeneration
    isPublishing = true
    errorMessage = nil
    defer {
      if sessionGeneration == generation {
        isPublishing = false
      }
    }
    do {
      try await repo.publishImageStory(jpegData: data)
      guard sessionGeneration == generation else { return false }
      await load()
      return true
    } catch {
      guard sessionGeneration == generation else { return false }
      errorMessage = "No se pudo publicar la historia."
      return false
    }
  }

  @discardableResult
  func delete(_ story: Story) async -> Bool {
    let generation = sessionGeneration
    errorMessage = nil
    do {
      try await repo.deleteStory(story)
      guard sessionGeneration == generation else { return false }
      groups = groups.compactMap { group in
        let remaining = group.stories.filter { $0.id != story.id }
        guard !remaining.isEmpty else { return nil }
        return StoryGroup(
          ownerID: group.ownerID,
          ownerName: group.ownerName,
          ownerPhotoURL: group.ownerPhotoURL,
          stories: remaining
        )
      }
      await load()
      return true
    } catch {
      guard sessionGeneration == generation else { return false }
      errorMessage = "No se pudo eliminar la historia."
      return false
    }
  }

  func excludeOwner(_ ownerID: String) {
    groups.removeAll { $0.ownerID == ownerID }
  }

  func markSeen(_ story: Story) {
    seenStoryIDs.insert(story.id)
  }

  func isSeen(_ group: StoryGroup) -> Bool {
    !group.stories.isEmpty && group.stories.allSatisfy { seenStoryIDs.contains($0.id) }
  }
}

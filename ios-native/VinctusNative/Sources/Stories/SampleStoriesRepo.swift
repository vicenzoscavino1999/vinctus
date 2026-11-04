import Foundation

// Screenshot builds only (see App/DemoData.swift).

#if SCREENSHOTS
struct SampleStoriesRepo: StoriesRepo {
  func fetchStoryGroups() async throws -> [StoryGroup] {
    let now = Date()
    let stories = [("u2", "Mateo Rojas"), ("u3", "Valentina Cruz"), ("u4", "Diego Salazar"), ("u5", "Camila Torres")]
      .enumerated()
      .map { index, owner in
        Story(
          id: "s\(index)", ownerID: owner.0, ownerName: owner.1, ownerPhotoURL: nil, mediaType: .image,
          mediaURL: "https://example.com/story\(index).jpg", mediaPath: "", createdAt: now.addingTimeInterval(Double(-index) * 3600),
          expiresAt: now.addingTimeInterval(20 * 3600)
        )
      }
    let shorts = YouTubeShorts.stories(
      from: YouTubeShorts.fallbackVideoIDs.prefix(6).map {
        YouTubeShorts.Video(videoID: $0, channelTitle: nil, thumbnailURL: nil)
      },
      now: now
    )
    return StoryGroup.make(from: stories + shorts, currentUID: AppRepos.demoUserID)
  }

  func publishImageStory(jpegData: Data) async throws {}
  func deleteStory(_ story: Story) async throws {}
}
#endif

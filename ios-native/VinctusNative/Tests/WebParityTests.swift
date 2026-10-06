import XCTest
@testable import VinctusNative

/// The app must pick and show things exactly like the web does.
final class YouTubeShortsTests: XCTestCase {
  /// Values computed with the web's `hashString` (src/features/posts/hooks/useStories.ts).
  func testHashMatchesTheWeb() {
    XCTAssertEqual(YouTubeShorts.hash("2026-09-28:pick:jNQXAC9IVRw"), 1_923_297_181)
    XCTAssertEqual(YouTubeShorts.hash("2026-09-28:time:dQw4w9WgXcQ:3"), 1_006_845_918)
    XCTAssertEqual(YouTubeShorts.hash("ñandú ¿qué?"), 136_974_376)
    XCTAssertEqual(YouTubeShorts.hash("x"), 177_629)
  }

  func testDayKeyIsTheUTCDate() {
    // 2026-09-28 23:30 in Lima is already the 29th in UTC.
    let date = Date(timeIntervalSince1970: 1_790_656_200)
    XCTAssertEqual(YouTubeShorts.dayKey(for: date), "2026-09-29")
  }

  func testDailyPickIsStableAndLooksLikeStories() {
    let now = Date(timeIntervalSince1970: 1_790_600_000)
    let videos = YouTubeShorts.fallbackVideoIDs.map {
      YouTubeShorts.Video(videoID: $0, channelTitle: nil, thumbnailURL: nil)
    }

    let first = YouTubeShorts.stories(from: videos, now: now)
    let again = YouTubeShorts.stories(from: videos.reversed(), now: now)

    XCTAssertEqual(first.count, YouTubeShorts.dailyCount)
    XCTAssertEqual(first.map(\.id), again.map(\.id))
    XCTAssertTrue(first.allSatisfy { $0.isYouTubeShort && $0.ownerID.hasPrefix(YouTubeShorts.ownerPrefix) })
    XCTAssertTrue(first.allSatisfy { now.timeIntervalSince($0.createdAt) < YouTubeShorts.spreadWindow })
    XCTAssertEqual(first.first?.ownerName, "YouTube Shorts")
  }

  func testShortsGoAfterPeople() {
    let now = Date()
    let short = YouTubeShorts.stories(
      from: [YouTubeShorts.Video(videoID: "jNQXAC9IVRw", channelTitle: "Canal", thumbnailURL: nil)],
      now: now
    )
    let person = Story(
      id: "s1", ownerID: "ana", ownerName: "Ana", ownerPhotoURL: nil, mediaType: .image,
      mediaURL: "https://example.com/a.jpg", mediaPath: "p",
      createdAt: now.addingTimeInterval(-86_000), expiresAt: now.addingTimeInterval(400)
    )

    let groups = StoryGroup.make(from: short + [person], currentUID: "me")

    XCTAssertEqual(groups.map(\.ownerID), ["ana", "yt-short-owner-jNQXAC9IVRw"])
    XCTAssertTrue(groups.last?.isYouTubeShorts == true)
  }
}

final class YouTubeLinkTests: XCTestCase {
  func testRecognizesTheSameLinksAsTheWeb() {
    XCTAssertEqual(YouTubeLink.videoID(from: "https://www.youtube.com/watch?v=dQw4w9WgXcQ"), "dQw4w9WgXcQ")
    XCTAssertEqual(YouTubeLink.videoID(from: "https://youtu.be/dQw4w9WgXcQ"), "dQw4w9WgXcQ")
    XCTAssertEqual(YouTubeLink.videoID(from: "https://youtube.com/shorts/dQw4w9WgXcQ?feature=share"), "dQw4w9WgXcQ")
    XCTAssertEqual(YouTubeLink.videoID(from: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"), "dQw4w9WgXcQ")
    XCTAssertEqual(YouTubeLink.videoID(from: " dQw4w9WgXcQ "), "dQw4w9WgXcQ")
    XCTAssertNil(YouTubeLink.videoID(from: "https://vimeo.com/123456789"))
    XCTAssertNil(YouTubeLink.videoID(from: "https://www.youtube.com/watch?v=corto"))
    XCTAssertEqual(
      YouTubeLink.thumbnailURL(from: "https://youtu.be/dQw4w9WgXcQ"),
      "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg"
    )
  }
}

final class PostMediaTests: XCTestCase {
  private func item() -> FeedItem {
    FeedItem(id: "p", authorID: "u", authorName: "U", text: "", createdAt: nil, likeCount: 0, commentCount: 0)
  }

  func testPhotoComesFirst() {
    var post = item()
    post.applyMedia([
      ["type": "video", "url": "https://youtu.be/dQw4w9WgXcQ"],
      ["type": "image", "url": "https://example.com/a.jpg"],
    ])

    XCTAssertEqual(post.previewImageURL, "https://example.com/a.jpg")
    XCTAssertTrue(post.hasVideo)
  }

  func testVideoThumbnailAndFiles() {
    var video = item()
    video.applyMedia([["type": "video", "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"]])
    XCTAssertEqual(video.previewImageURL, "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg")

    var file = item()
    file.applyMedia([["type": "file", "url": "https://example.com/f.pdf", "fileName": "apuntes.pdf"]])
    XCTAssertEqual(file.fileName, "apuntes.pdf")
    XCTAssertNil(file.previewImageURL)

    var nothing = item()
    nothing.applyMedia("no es una lista")
    XCTAssertNil(nothing.previewImageURL)
    XCTAssertFalse(nothing.hasVideo)
  }
}

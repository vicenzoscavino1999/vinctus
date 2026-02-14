import Foundation

enum CreatePostDraftComposer {
  struct DuplicateCheckInput {
    let draft: String
    let mediaFingerprint: String
    let lastPublishedDraftText: String?
    let lastPublishedMediaFingerprint: String?
    let lastPublishedAt: Date?
    let duplicateWindow: TimeInterval
  }

  static func composedDraft(title: String, body: String, youtubeURL: String) -> String {
    let normalizedTitle = FirestoreHelpers.normalizedSingleLineText(title)
    let normalizedBody = FirestoreHelpers.normalizedText(body)
    let normalizedYouTubeURL = FirestoreHelpers.normalizedText(youtubeURL)

    var blocks: [String] = []
    if !normalizedTitle.isEmpty {
      blocks.append(normalizedTitle)
    }
    if !normalizedBody.isEmpty {
      blocks.append(normalizedBody)
    }
    if !normalizedYouTubeURL.isEmpty {
      blocks.append(normalizedYouTubeURL)
    }
    return blocks.joined(separator: "\n\n")
  }

  static func mediaFingerprint(_ mediaItems: [CreatePostMediaUpload]) -> String {
    mediaItems.map { item in
      "\(item.kind.rawValue):\(item.data.count):\(item.width ?? 0)x\(item.height ?? 0)"
    }
    .joined(separator: "|")
  }

  static func isLikelyDuplicate(_ input: DuplicateCheckInput) -> Bool {
    guard
      let lastPublishedDraftText = input.lastPublishedDraftText,
      let lastPublishedMediaFingerprint = input.lastPublishedMediaFingerprint,
      let lastPublishedAt = input.lastPublishedAt
    else {
      return false
    }

    guard input.draft == lastPublishedDraftText else { return false }
    guard input.mediaFingerprint == lastPublishedMediaFingerprint else { return false }
    return Date().timeIntervalSince(lastPublishedAt) < input.duplicateWindow
  }
}

import Foundation

/// YouTube links, like `parseYouTubeUrl` in `src/shared/lib/youtube.ts`.
enum YouTubeLink {
  /// The 11-character video id of a YouTube link (watch, youtu.be, shorts, embed, live) or of a
  /// bare id, or nil when it isn't one.
  static func videoID(from input: String) -> String? {
    let trimmed = input.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return nil }
    if isVideoID(trimmed) { return trimmed }
    guard let components = URLComponents(string: trimmed), let host = components.host?.lowercased() else {
      return nil
    }
    let parts = components.path.split(separator: "/").map(String.init)

    if host == "youtu.be" || host == "www.youtu.be" {
      return parts.first.flatMap { isVideoID($0) ? $0 : nil }
    }

    let youtubeHosts: Set<String> = [
      "youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com",
      "youtube-nocookie.com", "www.youtube-nocookie.com",
    ]
    guard youtubeHosts.contains(host) else { return nil }

    if let id = components.queryItems?.first(where: { $0.name == "v" })?.value, isVideoID(id) {
      return id
    }
    if parts.count >= 2, ["embed", "shorts", "live", "v"].contains(parts[0]) {
      return isVideoID(parts[1]) ? parts[1] : nil
    }
    return parts.first.flatMap { isVideoID($0) ? $0 : nil }
  }

  static func thumbnailURL(from input: String) -> String? {
    videoID(from: input).map { "https://i.ytimg.com/vi/\($0)/hqdefault.jpg" }
  }

  private static func isVideoID(_ value: String) -> Bool {
    value.count == 11 && value.allSatisfy { $0.isASCII && ($0.isLetter || $0.isNumber || $0 == "_" || $0 == "-") }
  }
}

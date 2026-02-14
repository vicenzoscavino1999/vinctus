import Foundation

enum CreatePostMediaRules {
  static func validate(
    media: [CreatePostMediaUpload],
    maxMediaItems: Int,
    maxImageBytes: Int,
    maxVideoBytes: Int,
    maxFileBytes: Int
  ) throws {
    guard media.count <= maxMediaItems else { throw CreatePostRepoError.mediaCountExceeded(limit: maxMediaItems) }

    for (index, item) in media.enumerated() {
      guard !item.data.isEmpty else { throw CreatePostRepoError.invalidMedia(index: index) }
      guard isValid(contentType: item.contentType, for: item.kind) else {
        throw CreatePostRepoError.invalidMedia(index: index)
      }

      let sizeLimit = sizeLimitBytes(for: item.kind, maxImageBytes: maxImageBytes, maxVideoBytes: maxVideoBytes, maxFileBytes: maxFileBytes)
      guard item.data.count < sizeLimit else {
        throw CreatePostRepoError.mediaTooLarge(index: index, limitMB: sizeLimit / (1024 * 1024))
      }
    }
  }

  static func storagePath(for item: CreatePostMediaUpload, authorID: String, postID: String) -> String {
    let folder: String
    switch item.kind {
    case .image:
      folder = "images"
    case .video:
      folder = "videos"
    case .file:
      folder = "files"
    }

    let fileName = sanitizeFileName(item.fileName)
    return "posts/\(authorID)/\(postID)/\(folder)/\(Int(Date().timeIntervalSince1970))_\(fileName)"
  }

  private static func isValid(contentType: String, for kind: CreatePostMediaKind) -> Bool {
    switch kind {
    case .image:
      return contentType.hasPrefix("image/")
    case .video:
      return contentType.hasPrefix("video/")
    case .file:
      return contentType.hasPrefix("application/")
    }
  }

  private static func sizeLimitBytes(
    for kind: CreatePostMediaKind,
    maxImageBytes: Int,
    maxVideoBytes: Int,
    maxFileBytes: Int
  ) -> Int {
    switch kind {
    case .image:
      return maxImageBytes
    case .video:
      return maxVideoBytes
    case .file:
      return maxFileBytes
    }
  }

  private static func sanitizeFileName(_ raw: String) -> String {
    let fallback = "file.bin"
    let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return fallback }

    let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "._-"))
    let mapped = trimmed.unicodeScalars.map { scalar -> Character in
      allowed.contains(scalar) ? Character(scalar) : "_"
    }

    let sanitized = String(mapped).trimmingCharacters(in: CharacterSet(charactersIn: "._"))
    if sanitized.isEmpty {
      return fallback
    }
    return String(sanitized.prefix(120))
  }
}

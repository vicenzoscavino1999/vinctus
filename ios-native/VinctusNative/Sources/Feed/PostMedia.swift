import CoreTransferable
import Foundation
import UniformTypeIdentifiers

enum PostMediaError: LocalizedError {
  case invalidFile, tooManyFiles, tooLarge(Int), invalidYouTube
  var errorDescription: String? {
    switch self {
    case .invalidFile: return "El archivo está vacío o su formato no es compatible."
    case .tooManyFiles: return "Puedes adjuntar hasta 10 archivos o enlaces por publicación."
    case .tooLarge(let bytes): return "El archivo debe pesar menos de \(bytes / 1024 / 1024) MB."
    case .invalidYouTube: return "El enlace de YouTube no es válido."
    }
  }
}

enum PostFiles {
  static func kind(contentType: String) -> String? {
    if StorageContentTypes.image.contains(contentType) { return "image" }
    if StorageContentTypes.video.contains(contentType) { return "video" }
    if StorageContentTypes.chatFile.contains(contentType) { return "file" }
    return nil
  }

  static func validate(contentType: String, size: Int) throws {
    guard let kind = kind(contentType: contentType), size > 0 else { throw PostMediaError.invalidFile }
    let limit = kind == "image" ? StorageMaxBytes.image : kind == "video" ? StorageMaxBytes.video : StorageMaxBytes.file
    guard size < limit else { throw PostMediaError.tooLarge(limit) }
  }

  static func path(_ file: ChatPendingAttachment, userID: String, postID: String) -> String {
    let name = String(file.fileName.suffix(120)).map { $0.isASCII && ($0.isLetter || $0.isNumber || "._-".contains($0)) ? String($0) : "_" }.joined()
    let filename = "\(file.id)_\(name)"
    switch kind(contentType: file.contentType) {
    case "image": return StoragePaths.postImage(userID: userID, postID: postID, filename: filename)
    case "video": return StoragePaths.postVideo(userID: userID, postID: postID, filename: filename)
    default: return StoragePaths.postFile(userID: userID, postID: postID, filename: filename)
    }
  }

  static func copy(from url: URL, movie: Bool) throws -> ChatPendingAttachment {
    let scoped = url.startAccessingSecurityScopedResource()
    defer { if scoped { url.stopAccessingSecurityScopedResource() } }
    let type = UTType(filenameExtension: url.pathExtension)?.preferredMIMEType ?? "application/octet-stream"
    let size = try url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
    try validate(contentType: type, size: size)
    guard kind(contentType: type) == (movie ? "video" : "file") else { throw PostMediaError.invalidFile }
    let target = ChatPendingAttachment.temporaryURL(extension: url.pathExtension)
    try FileManager.default.copyItem(at: url, to: target)
    return ChatPendingAttachment(fileURL: target, fileName: String(url.lastPathComponent.prefix(120)),
      contentType: type, size: size, kind: movie ? .video : .document)
  }
}

struct PostPickedMedia: Transferable {
  let file: ChatPendingAttachment
  static var transferRepresentation: some TransferRepresentation {
    FileRepresentation(importedContentType: .image) { received in
      PostPickedMedia(file: try ChatPickedFile.image(from: received.file))
    }
    FileRepresentation(importedContentType: .movie) { received in
      PostPickedMedia(file: try PostFiles.copy(from: received.file, movie: true))
    }
  }
}

struct NativePostDraft {
  var title: String? = nil
  var text: String
  var files: [ChatPendingAttachment] = []
  var youtubeVideoID: String? = nil

  var normalizedTitle: String? {
    let title = title?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    if !title.isEmpty { return title }
    if text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
      if youtubeVideoID != nil { return "Video de YouTube" }
      if !files.isEmpty { return "Publicación" }
    }
    return nil
  }

  func validate() throws {
    let text = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !text.isEmpty || normalizedTitle != nil else { throw CreatePostRepoError.emptyText }
    guard text.count <= Limits.Posts.textMaxLength else { throw CreatePostRepoError.textTooLong(limit: Limits.Posts.textMaxLength) }
    guard (normalizedTitle?.count ?? 0) <= Limits.Posts.titleMaxLength else { throw CreatePostRepoError.titleTooLong }
    guard files.count + (youtubeVideoID == nil ? 0 : 1) <= 10 else { throw PostMediaError.tooManyFiles }
    if let id = youtubeVideoID, YouTubeLink.videoID(from: id) != id { throw PostMediaError.invalidYouTube }
    for file in files {
      try PostFiles.validate(contentType: file.contentType, size: file.size)
      guard file.fileURL.isFileURL, FileManager.default.fileExists(atPath: file.fileURL.path) else { throw PostMediaError.invalidFile }
    }
  }
}

struct PostMediaItem: Identifiable, Hashable {
  let type: String
  let url: String
  let path: String
  var contentType: String? = nil
  var fileName: String? = nil
  var size: Int? = nil
  var id: String { path }
  var fields: [String: Any] {
    var result: [String: Any] = ["type": type, "url": url, "path": path]
    if let contentType { result["contentType"] = contentType }
    if let fileName { result["fileName"] = fileName }
    if let size { result["size"] = size }
    return result
  }
  init(type: String, url: String, path: String, contentType: String? = nil, fileName: String? = nil, size: Int? = nil) {
    self.type = type; self.url = url; self.path = path
    self.contentType = contentType; self.fileName = fileName; self.size = size
  }
  init?(fields: [String: Any]) {
    guard let type = fields["type"] as? String, ["image", "video", "file"].contains(type),
      let url = fields["url"] as? String else { return nil }
    self.init(type: type, url: url, path: fields["path"] as? String ?? url,
      contentType: fields["contentType"] as? String, fileName: fields["fileName"] as? String,
      size: (fields["size"] as? NSNumber)?.intValue)
  }
}

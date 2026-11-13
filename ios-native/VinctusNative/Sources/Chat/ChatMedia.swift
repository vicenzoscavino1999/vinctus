import CoreTransferable
import Foundation
import ImageIO
import UniformTypeIdentifiers

enum ChatMediaKind: String {
  case image, video, audio, document
}

enum ChatMediaError: LocalizedError {
  case invalidAttachment, tooManyAttachments, tooLarge(String), microphoneDenied, recordingFailed

  var errorDescription: String? {
    switch self {
    case .invalidAttachment: return "No se pudo abrir el archivo o su formato no es compatible."
    case .tooManyAttachments: return "Puedes adjuntar hasta 10 archivos por mensaje."
    case .tooLarge(let limit): return "El archivo debe pesar menos de \(limit)."
    case .microphoneDenied: return "Activa el permiso de micrófono en Ajustes para grabar una nota de voz."
    case .recordingFailed: return "No se pudo grabar la nota de voz. Inténtalo de nuevo."
    }
  }
}

/// Same wire shape as MessageAttachmentRead on the web. Videos and audio retain kind=file,
/// so older clients can still offer a download; native rendering uses the content type.
struct ChatAttachment: Hashable, Identifiable {
  let kind: String
  let url: String
  let path: String
  let fileName: String
  let contentType: String
  let size: Int
  var id: String { path }
  var mediaKind: ChatMediaKind {
    if contentType.hasPrefix("image/") { return .image }
    if contentType.hasPrefix("video/") { return .video }
    if contentType.hasPrefix("audio/") { return .audio }
    return .document
  }
  var label: String {
    switch mediaKind {
    case .image: return "Foto"
    case .video: return "Video"
    case .audio: return "Audio"
    case .document: return "Archivo"
    }
  }
  var remoteURL: URL? {
    guard let value = URL(string: url), value.scheme == "https", value.host != nil else { return nil }
    return value
  }
  var fields: [String: Any] {
    ["kind": kind, "url": url, "path": path, "fileName": fileName, "contentType": contentType, "size": size]
  }

  init(kind: String, url: String, path: String, fileName: String, contentType: String, size: Int) {
    self.kind = kind; self.url = url; self.path = path; self.fileName = fileName
    self.contentType = contentType; self.size = size
  }

  init?(fields: [String: Any]) {
    guard let url = fields["url"] as? String, let path = fields["path"] as? String,
      let name = fields["fileName"] as? String, let type = fields["contentType"] as? String
    else { return nil }
    self.init(kind: fields["kind"] as? String ?? "file", url: url, path: path, fileName: name,
      contentType: type, size: (fields["size"] as? NSNumber)?.intValue ?? 0)
  }
}

/// Owns a private temporary copy. The file stays alive through sends and retries and is removed
/// only after the composer/outbox releases its final reference.
final class ChatPendingAttachment: Identifiable, @unchecked Sendable {
  let id: String
  let fileURL: URL
  let fileName: String
  let contentType: String
  let size: Int
  let kind: ChatMediaKind

  init(fileURL: URL, fileName: String, contentType: String, size: Int, kind: ChatMediaKind, id: String = UUID().uuidString) {
    self.id = id; self.fileURL = fileURL; self.fileName = fileName
    self.contentType = contentType; self.size = size; self.kind = kind
  }

  func validate() throws {
    try Self.validate(contentType: contentType, size: size)
    guard fileURL.isFileURL, FileManager.default.fileExists(atPath: fileURL.path) else {
      throw ChatMediaError.invalidAttachment
    }
  }

  static func validate(contentType: String, size: Int) throws {
    guard size > 0 else { throw ChatMediaError.invalidAttachment }
    let limit: Int
    if StorageContentTypes.image.contains(contentType) { limit = StorageMaxBytes.image }
    else if StorageContentTypes.video.contains(contentType) { limit = StorageMaxBytes.chatVideo }
    else if StorageContentTypes.chatAudio.contains(contentType) { limit = StorageMaxBytes.chatAudio }
    else if StorageContentTypes.chatFile.contains(contentType) { limit = StorageMaxBytes.file }
    else { throw ChatMediaError.invalidAttachment }
    guard size < limit else { throw ChatMediaError.tooLarge("\(limit / 1024 / 1024) MB") }
  }

  static func temporaryURL(extension suffix: String) -> URL {
    FileManager.default.temporaryDirectory.appendingPathComponent("vinctus-chat-\(UUID().uuidString).\(suffix)")
  }

  deinit {
    // Only delete files created by this feature, never a user's original selection.
    if fileURL.deletingLastPathComponent().standardizedFileURL == FileManager.default.temporaryDirectory.standardizedFileURL,
       fileURL.lastPathComponent.hasPrefix("vinctus-chat-") {
      try? FileManager.default.removeItem(at: fileURL)
    }
  }
}

/// Import from a file representation instead of loading an entire movie into memory.
struct ChatPickedFile: Transferable {
  let attachment: ChatPendingAttachment

  static var transferRepresentation: some TransferRepresentation {
    FileRepresentation(importedContentType: .image) { received in
      ChatPickedFile(attachment: try image(from: received.file))
    }
    FileRepresentation(importedContentType: .movie) { received in
      ChatPickedFile(attachment: try movie(from: received.file))
    }
  }

  static func image(from url: URL) throws -> ChatPendingAttachment {
    guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
      let image = CGImageSourceCreateThumbnailAtIndex(source, 0, [
        kCGImageSourceCreateThumbnailFromImageAlways: true,
        kCGImageSourceCreateThumbnailWithTransform: true,
        kCGImageSourceThumbnailMaxPixelSize: 2048,
      ] as CFDictionary)
    else { throw ChatMediaError.invalidAttachment }
    let target = ChatPendingAttachment.temporaryURL(extension: "jpg")
    guard let destination = CGImageDestinationCreateWithURL(target as CFURL, UTType.jpeg.identifier as CFString, 1, nil) else {
      throw ChatMediaError.invalidAttachment
    }
    CGImageDestinationAddImage(destination, image, [kCGImageDestinationLossyCompressionQuality: 0.85] as CFDictionary)
    guard CGImageDestinationFinalize(destination) else {
      try? FileManager.default.removeItem(at: target)
      throw ChatMediaError.invalidAttachment
    }
    return try ownedFile(target, name: "Foto.jpg", type: "image/jpeg", kind: .image)
  }

  static func movie(from url: URL) throws -> ChatPendingAttachment {
    let type = UTType(filenameExtension: url.pathExtension)?.preferredMIMEType ?? "video/quicktime"
    let size = try url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
    try ChatPendingAttachment.validate(contentType: type, size: size)
    let target = ChatPendingAttachment.temporaryURL(extension: url.pathExtension.isEmpty ? "mov" : url.pathExtension)
    try FileManager.default.copyItem(at: url, to: target)
    return try ownedFile(target, name: "Video.\(target.pathExtension)", type: type, kind: .video)
  }

  static func ownedFile(_ url: URL, name: String, type: String, kind: ChatMediaKind) throws -> ChatPendingAttachment {
    let file = ChatPendingAttachment(fileURL: url, fileName: name, contentType: type,
      size: (try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0, kind: kind)
    try file.validate()
    return file
  }
}

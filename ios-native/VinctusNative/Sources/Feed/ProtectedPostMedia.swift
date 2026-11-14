import AVKit
import FirebaseAuth
import FirebaseCore
import Foundation
import QuickLook
import SwiftUI

fileprivate struct DownloadedPostMedia {
  let url: URL
  let isImage: Bool
}

enum PostMediaDownload {
  static let prefix = "post-media:"
  private static let chunkBytes = 8 * 1024 * 1024
  private static let maxBytes = 100 * 1024 * 1024

  private static func request(_ endpoint: URL, method: String, uid: String?) async throws -> URLRequest {
    guard Auth.auth().currentUser?.uid == uid else { throw PostReadError.sessionChanged }
    var request = URLRequest(url: endpoint, cachePolicy: .reloadIgnoringLocalCacheData)
    request.httpMethod = method
    request.httpShouldHandleCookies = false
    if let user = Auth.auth().currentUser {
      request.setValue("Bearer \(try await user.getIDToken())", forHTTPHeaderField: "Authorization")
    }
    guard Auth.auth().currentUser?.uid == uid else { throw PostReadError.sessionChanged }
    return request
  }

  fileprivate static func download(_ source: String, uid: String?, progress: @escaping @Sendable (Double) -> Void) async throws -> DownloadedPostMedia {
    guard source.hasPrefix(prefix) else { throw PostReadError.invalidResponse }
    let path = String(source.dropFirst(prefix.count))
    let endpoint = try PostReadClient.mediaEndpoint(path: path)
    let config = URLSessionConfiguration.ephemeral
    config.urlCache = nil
    config.httpCookieStorage = nil
    config.timeoutIntervalForRequest = 60
    let session = URLSession(configuration: config)
    defer { session.invalidateAndCancel() }
    let headRequest = try await request(endpoint, method: "HEAD", uid: uid)
    let (_, rawMetadata) = try await session.data(for: headRequest)
    guard let metadata = rawMetadata as? HTTPURLResponse, metadata.statusCode == 200,
      let length = metadata.value(forHTTPHeaderField: "Content-Length"), let size = Int(length),
      size >= 0, size <= maxBytes, let etag = metadata.value(forHTTPHeaderField: "ETag")
    else { throw PostReadError.invalidResponse }
    let mime = metadata.value(forHTTPHeaderField: "Content-Type") ?? "application/octet-stream"
    let extensions = ["application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
      "image/gif": "gif", "image/heic": "heic", "image/heif": "heif", "image/avif": "avif",
      "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov",
      "application/msword": "doc", "application/vnd.ms-excel": "xls", "application/vnd.ms-powerpoint": "ppt",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx"]
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent("VinctusPostMedia", isDirectory: true)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    let destination = directory.appendingPathComponent(UUID().uuidString).appendingPathExtension(extensions[mime] ?? "bin")
    guard FileManager.default.createFile(atPath: destination.path, contents: nil) else { throw PostReadError.invalidResponse }
    let file = try FileHandle(forWritingTo: destination)
    do {
      for start in stride(from: 0, to: size, by: chunkBytes) {
        try Task.checkCancellation()
        let end = min(size - 1, start + chunkBytes - 1)
        var partRequest = try await request(endpoint, method: "GET", uid: uid)
        partRequest.setValue("bytes=\(start)-\(end)", forHTTPHeaderField: "Range")
        partRequest.setValue(etag, forHTTPHeaderField: "If-Match")
        let (bytes, rawResponse) = try await session.data(for: partRequest)
        guard let response = rawResponse as? HTTPURLResponse, response.statusCode == 206,
          response.value(forHTTPHeaderField: "ETag") == etag,
          response.value(forHTTPHeaderField: "Content-Range") == "bytes \(start)-\(end)/\(size)",
          bytes.count == end - start + 1 else { throw PostReadError.invalidResponse }
        try file.write(contentsOf: bytes)
        progress(Double(end + 1) / Double(max(1, size)))
      }
      try Task.checkCancellation()
      guard Auth.auth().currentUser?.uid == uid else { throw PostReadError.sessionChanged }
      try file.close()
      return DownloadedPostMedia(url: destination, isImage: path.contains("/images/"))
    } catch {
      try? file.close()
      try? FileManager.default.removeItem(at: destination)
      throw error
    }
  }
}

@MainActor
private final class PostMediaLoader: ObservableObject {
  @Published var url: URL?
  @Published var image: UIImage?
  @Published var isLoading = false
  @Published var failed = false
  @Published var progress = 0.0
  private var pending: Task<DownloadedPostMedia, Error>?
  private var authListener: AuthStateDidChangeListenerHandle?
  private var scope: String?
  private var generation = 0

  init() {
    if FirebaseApp.app() != nil {
      authListener = Auth.auth().addStateDidChangeListener { [weak self] _, user in
        Task { @MainActor in
          if let self, self.scope != user?.uid { self.cancel() }
        }
      }
    }
  }

  deinit {
    pending?.cancel()
    if let authListener { Auth.auth().removeStateDidChangeListener(authListener) }
    if let url { try? FileManager.default.removeItem(at: url) }
  }

  func cancel() {
    generation += 1
    pending?.cancel()
    pending = nil
    if let url { try? FileManager.default.removeItem(at: url) }
    url = nil
    image = nil
    isLoading = false
  }

  func load(_ source: String) async {
    cancel()
    let request = generation
    scope = Auth.auth().currentUser?.uid
    let uid = scope
    failed = false
    progress = 0
    isLoading = true
    let task = Task.detached {
      try await PostMediaDownload.download(source, uid: uid) { [weak self] progress in
        Task { @MainActor in
          if let self, self.generation == request { self.progress = progress }
        }
      }
    }
    pending = task
    do {
      let result = try await withTaskCancellationHandler(operation: { try await task.value }, onCancel: { task.cancel() })
      guard generation == request, Auth.auth().currentUser?.uid == uid else {
        try? FileManager.default.removeItem(at: result.url)
        return
      }
      url = result.url
      image = result.isImage ? UIImage(contentsOfFile: result.url.path) : nil
      isLoading = false
    } catch {
      guard generation == request else { return }
      isLoading = false
      failed = !Task.isCancelled
    }
  }
}

struct PostImageView: View {
  let source: String
  var body: some View {
    if source.hasPrefix(PostMediaDownload.prefix) {
      ProtectedPostImage(source: source)
    } else {
      AsyncImage(url: URL(string: source)) { phase in
        if case .success(let image) = phase { image.resizable().scaledToFill() }
        else { VinctusTokens.Color.surface2 }
      }
    }
  }
}

private struct ProtectedPostImage: View {
  let source: String
  @StateObject private var loader = PostMediaLoader()
  var body: some View {
    Group {
      if let image = loader.image { Image(uiImage: image).resizable().scaledToFill() }
      else { VinctusTokens.Color.surface2 }
    }
    .task(id: source) { await loader.load(source) }
    .onDisappear { loader.cancel() }
  }
}

struct ProtectedPostAttachment: View {
  let item: PostMediaItem
  @StateObject private var loader = PostMediaLoader()
  @State private var preview: URL?
  var body: some View {
    Group {
      if item.type == "image" {
        PostImageView(source: item.url).aspectRatio(4 / 3, contentMode: .fit).clipped()
      } else if item.type == "video" {
        if let url = loader.url { ProtectedPostPlayer(url: url).frame(height: 240) }
        else if loader.failed { Button("Reintentar video") { Task { await loader.load(item.url) } } }
        else { ProgressView("Cargando video… \(Int(loader.progress * 100)) %").frame(height: 180) }
      } else {
        Button {
          Task {
            if loader.url == nil { await loader.load(item.url) }
            preview = loader.url
          }
        } label: {
          Label(loader.isLoading ? "Preparando archivo…" : item.fileName ?? "Documento", systemImage: "doc")
        }
        .disabled(loader.isLoading)
        if loader.failed { Text("No se pudo descargar. Reintenta.").font(.caption).foregroundStyle(.secondary) }
      }
    }
    .task(id: item.url) { if item.type == "video" { await loader.load(item.url) } }
    .onDisappear { loader.cancel() }
    .quickLookPreview($preview)
  }
}

private struct ProtectedPostPlayer: View {
  @Environment(\.scenePhase) private var scenePhase
  @State private var player: AVPlayer
  init(url: URL) { _player = State(initialValue: AVPlayer(url: url)) }
  var body: some View {
    VideoPlayer(player: player)
      .onDisappear { player.pause() }
      .onChange(of: scenePhase) { _, phase in if phase != .active { player.pause() } }
  }
}

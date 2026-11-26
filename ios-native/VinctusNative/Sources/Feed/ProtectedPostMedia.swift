import AVKit
import FirebaseAuth
import FirebaseCore
import Foundation
import ImageIO
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

  private static func request(
    _ endpoint: URL,
    method: String,
    uid: String?,
    appCheckToken: String?
  ) async throws -> URLRequest {
    guard Auth.auth().currentUser?.isAnonymous == false, Auth.auth().currentUser?.uid == uid else { throw PostReadError.sessionChanged }
    var request = URLRequest(url: endpoint, cachePolicy: .reloadIgnoringLocalCacheData)
    request.httpMethod = method
    request.httpShouldHandleCookies = false
    if let user = Auth.auth().currentUser {
      request.setValue("Bearer \(try await user.getIDToken())", forHTTPHeaderField: "Authorization")
    }
    if let appCheckToken {
      request.setValue(appCheckToken, forHTTPHeaderField: "X-Firebase-AppCheck")
    }
    guard Auth.auth().currentUser?.uid == uid else { throw PostReadError.sessionChanged }
    return request
  }

  private static func makeSession() -> URLSession {
    let config = URLSessionConfiguration.ephemeral
    config.urlCache = nil
    config.httpCookieStorage = nil
    config.timeoutIntervalForRequest = 60
    return URLSession(configuration: config)
  }

  /// A photo in one GET without Range. The function answers 200 with the whole file when it fits
  /// in one chunk and 416 when it does not; then (or when the length cannot be checked) it is
  /// downloaded by ranges like any other attachment. Saves the HEAD round trip, and every request
  /// to the function verifies the session and the access again.
  static func imageData(_ source: String, uid: String?) async throws -> Data {
    guard source.hasPrefix(prefix) else { throw PostReadError.invalidResponse }
    let endpoint = try PostReadClient.mediaEndpoint(path: String(source.dropFirst(prefix.count)))
    let appCheckToken = await AppCheckBootstrap.optionalTokenHeader()
    let session = makeSession()
    defer { session.invalidateAndCancel() }
    let wholeRequest = try await request(endpoint, method: "GET", uid: uid, appCheckToken: appCheckToken)
    let (data, rawResponse) = try await session.data(for: wholeRequest)
    guard let response = rawResponse as? HTTPURLResponse else { throw PostReadError.invalidResponse }
    switch response.statusCode {
    case 200:
      if let length = response.value(forHTTPHeaderField: "Content-Length"), Int(length) == data.count,
        data.count <= chunkBytes, response.value(forHTTPHeaderField: "ETag") != nil
      {
        guard Auth.auth().currentUser?.uid == uid else { throw PostReadError.sessionChanged }
        return data
      }
    case 416:
      break
    default:
      throw PostReadError.invalidResponse
    }
    let file = try await download(source, uid: uid) { _ in }
    defer { try? FileManager.default.removeItem(at: file.url) }
    return try Data(contentsOf: file.url)
  }

  fileprivate static func download(_ source: String, uid: String?, progress: @escaping @Sendable (Double) -> Void) async throws -> DownloadedPostMedia {
    guard source.hasPrefix(prefix) else { throw PostReadError.invalidResponse }
    let path = String(source.dropFirst(prefix.count))
    let endpoint = try PostReadClient.mediaEndpoint(path: path)
    let appCheckToken = await AppCheckBootstrap.optionalTokenHeader()
    let session = makeSession()
    defer { session.invalidateAndCancel() }
    let headRequest = try await request(endpoint, method: "HEAD", uid: uid, appCheckToken: appCheckToken)
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
        var partRequest = try await request(endpoint, method: "GET", uid: uid, appCheckToken: appCheckToken)
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
  // Stored Sendable value: deinit cannot read the actor-isolated @Published getter.
  private var downloadedFileURL: URL?
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
    if let downloadedFileURL { try? FileManager.default.removeItem(at: downloadedFileURL) }
  }

  func cancel() {
    generation += 1
    pending?.cancel()
    pending = nil
    if let downloadedFileURL { try? FileManager.default.removeItem(at: downloadedFileURL) }
    downloadedFileURL = nil
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
      downloadedFileURL = result.url
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

/// A protected photo: shown at once when this session already downloaded it, otherwise loaded
/// through PostImageStore when the row appears, with a short fade.
private struct ProtectedPostImage: View {
  let source: String
  @State private var image: UIImage?
  @State private var failed = false

  init(source: String) {
    self.source = source
    _image = State(initialValue: PostImageStore.cached(source, uid: Self.currentUID))
  }

  private static var currentUID: String? {
    FirebaseApp.app() == nil ? nil : Auth.auth().currentUser?.uid
  }

  var body: some View {
    Group {
      if let image {
        Image(uiImage: image).resizable().scaledToFill().transition(.opacity)
      } else {
        VinctusTokens.Color.surface2.overlay {
          if failed {
            Image(systemName: "photo")
              .font(.title3)
              .foregroundStyle(VinctusTokens.Color.textMuted)
              .accessibilityLabel("Imagen no disponible")
          }
        }
      }
    }
    .animation(.easeOut(duration: 0.2), value: image == nil)
    .task(id: source) {
      let uid = Self.currentUID
      if let cached = PostImageStore.cached(source, uid: uid) {
        image = cached
        return
      }
      image = nil
      failed = false
      do {
        // Leaving the screen cancels only this wait; the download finishes into the cache.
        image = try await PostImageStore.shared.image(source, uid: uid)
      } catch {
        if !Task.isCancelled { failed = true }
      }
    }
  }
}

/// Decoded protected photos, kept in memory (never on disk). NSCache is thread-safe and also
/// empties itself under memory pressure.
final class PostImageMemory: @unchecked Sendable {
  static let shared = PostImageMemory()
  private let cache = NSCache<NSString, UIImage>()

  init(costLimit: Int = 120 * 1024 * 1024) {
    cache.totalCostLimit = costLimit
  }

  func image(forKey key: String) -> UIImage? { cache.object(forKey: key as NSString) }

  func store(_ image: UIImage, forKey key: String) {
    let pixels = image.size.width * image.scale * image.size.height * image.scale
    cache.setObject(image, forKey: key as NSString, cost: Int(pixels * 4))
  }

  func removeAll() { cache.removeAllObjects() }
}

/// Protected post photos downloaded once per session and account, shared by Discover, the feed
/// and the post. At most three downloads run at a time: every request wakes the media function,
/// and a burst of parallel requests starts several cold instances at once.
actor PostImageStore {
  static let shared = PostImageStore()
  static let maxParallelDownloads = 3
  /// Long side of the decoded bitmap: sharp on any iPhone and far lighter than a full photo.
  static let maxPixelSize: CGFloat = 1600

  private let memory: PostImageMemory
  private let fetch: @Sendable (String, String?) async throws -> Data
  private var scopeUID: String?
  private var inFlight: [String: Task<UIImage, Error>] = [:]
  private var running = 0
  private var waiting: [CheckedContinuation<Void, Never>] = []

  init(
    memory: PostImageMemory = .shared,
    fetch: @escaping @Sendable (String, String?) async throws -> Data = { source, uid in
      try await PostMediaDownload.imageData(source, uid: uid)
    }
  ) {
    self.memory = memory
    self.fetch = fetch
  }

  static func key(_ source: String, uid: String?) -> String { "\(uid ?? "")\n\(source)" }

  /// The photo when this account already downloaded it in this session.
  static func cached(_ source: String, uid: String?) -> UIImage? {
    PostImageMemory.shared.image(forKey: key(source, uid: uid))
  }

  func image(_ source: String, uid: String?) async throws -> UIImage {
    if scopeUID != uid {
      memory.removeAll()
      inFlight.removeAll()
      scopeUID = uid
    }
    let key = Self.key(source, uid: uid)
    if let hit = memory.image(forKey: key) { return hit }
    if let pending = inFlight[key] { return try await pending.value }

    let fetch = self.fetch
    let task = Task<UIImage, Error> {
      await acquire()
      defer { release() }
      return try await Self.load(source, uid: uid, fetch: fetch)
    }
    inFlight[key] = task
    do {
      let image = try await task.value
      if inFlight[key] == task { inFlight[key] = nil }
      if scopeUID == uid { memory.store(image, forKey: key) }
      return image
    } catch {
      if inFlight[key] == task { inFlight[key] = nil }
      throw error
    }
  }

  /// Download and decode away from the actor, so other photos are not held up meanwhile.
  private static func load(
    _ source: String,
    uid: String?,
    fetch: @Sendable (String, String?) async throws -> Data
  ) async throws -> UIImage {
    let data = try await fetch(source, uid)
    guard let image = decode(data) else { throw PostReadError.invalidResponse }
    return image
  }

  /// Decodes at most `maxPixelSize` on the long side (never upscales), applying the EXIF
  /// orientation, so a 12-megapixel photo does not take 48 MB of memory.
  static func decode(_ data: Data, maxPixelSize: CGFloat = PostImageStore.maxPixelSize) -> UIImage? {
    let sourceOptions = [kCGImageSourceShouldCache: false] as CFDictionary
    guard let source = CGImageSourceCreateWithData(data as CFData, sourceOptions) else { return nil }
    let options: [CFString: Any] = [
      kCGImageSourceCreateThumbnailFromImageAlways: true,
      kCGImageSourceCreateThumbnailWithTransform: true,
      kCGImageSourceShouldCacheImmediately: true,
      kCGImageSourceThumbnailMaxPixelSize: maxPixelSize,
    ]
    guard let cgImage = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else {
      return nil
    }
    return UIImage(cgImage: cgImage)
  }

  private func acquire() async {
    if running < Self.maxParallelDownloads {
      running += 1
      return
    }
    await withCheckedContinuation { waiting.append($0) }
  }

  /// Hands the slot to the next waiting download, if any.
  private func release() {
    if waiting.isEmpty {
      running -= 1
    } else {
      waiting.removeFirst().resume()
    }
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

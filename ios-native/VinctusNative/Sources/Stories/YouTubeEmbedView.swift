import SwiftUI
import WebKit

/// Plays a YouTube video inline with YouTube's own embed player, like the web's story viewer.
/// The iframe is loaded from an HTML page whose base URL is the Vinctus site, because YouTube's
/// embeds need a referring page.
struct YouTubeEmbedView: UIViewRepresentable {
  let videoID: String

  func makeUIView(context: Context) -> WKWebView {
    let configuration = WKWebViewConfiguration()
    configuration.allowsInlineMediaPlayback = true
    configuration.mediaTypesRequiringUserActionForPlayback = []
    let webView = WKWebView(frame: .zero, configuration: configuration)
    webView.isOpaque = false
    webView.backgroundColor = .black
    webView.scrollView.isScrollEnabled = false
    return webView
  }

  func updateUIView(_ webView: WKWebView, context: Context) {
    guard context.coordinator.loadedVideoID != videoID else { return }
    context.coordinator.loadedVideoID = videoID
    webView.loadHTMLString(Self.html(videoID: videoID), baseURL: LegalConfig.apiBaseURL)
  }

  func makeCoordinator() -> Coordinator { Coordinator() }

  final class Coordinator {
    var loadedVideoID: String?
  }

  /// Only the characters of YouTube's video ids get into the page.
  static func html(videoID: String) -> String {
    let safeID = videoID.filter { $0.isASCII && ($0.isLetter || $0.isNumber || $0 == "-" || $0 == "_") }
    return """
    <!doctype html><html><head>
    <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
    <style>html,body{margin:0;height:100%;background:#000}iframe{position:absolute;inset:0;width:100%;height:100%;border:0}</style>
    </head><body>
    <iframe src="https://www.youtube-nocookie.com/embed/\(safeID)?playsinline=1&autoplay=1&rel=0"
      allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>
    </body></html>
    """
  }
}

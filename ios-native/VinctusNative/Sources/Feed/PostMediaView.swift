import SwiftUI

struct PostMediaView: View {
  let items: [PostMediaItem]
  var body: some View {
    ForEach(items) { item in
      if item.type == "video", let id = YouTubeLink.videoID(from: item.url),
        let url = URL(string: "https://www.youtube.com/watch?v=\(id)") {
        Link(destination: url) {
          Label("Ver en YouTube", systemImage: "play.rectangle")
            .padding(.vertical, 12)
        }
      } else {
        ChatAttachmentView(attachment: ChatAttachment(
          kind: item.type == "image" ? "image" : "file", url: item.url, path: item.path,
          fileName: item.fileName ?? (item.type == "image" ? "Foto" : item.type == "video" ? "Video" : "Documento"),
          contentType: item.contentType ?? (item.type == "image" ? "image/jpeg" : item.type == "video" ? "video/mp4" : "application/octet-stream"),
          size: item.size ?? 0))
        if item.type == "video", let url = URL(string: item.url), url.scheme == "https", url.host != nil {
          Link("Abrir video original", destination: url).font(.caption)
        }
      }
    }
  }
}

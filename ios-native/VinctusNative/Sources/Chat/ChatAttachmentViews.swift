import AVKit
import SwiftUI

struct ChatAttachmentView: View {
  let attachment: ChatAttachment
  @State private var isPresented = false

  var body: some View {
    if let url = attachment.remoteURL {
      if attachment.mediaKind == .document {
        Link(destination: url) {
          Label(attachment.fileName, systemImage: "doc")
            .font(.subheadline)
            .lineLimit(2)
            .padding(10)
        }
      } else {
        Button { isPresented = true } label: {
          if attachment.mediaKind == .image {
            AsyncImage(url: url) { phase in
              switch phase {
              case .success(let image): image.resizable().scaledToFit()
              case .failure: Label("Abrir foto", systemImage: "photo")
              default: ProgressView().frame(width: 180, height: 120)
              }
            }
            .frame(maxWidth: 250, maxHeight: 240)
            .clipShape(RoundedRectangle(cornerRadius: 12))
          } else {
            Label(attachment.mediaKind == .audio ? "Reproducir audio" : "Reproducir video",
                  systemImage: attachment.mediaKind == .audio ? "waveform.circle.fill" : "play.rectangle.fill")
              .font(.subheadline)
              .padding(12)
              .background(VinctusTokens.Color.surface2, in: RoundedRectangle(cornerRadius: 12))
          }
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Abrir \(attachment.label): \(attachment.fileName)")
        .sheet(isPresented: $isPresented) {
          ChatMediaPreview(url: url, kind: attachment.mediaKind, title: attachment.label)
        }
      }
    } else {
      Label("Adjunto no disponible", systemImage: "exclamationmark.triangle")
        .font(.footnote)
    }
  }
}

struct ChatMediaPreview: View {
  let url: URL
  let kind: ChatMediaKind
  let title: String
  @Environment(\.dismiss) private var dismiss
  @Environment(\.scenePhase) private var scenePhase
  @State private var player: AVPlayer?
  @State private var playerItem: AVPlayerItem?
  @State private var playbackError = false

  var body: some View {
    NavigationStack {
      Group {
        if kind == .image {
          if url.isFileURL, let image = UIImage(contentsOfFile: url.path) {
            Image(uiImage: image).resizable().scaledToFit()
          } else {
            AsyncImage(url: url) { phase in
              switch phase {
              case .success(let image): image.resizable().scaledToFit()
              case .failure: Text("No se pudo cargar la foto. Cierra e intenta de nuevo.")
              default: ProgressView()
              }
            }
          }
        } else if let player, let playerItem {
          VStack {
            VideoPlayer(player: player)
              .frame(minHeight: kind == .audio ? 160 : 300)
              .onReceive(playerItem.publisher(for: \.status)) { status in
                playbackError = status == .failed
              }
            if playbackError {
              Text("No se pudo reproducir este archivo. Cierra e intenta de nuevo.")
                .font(.footnote).foregroundStyle(.red).padding()
            }
          }
        } else { ProgressView() }
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      .background(VinctusTokens.Color.background)
      .navigationTitle(title)
      .navigationBarTitleDisplayMode(.inline)
      .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Cerrar") { dismiss() } } }
      .onAppear {
        if kind != .image {
          try? AVAudioSession.sharedInstance().setCategory(.playback)
          let item = AVPlayerItem(url: url)
          playerItem = item
          player = AVPlayer(playerItem: item)
        }
      }
      .onDisappear { player?.pause(); player = nil; playerItem = nil }
      .onChange(of: scenePhase) { _, phase in if phase != .active { player?.pause() } }
    }
  }
}

struct ChatPendingFilesView: View {
  let files: [ChatPendingAttachment]
  let remove: (String) -> Void
  @State private var preview: ChatPendingAttachment?

  var body: some View {
    ScrollView(.horizontal) {
      HStack {
        ForEach(files) { file in
          HStack(spacing: 8) {
            Button { preview = file } label: {
              VStack(alignment: .leading, spacing: 4) {
                Label(file.fileName, systemImage: file.kind == .image ? "photo" : file.kind == .audio ? "waveform" : "video")
                  .lineLimit(1)
                Text(ByteCountFormatter.string(fromByteCount: Int64(file.size), countStyle: .file))
                  .font(.caption)
              }
            }
            Button { remove(file.id) } label: { Image(systemName: "xmark.circle.fill") }
              .accessibilityLabel("Quitar \(file.fileName)")
          }
          .font(.subheadline)
          .padding(10)
          .background(VinctusTokens.Color.surface2, in: RoundedRectangle(cornerRadius: 12))
        }
      }
      .padding(.horizontal)
    }
    .sheet(item: $preview) { file in
      ChatMediaPreview(url: file.fileURL, kind: file.kind, title: file.fileName)
    }
  }
}

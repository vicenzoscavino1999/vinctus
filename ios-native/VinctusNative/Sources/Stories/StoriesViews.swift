import AVKit
import PhotosUI
import SwiftUI
import UIKit

// MARK: - State

@MainActor
final class StoriesViewModel: ObservableObject {
  @Published private(set) var groups: [StoryGroup] = []
  @Published private(set) var isLoading = false
  @Published private(set) var isPublishing = false
  @Published var errorMessage: String?
  /// Stories opened in this session, to dim the ring of people already seen (like the web).
  @Published private(set) var seenStoryIDs: Set<String> = []

  private let repo: StoriesRepo

  init(repo: StoriesRepo) {
    self.repo = repo
  }

  func load() async {
    isLoading = true
    defer { isLoading = false }
    do {
      groups = try await repo.fetchStoryGroups()
      errorMessage = nil
    } catch {
      errorMessage = "No se pudieron cargar las historias."
    }
  }

  func publish(_ image: UIImage) async -> Bool {
    guard let data = ImageEncoding.jpegData(image, maxSide: 1440) else {
      errorMessage = "No se pudo preparar la foto."
      return false
    }
    isPublishing = true
    defer { isPublishing = false }
    do {
      try await repo.publishImageStory(jpegData: data)
      await load()
      return true
    } catch {
      errorMessage = "No se pudo publicar la historia."
      return false
    }
  }

  func delete(_ story: Story) async {
    do {
      try await repo.deleteStory(story)
      await load()
    } catch {
      errorMessage = "No se pudo eliminar la historia."
    }
  }

  func markSeen(_ story: Story) {
    seenStoryIDs.insert(story.id)
  }

  func isSeen(_ group: StoryGroup) -> Bool {
    group.stories.allSatisfy { seenStoryIDs.contains($0.id) }
  }
}

// MARK: - Bar

/// Row of story circles, like the web's StoriesWidget: "Tu historia" first, then friends and
/// followed people. Shown on the Comunidad tab and on your own profile.
struct StoriesBar: View {
  @EnvironmentObject private var authVM: AuthViewModel
  @EnvironmentObject private var blockedUsers: BlockedUsersStore
  @StateObject private var vm: StoriesViewModel
  @State private var viewer: StoryViewerStart?
  @State private var photoItem: PhotosPickerItem?
  @State private var draftPhoto: StoryDraft?

  init(repo: StoriesRepo = AppRepos.stories()) {
    _vm = StateObject(wrappedValue: StoriesViewModel(repo: repo))
  }

  private var visibleGroups: [StoryGroup] {
    vm.groups.filter { !blockedUsers.isBlocked($0.ownerID) }
  }

  private var ownGroup: StoryGroup? {
    visibleGroups.first { $0.ownerID == authVM.currentUserID }
  }

  private var otherGroups: [StoryGroup] {
    visibleGroups.filter { $0.ownerID != authVM.currentUserID }
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack {
        Text("HISTORIAS")
          .font(VinctusTokens.Typography.serif(14))
          .tracking(4)
          .foregroundStyle(VinctusTokens.Color.textMuted)
        Spacer()
        if let error = vm.errorMessage {
          Text(error)
            .font(.caption)
            .foregroundStyle(.red)
            .lineLimit(1)
        }
      }

      ScrollView(.horizontal, showsIndicators: false) {
        HStack(alignment: .top, spacing: 14) {
          ownCircle
          if vm.isLoading && vm.groups.isEmpty {
            ForEach(0..<4, id: \.self) { _ in
              Circle()
                .fill(VinctusTokens.Color.surface2)
                .frame(width: 64, height: 64)
            }
          }
          ForEach(otherGroups) { group in
            Button {
              open(group)
            } label: {
              StoryCircle(
                name: group.ownerName,
                photoURL: group.ownerPhotoURL,
                label: group.isYouTubeShorts
                  ? group.ownerName
                  : (group.ownerName.components(separatedBy: " ").first ?? group.ownerName),
                isUnseen: !vm.isSeen(group)
              )
            }
            .buttonStyle(.plain)
          }
        }
        .padding(.vertical, 2)
      }
    }
    .task {
      await vm.load()
      // Screenshot builds open the first story of a kind with `-VinctusOpenStory shorts|people`.
      if let kind = AppRepos.demoArgument("-VinctusOpenStory"),
        let group = otherGroups.first(where: { $0.isYouTubeShorts == (kind == "shorts") })
      {
        open(group)
      }
    }
    .onChange(of: photoItem) { _, item in
      guard let item else { return }
      Task {
        if let data = try? await item.loadTransferable(type: Data.self), let image = UIImage(data: data) {
          draftPhoto = StoryDraft(image: image)
        } else {
          vm.errorMessage = "No se pudo leer la imagen."
        }
        photoItem = nil
      }
    }
    .sheet(item: $draftPhoto) { draft in
      StoryComposerSheet(draft: draft, vm: vm)
    }
    .fullScreenCover(item: $viewer) { start in
      StoryViewer(groups: visibleGroups, start: start, vm: vm)
    }
  }

  private var ownCircle: some View {
    ZStack(alignment: .bottomTrailing) {
      Button {
        if let ownGroup { open(ownGroup) }
      } label: {
        StoryCircle(
          name: "Tú",
          photoURL: ownGroup?.ownerPhotoURL,
          label: "Tu historia",
          isUnseen: ownGroup.map { !vm.isSeen($0) } ?? false
        )
      }
      .buttonStyle(.plain)
      .disabled(ownGroup == nil)

      PhotosPicker(selection: $photoItem, matching: .images) {
        Image(systemName: vm.isPublishing ? "hourglass" : "plus")
          .font(.system(size: 12, weight: .bold))
          .foregroundStyle(.black)
          .frame(width: 24, height: 24)
          .background(VinctusTokens.Color.accent)
          .clipShape(Circle())
          .overlay(Circle().stroke(VinctusTokens.Color.background, lineWidth: 2))
      }
      .disabled(vm.isPublishing)
      .accessibilityLabel("Agregar historia")
      .offset(x: 2, y: -24)
    }
  }

  private func open(_ group: StoryGroup) {
    guard let index = visibleGroups.firstIndex(where: { $0.ownerID == group.ownerID }) else { return }
    viewer = StoryViewerStart(groupIndex: index)
  }
}

/// A story bubble like the web's StoriesWidget: photo in a circle with an amber ring while
/// there is something new to watch, a gray one once seen.
private struct StoryCircle: View {
  let name: String
  let photoURL: String?
  let label: String
  let isUnseen: Bool

  var body: some View {
    VStack(spacing: 8) {
      AvatarView(name: name, photoURLString: photoURL, size: 64)
        .overlay(
          Circle()
            .stroke(isUnseen ? VinctusTokens.Color.accentBright : SwiftUI.Color(white: 0.25), lineWidth: 2)
        )
      Text(label)
        .font(.caption)
        .foregroundStyle(SwiftUI.Color(white: 0.83))
        .lineLimit(1)
        .truncationMode(.tail)
        .frame(width: 80)
    }
  }
}

// MARK: - Composer

private struct StoryDraft: Identifiable {
  let id = UUID()
  let image: UIImage
}

private struct StoryComposerSheet: View {
  let draft: StoryDraft
  @ObservedObject var vm: StoriesViewModel
  @Environment(\.dismiss) private var dismiss

  var body: some View {
    NavigationStack {
      VStack(spacing: VinctusTokens.Spacing.md) {
        Image(uiImage: draft.image)
          .resizable()
          .scaledToFit()
          .clipShape(RoundedRectangle(cornerRadius: VinctusTokens.Radius.lg, style: .continuous))
          .frame(maxHeight: .infinity)
        Text("La verán tus amigos y las personas que te siguen durante 24 horas.")
          .font(.footnote)
          .foregroundStyle(VinctusTokens.Color.textMuted)
          .multilineTextAlignment(.center)
        VButton(vm.isPublishing ? "Publicando…" : "Publicar historia") {
          Task {
            if await vm.publish(draft.image) { dismiss() }
          }
        }
        .disabled(vm.isPublishing)
      }
      .padding(VinctusTokens.Spacing.lg)
      .background(VinctusTokens.Color.background)
      .navigationTitle("Nueva historia")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("Cancelar") { dismiss() }
        }
      }
    }
  }
}

// MARK: - Viewer

struct StoryViewerStart: Identifiable {
  let groupIndex: Int
  var id: Int { groupIndex }
}

/// Story player shown as a card over the screen, like the web's StoryViewerModal: tap the right
/// side for the next story and the left side for the previous one, swipe down or ✕ to close.
/// Photos stay 5 seconds, videos play to the end, and YouTube Shorts wait for the person.
private struct StoryViewer: View {
  let groups: [StoryGroup]
  @ObservedObject var vm: StoriesViewModel

  @EnvironmentObject private var authVM: AuthViewModel
  @Environment(\.dismiss) private var dismiss
  @State private var groupIndex: Int
  @State private var storyIndex = 0
  @State private var progress: Double = 0
  @State private var isPaused = false
  @State private var isConfirmingDelete = false
  @State private var player: AVPlayer?

  private static let photoDuration: Double = 5
  private static let tick: Double = 0.05

  init(groups: [StoryGroup], start: StoryViewerStart, vm: StoriesViewModel) {
    self.groups = groups
    self.vm = vm
    _groupIndex = State(initialValue: min(start.groupIndex, max(groups.count - 1, 0)))
  }

  private var group: StoryGroup? { groups.indices.contains(groupIndex) ? groups[groupIndex] : nil }

  private var story: Story? {
    guard let group, group.stories.indices.contains(storyIndex) else { return nil }
    return group.stories[storyIndex]
  }

  private var isOwnStory: Bool { story?.ownerID == authVM.currentUserID }

  var body: some View {
    ZStack {
      SwiftUI.Color.black.opacity(0.85)
        .ignoresSafeArea()
        .onTapGesture { dismiss() }

      if let story {
        VStack(spacing: 0) {
          progressBars
            .padding(.horizontal, 16)
            .padding(.top, 14)
          header(story)
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
          Rectangle()
            .fill(VinctusTokens.Color.border)
            .frame(height: 0.5)
          ZStack {
            SwiftUI.Color.black
            media(story)
            if !story.isYouTubeShort {
              tapZones
            }
          }
          .frame(maxWidth: .infinity, maxHeight: .infinity)
          if story.isYouTubeShort {
            navigationRow
          }
        }
        .background(VinctusTokens.Color.surface)
        .clipShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
        .overlay(
          RoundedRectangle(cornerRadius: 28, style: .continuous)
            .stroke(VinctusTokens.Color.border, lineWidth: 1)
        )
        .padding(.horizontal, 14)
        .padding(.vertical, 24)
      }
    }
    .presentationBackground(.clear)
    .gesture(
      DragGesture(minimumDistance: 30).onEnded { value in
        if value.translation.height > 80 { dismiss() }
      }
    )
    .confirmationDialog("¿Eliminar esta historia?", isPresented: $isConfirmingDelete, titleVisibility: .visible) {
      Button("Eliminar", role: .destructive) {
        guard let story else { return }
        Task {
          await vm.delete(story)
          dismiss()
        }
      }
    }
    .onChange(of: isConfirmingDelete) { _, showing in isPaused = showing }
    .task(id: story?.id) { await play() }
    .onDisappear { player?.pause() }
  }

  @ViewBuilder
  private func media(_ story: Story) -> some View {
    if let videoID = story.youtubeVideoID {
      YouTubeEmbedView(videoID: videoID)
    } else {
      switch story.mediaType {
      case .image:
        AsyncImage(url: URL(string: story.mediaURL)) { phase in
          switch phase {
          case .success(let image):
            image.resizable().scaledToFit()
          case .failure:
            Label("No se pudo cargar la historia", systemImage: "exclamationmark.triangle")
              .foregroundStyle(.white)
          default:
            ProgressView().tint(.white)
          }
        }
      case .video:
        if let player {
          VideoPlayer(player: player)
            .disabled(true)
        } else {
          ProgressView().tint(.white)
        }
      }
    }
  }

  private var tapZones: some View {
    HStack(spacing: 0) {
      SwiftUI.Color.clear
        .contentShape(Rectangle())
        .onTapGesture { previous() }
      SwiftUI.Color.clear
        .contentShape(Rectangle())
        .onTapGesture { next() }
    }
  }

  /// YouTube handles taps itself, so Shorts get arrows under the video instead of tap zones.
  private var navigationRow: some View {
    HStack {
      Button(action: previous) {
        Image(systemName: "chevron.left")
          .frame(width: 44, height: 44)
      }
      .accessibilityLabel("Historia anterior")
      Spacer()
      Button(action: next) {
        Image(systemName: "chevron.right")
          .frame(width: 44, height: 44)
      }
      .accessibilityLabel("Historia siguiente")
    }
    .font(.headline)
    .foregroundStyle(VinctusTokens.Color.textPrimary)
    .padding(.horizontal, 12)
    .padding(.vertical, 4)
  }

  private var progressBars: some View {
    HStack(spacing: 4) {
      ForEach(Array((group?.stories ?? []).enumerated()), id: \.element.id) { index, _ in
        GeometryReader { proxy in
          ZStack(alignment: .leading) {
            Capsule().fill(SwiftUI.Color.white.opacity(0.2))
            Capsule()
              .fill(SwiftUI.Color.white.opacity(0.85))
              .frame(width: proxy.size.width * fill(for: index))
          }
        }
        .frame(height: 3)
      }
    }
  }

  private func fill(for index: Int) -> CGFloat {
    if index < storyIndex { return 1 }
    if index > storyIndex { return 0 }
    return CGFloat(min(max(progress, 0), 1))
  }

  private func header(_ story: Story) -> some View {
    HStack(spacing: 12) {
      AvatarView(name: group?.ownerName ?? "", photoURLString: group?.ownerPhotoURL, size: 40)
      VStack(alignment: .leading, spacing: 2) {
        Text(isOwnStory ? "Tu historia" : (group?.ownerName ?? "Usuario"))
          .font(.subheadline.weight(.medium))
          .foregroundStyle(VinctusTokens.Color.textPrimary)
          .lineLimit(1)
        Text(Self.relativeTime(story.createdAt))
          .font(.caption)
          .foregroundStyle(VinctusTokens.Color.textMuted)
      }
      Spacer()
      if isOwnStory {
        Button {
          isConfirmingDelete = true
        } label: {
          Image(systemName: "trash")
            .foregroundStyle(VinctusTokens.Color.textSecondary)
            .frame(width: 36, height: 36)
        }
        .accessibilityLabel("Eliminar historia")
      } else if !story.isYouTubeShort {
        ModerationMenu(
          target: .story(storyID: story.id, ownerID: story.ownerID),
          authorID: story.ownerID,
          authorName: group?.ownerName ?? "esta persona",
          onBlocked: { dismiss() }
        )
        .foregroundStyle(VinctusTokens.Color.textSecondary)
        .simultaneousGesture(TapGesture().onEnded { isPaused = true })
      }
      Button {
        dismiss()
      } label: {
        Image(systemName: "xmark")
          .font(.system(size: 17, weight: .light))
          .foregroundStyle(VinctusTokens.Color.textPrimary)
          .frame(width: 36, height: 36)
      }
      .accessibilityLabel("Cerrar")
    }
  }

  /// "Hace 2 h", like the web viewer.
  static func relativeTime(_ date: Date, now: Date = Date()) -> String {
    let minutes = max(Int(now.timeIntervalSince(date) / 60), 0)
    if minutes < 1 { return "Ahora" }
    if minutes < 60 { return "Hace \(minutes) min" }
    return "Hace \(minutes / 60) h"
  }

  /// Advances the progress bar; photos last `photoDuration`, videos their own length. YouTube
  /// Shorts don't advance on their own: the person is watching or controlling the video.
  private func play() async {
    guard let story else { return }
    vm.markSeen(story)
    progress = 0
    player?.pause()
    player = nil
    if story.isYouTubeShort { return }

    var duration = Self.photoDuration
    if story.mediaType == .video, let url = URL(string: story.mediaURL) {
      let item = AVPlayerItem(url: url)
      let newPlayer = AVPlayer(playerItem: item)
      player = newPlayer
      newPlayer.play()
      if let seconds = try? await item.asset.load(.duration).seconds, seconds.isFinite, seconds > 0 {
        duration = min(seconds, 60)
      } else {
        duration = 15
      }
    }

    while progress < 1 {
      try? await Task.sleep(nanoseconds: UInt64(Self.tick * 1_000_000_000))
      if Task.isCancelled { return }
      if isPaused { continue }
      progress += Self.tick / duration
    }
    next()
  }

  private func next() {
    isPaused = false
    guard let group else { return dismiss() }
    if storyIndex + 1 < group.stories.count {
      storyIndex += 1
    } else if groupIndex + 1 < groups.count {
      groupIndex += 1
      storyIndex = 0
    } else {
      dismiss()
    }
  }

  private func previous() {
    isPaused = false
    if storyIndex > 0 {
      storyIndex -= 1
    } else if groupIndex > 0 {
      groupIndex -= 1
      storyIndex = max((groups[groupIndex].stories.count) - 1, 0)
    } else {
      // Already at the very first story: start it over (the running timer keeps going).
      progress = 0
    }
  }
}

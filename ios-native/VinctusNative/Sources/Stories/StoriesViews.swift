import PhotosUI
import SwiftUI
import UIKit

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

import SwiftUI
import UIKit

/// The full feed. Since the bottom bar matches the web's, it opens from "Ver todo" in Descubrir's
/// "Publicaciones", pushed with a back button; Descubrir already shows the stories above it.
struct FeedView: View {
  @StateObject private var vm: FeedViewModel
  @EnvironmentObject private var blockedUsers: BlockedUsersStore
  @State private var openedPost: FeedItem?
  @State private var openedProfileID: String?
  @State private var openedGroupID: String?
  private let profileRepo: ProfileRepo
  private let commentsRepo: any PostCommentsRepo
  private let isPushed: Bool

  init(repo: FeedRepo, profileRepo: ProfileRepo, isPushed: Bool = true) {
    self.profileRepo = profileRepo
    self.commentsRepo = AppRepos.postComments()
    self.isPushed = isPushed
    _vm = StateObject(wrappedValue: FeedViewModel(repo: repo))
  }

  var body: some View {
    if isPushed {
      feedList
        .navigationTitle("Publicaciones")
        .navigationBarTitleDisplayMode(.inline)
    } else {
      feedList
        .vinctusTopBar()
    }
  }

  private var feedList: some View {
    List {
      if !isPushed {
        Section {
          StoriesBar()
        }
        .listRowSeparator(.hidden)
        .listRowBackground(SwiftUI.Color.clear)
      }

      if vm.isShowingCachedData {
        VCard {
          HStack(spacing: 8) {
            Image(systemName: "externaldrive.badge.clock")
              .foregroundStyle(VinctusTokens.Color.accent)
            Text("Mostrando cache local. Desliza para refrescar.")
              .font(.footnote)
              .foregroundStyle(VinctusTokens.Color.textMuted)
          }
        }
        .listRowSeparator(.hidden)
        .listRowBackground(SwiftUI.Color.clear)
      }

      if vm.items.isEmpty, vm.isInitialLoading {
        feedSkeletonRows
      } else if vm.items.isEmpty, let error = vm.errorMessage {
        VCard {
          VStack(alignment: .leading, spacing: VinctusTokens.Spacing.sm) {
            Text("No se pudo cargar el feed")
              .font(.headline)
              .foregroundStyle(VinctusTokens.Color.textPrimary)
            Text(error)
              .font(.footnote)
              .foregroundStyle(VinctusTokens.Color.textMuted)

            VButton("Reintentar", variant: .secondary) {
              Task {
                await vm.refresh()
              }
            }
          }
        }
        .listRowSeparator(.hidden)
        .listRowBackground(SwiftUI.Color.clear)
      } else if vm.items.isEmpty {
        VCard {
          VStack(alignment: .leading, spacing: 6) {
            Text("Tu feed está vacío")
              .font(.headline)
              .foregroundStyle(VinctusTokens.Color.textPrimary)
            Text("Cuando haya publicaciones recientes, aparecerán aquí.")
              .font(.footnote)
              .foregroundStyle(VinctusTokens.Color.textMuted)
            if vm.canLoadMore {
              VButton(vm.isLoadingMore ? "Cargando…" : "Cargar más publicaciones", variant: .secondary) {
                vm.triggerLoadMoreFromFooter()
              }
              .disabled(vm.isLoadingMore)
            }
          }
        }
        .listRowSeparator(.hidden)
        .listRowBackground(SwiftUI.Color.clear)
      } else {
        ForEach(vm.items.filter { !blockedUsers.isBlocked($0.authorID) }) { item in
          // Edge to edge, like Instagram: the photo spans the whole width.
          FeedCard(
            item: item,
            onOpen: { openedPost = item },
            onOpenProfile: item.authorID.map { id in { openedProfileID = id } },
            onOpenGroup: item.groupID.map { id in { openedGroupID = id } }
          )
            .listRowInsets(EdgeInsets())
            .listRowSeparator(.hidden)
            .listRowBackground(SwiftUI.Color.clear)
            .onAppear {
              vm.loadMoreIfNeeded(currentItem: item)
            }
        }

        if vm.canLoadMore {
          HStack(spacing: 10) {
            if vm.isLoadingMore {
              ProgressView()
                .controlSize(.small)
              Text("Cargando más publicaciones…")
                .font(.footnote)
                .foregroundStyle(VinctusTokens.Color.textMuted)
            } else {
              Text("Desliza para cargar más")
                .font(.footnote)
                .foregroundStyle(VinctusTokens.Color.textMuted)
            }
          }
          .frame(maxWidth: .infinity, alignment: .center)
          .padding(.vertical, VinctusTokens.Spacing.sm)
          .onAppear {
            vm.triggerLoadMoreFromFooter()
          }
          .listRowSeparator(.hidden)
          .listRowBackground(SwiftUI.Color.clear)
        } else {
          Text("No hay más publicaciones por ahora.")
            .font(.footnote)
            .foregroundStyle(VinctusTokens.Color.textMuted)
            .frame(maxWidth: .infinity, alignment: .center)
            .listRowSeparator(.hidden)
            .listRowBackground(SwiftUI.Color.clear)
        }

        if let loadMoreError = vm.loadMoreErrorMessage {
          VCard {
            VStack(alignment: .leading, spacing: VinctusTokens.Spacing.sm) {
              Text(loadMoreError)
                .font(.footnote)
                .foregroundStyle(.red)

              VButton("Reintentar carga", variant: .secondary) {
                vm.retryLoadMore()
              }
            }
          }
          .listRowSeparator(.hidden)
          .listRowBackground(SwiftUI.Color.clear)
        }

        if let error = vm.errorMessage {
          Text(error)
            .font(.footnote)
            .foregroundStyle(VinctusTokens.Color.accent)
            .listRowSeparator(.hidden)
            .listRowBackground(SwiftUI.Color.clear)
        }
      }
    }
    .listStyle(.plain)
    .scrollContentBackground(.hidden)
    .background(VinctusTokens.Color.background)
    .navigationDestination(item: $openedPost) { item in
      PostDetailView(
        item: item,
        profileRepo: profileRepo,
        commentsRepo: commentsRepo,
        onCommentCountChange: { newCount in vm.updateCommentCount(postID: item.id, newCount: newCount) }
      )
    }
    .navigationDestination(item: $openedProfileID) { userID in
      ProfileView(repo: profileRepo, userID: userID)
    }
    .navigationDestination(item: $openedGroupID) { groupID in
      GroupView(repo: AppRepos.groups(), groupID: groupID, profileRepo: profileRepo)
    }
    .task {
      await vm.refresh()
    }
    // Screenshot builds open a post with `-VinctusOpenPost <id>`.
    .onChange(of: vm.items.count) { _, _ in
      if openedPost == nil, let id = AppRepos.demoArgument("-VinctusOpenPost") {
        openedPost = vm.items.first { $0.id == id }
      }
    }
    .onReceive(NotificationCenter.default.publisher(for: .vinctusPostPublished)) { _ in
      Task { await vm.refresh() }
    }
    .refreshable {
      await vm.refresh()
    }
  }

  @ViewBuilder
  private var feedSkeletonRows: some View {
    ForEach(0..<4, id: \.self) { _ in
      VCard {
        VStack(alignment: .leading, spacing: 10) {
          HStack {
            RoundedRectangle(cornerRadius: 4, style: .continuous)
              .fill(SwiftUI.Color.gray.opacity(0.25))
              .frame(width: 120, height: 14)
            Spacer()
            RoundedRectangle(cornerRadius: 4, style: .continuous)
              .fill(SwiftUI.Color.gray.opacity(0.2))
              .frame(width: 64, height: 12)
          }
          RoundedRectangle(cornerRadius: 4, style: .continuous)
            .fill(SwiftUI.Color.gray.opacity(0.2))
            .frame(height: 14)
          RoundedRectangle(cornerRadius: 4, style: .continuous)
            .fill(SwiftUI.Color.gray.opacity(0.16))
            .frame(width: 220, height: 14)
        }
      }
      .redacted(reason: .placeholder)
      .listRowSeparator(.hidden)
    }
  }
}

/// A post laid out like Instagram, with the same anatomy as the web's FeedPostCard: header, the
/// photo edge to edge, one row of actions, caption and comments. A double tap on the photo likes
/// the post (never unlikes it) with a heart burst and a haptic; a single tap opens it.
private struct FeedCard: View {
  let item: FeedItem
  let onOpen: () -> Void
  var onOpenProfile: (() -> Void)?
  var onOpenGroup: (() -> Void)?

  @State private var likeTrigger = 0
  @State private var heartScale: CGFloat = 0.3
  @State private var heartOpacity: Double = 0

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      header
      if let preview = item.previewImageURL {
        media(preview)
      } else {
        textBody
      }
      actions
      footer
    }
    .overlay(alignment: .bottom) {
      Rectangle()
        .fill(VinctusTokens.Color.border.opacity(0.5))
        .frame(height: 0.5)
    }
  }

  private var header: some View {
    PostAuthorHeader(
      authorID: item.authorID,
      authorName: item.authorName,
      groupID: item.groupID,
      createdAt: item.createdAt,
      onOpenProfile: onOpenProfile,
      onOpenGroup: onOpenGroup
    ) {
      ModerationMenu(
        target: .post(postID: item.id, authorID: item.authorID),
        authorID: item.authorID,
        authorName: item.authorName
      )
    }
    .padding(.horizontal, 14)
    .padding(.vertical, 10)
  }

  private func media(_ preview: String) -> some View {
    SwiftUI.Color.clear
      .aspectRatio(1, contentMode: .fit)
      .overlay { PostImageView(source: preview) }
      .clipped()
      .overlay {
        if item.hasVideo {
          Image(systemName: "play.fill")
            .font(.title2)
            .foregroundStyle(.white)
            .frame(width: 56, height: 56)
            .background(SwiftUI.Color.black.opacity(0.5), in: Circle())
        }
      }
      .overlay {
        Image(systemName: "heart.fill")
          .font(.system(size: 92))
          .foregroundStyle(.white)
          .shadow(color: .black.opacity(0.35), radius: 16, y: 4)
          .scaleEffect(heartScale)
          .opacity(heartOpacity)
          .allowsHitTesting(false)
      }
      .contentShape(Rectangle())
      .onTapGesture(count: 2, perform: likeFromPhoto)
      .onTapGesture(perform: onOpen)
      .accessibilityElement(children: .ignore)
      .accessibilityLabel(item.hasVideo ? "Video de la publicación" : "Foto de la publicación")
      .accessibilityAddTraits(.isButton)
      .accessibilityAction { onOpen() }
      .accessibilityAction(named: "Me gusta") { likeTrigger += 1 }
  }

  private var textBody: some View {
    VStack(alignment: .leading, spacing: 6) {
      if let title = item.title {
        Text(title)
          .font(VinctusTokens.Typography.serif(22))
          .foregroundStyle(VinctusTokens.Color.textPrimary)
      }
      if !item.text.isEmpty {
        Text(item.text)
          .font(.body)
          .lineLimit(8)
          .foregroundStyle(VinctusTokens.Color.textPrimary)
      }
      if item.hasVideo { Label("Video adjunto", systemImage: "play.rectangle").font(.caption) }
      if let name = item.fileName { Label(name, systemImage: "doc").font(.caption).lineLimit(1) }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(.horizontal, 14)
    .padding(.bottom, 2)
    .contentShape(Rectangle())
    .onTapGesture(perform: onOpen)
  }

  // Same order as the web: like, comments, save.
  private var actions: some View {
    HStack(spacing: 18) {
      PostReactionButton(postID: item.id, initialCount: item.likeCount, selectTrigger: likeTrigger)
        .font(.title3)
      Button(action: onOpen) {
        Image(systemName: "bubble.left")
          .font(.title3)
          .foregroundStyle(VinctusTokens.Color.textPrimary)
      }
      .buttonStyle(.borderless)
      .accessibilityLabel(item.commentCount == 1 ? "1 comentario" : "\(item.commentCount) comentarios")
      Spacer()
      PostReactionButton(postID: item.id, kind: .save)
        .font(.title3)
        .labelStyle(.iconOnly)
    }
    .padding(.horizontal, 14)
    .padding(.top, 10)
  }

  private var footer: some View {
    VStack(alignment: .leading, spacing: 4) {
      if item.previewImageURL != nil, let caption = captionText {
        (Text(item.authorName).fontWeight(.semibold) + Text("  \(caption)"))
          .font(.subheadline)
          .foregroundStyle(VinctusTokens.Color.textPrimary)
          .lineLimit(2)
          .onTapGesture(perform: onOpen)
      }
      Button(action: onOpen) {
        Text(commentsLine)
          .font(.subheadline)
          .foregroundStyle(VinctusTokens.Color.textMuted)
      }
      .buttonStyle(.borderless)
    }
    .padding(.horizontal, 14)
    .padding(.top, 6)
    .padding(.bottom, 14)
  }

  private var captionText: String? {
    let parts = [item.title, item.text.isEmpty ? nil : item.text].compactMap { $0 }
    return parts.isEmpty ? nil : parts.joined(separator: " · ")
  }

  private var commentsLine: String {
    switch item.commentCount {
    case 0: return "Añadir un comentario…"
    case 1: return "Ver el comentario"
    default: return "Ver los \(item.commentCount) comentarios"
    }
  }

  private func likeFromPhoto() {
    UIImpactFeedbackGenerator(style: .medium).impactOccurred()
    likeTrigger += 1
    heartScale = 0.3
    heartOpacity = 1
    withAnimation(.spring(response: 0.32, dampingFraction: 0.55)) { heartScale = 1 }
    withAnimation(.easeOut(duration: 0.3).delay(0.65)) { heartOpacity = 0 }
  }
}


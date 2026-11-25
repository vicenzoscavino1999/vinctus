import SwiftUI

/// The full feed. Since the bottom bar matches the web's, it opens from "Ver todo" in Descubrir's
/// "Publicaciones", pushed with a back button; Descubrir already shows the stories above it.
struct FeedView: View {
  @StateObject private var vm: FeedViewModel
  @EnvironmentObject private var blockedUsers: BlockedUsersStore
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
          FeedCard(
            item: item,
            profileRepo: profileRepo,
            commentsRepo: commentsRepo,
            onCommentCountChanged: { newCount in
              vm.updateCommentCount(postID: item.id, newCount: newCount)
            }
          )
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
    .task {
      await vm.refresh()
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

private struct FeedCard: View {
  let item: FeedItem
  let profileRepo: ProfileRepo
  let commentsRepo: any PostCommentsRepo
  let onCommentCountChanged: (Int) -> Void

  var body: some View {
    VCard {
      VStack(alignment: .leading, spacing: VinctusTokens.Spacing.sm) {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
          Text(item.authorName)
            .font(.headline)
            .foregroundStyle(VinctusTokens.Color.textPrimary)

          if let createdAt = item.createdAt {
            Text(createdAt, style: .relative)
              .font(.caption)
              .foregroundStyle(VinctusTokens.Color.textMuted)
          }

          Spacer()

          ModerationMenu(
            target: .post(postID: item.id, authorID: item.authorID),
            authorID: item.authorID,
            authorName: item.authorName
          )
        }

        if let title = item.title {
          Text(title).font(.headline)
        }
        if !item.text.isEmpty {
          Text(item.text)
            .font(.body)
            .lineLimit(6)
            .multilineTextAlignment(.leading)
            .foregroundStyle(VinctusTokens.Color.textPrimary)
        }

        if item.previewImageURL == nil {
          if item.hasVideo { Label("Video adjunto", systemImage: "play.rectangle").font(.caption) }
          if let name = item.fileName { Label(name, systemImage: "doc").font(.caption).lineLimit(1) }
        }

        if let preview = item.previewImageURL {
          SwiftUI.Color.clear
            .aspectRatio(4 / 3, contentMode: .fit)
            .overlay {
              PostImageView(source: preview)
            }
            .overlay {
              if item.hasVideo {
                Image(systemName: "play.fill")
                  .font(.title2)
                  .foregroundStyle(.white)
                  .frame(width: 56, height: 56)
                  .background(SwiftUI.Color.black.opacity(0.5))
                  .clipShape(Circle())
              }
            }
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        }

        // Same order as the web's post card: like, comments, save. The whole card opens the post.
        HStack(spacing: 16) {
          PostReactionButton(postID: item.id, initialCount: item.likeCount)
            .font(.subheadline)

          Label("\(item.commentCount)", systemImage: "bubble.left")
            .font(.subheadline)
            .foregroundStyle(VinctusTokens.Color.textMuted)
            .accessibilityLabel(item.commentCount == 1 ? "1 comentario" : "\(item.commentCount) comentarios")

          PostReactionButton(postID: item.id, kind: .save)
            .font(.subheadline)
            .labelStyle(.iconOnly)

          Spacer()

          Image(systemName: "chevron.right")
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(VinctusTokens.Color.textMuted)
            .accessibilityHidden(true)
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    }
    // A hidden link makes the card open the post without List adding a second disclosure arrow
    // (same trick as Descubrir's AI card). The like and save buttons keep their own taps.
    .background(
      NavigationLink(
        destination: PostDetailView(
          item: item,
          profileRepo: profileRepo,
          commentsRepo: commentsRepo,
          onCommentCountChange: onCommentCountChanged
        )
      ) { EmptyView() }
        .opacity(0)
    )
  }
}


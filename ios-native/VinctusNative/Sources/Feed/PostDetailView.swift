import SwiftUI

/// A post in full with its comments under it, like the web's post page (`/post/:id`): who and
/// where, the photos (a carousel when there are several), videos and files, the actions, the
/// title and text, then the comments with a compact composer.
struct PostDetailView: View {
  private let item: FeedItem
  private let profileRepo: ProfileRepo
  private let onCommentCountChange: ((Int) -> Void)?
  @StateObject private var vm: PostDetailViewModel
  @EnvironmentObject private var blockedUsers: BlockedUsersStore
  @Environment(\.dismiss) private var dismiss
  @State private var isComposing = false
  @State private var openedProfileID: String?
  @State private var openedGroupID: String?
  @FocusState private var composerFocused: Bool

  init(
    item: FeedItem,
    profileRepo: ProfileRepo,
    commentsRepo: any PostCommentsRepo,
    onCommentCountChange: ((Int) -> Void)? = nil
  ) {
    self.item = item
    self.profileRepo = profileRepo
    self.onCommentCountChange = onCommentCountChange
    _vm = StateObject(wrappedValue: PostDetailViewModel(postID: item.id, repo: commentsRepo, initialCommentCount: item.commentCount))
  }

  private var photos: [PostMediaItem] { item.media.filter { $0.type == "image" } }
  private var otherMedia: [PostMediaItem] { item.media.filter { $0.type != "image" } }
  private var hasPhotos: Bool { !photos.isEmpty || item.imageURL != nil }

  var body: some View {
    ScrollViewReader { proxy in
      ScrollView {
        LazyVStack(alignment: .leading, spacing: 0) {
          PostAuthorHeader(
            authorID: item.authorID,
            authorName: item.authorName,
            groupID: item.groupID,
            createdAt: item.createdAt,
            onOpenProfile: item.authorID.map { id in { openedProfileID = id } },
            onOpenGroup: item.groupID.map { id in { openedGroupID = id } }
          ) {
            ModerationMenu(
              target: .post(postID: item.id, authorID: item.authorID),
              authorID: item.authorID,
              authorName: item.authorName,
              onBlocked: { dismiss() }
            )
          }
          .padding(.horizontal, 16)
          .padding(.vertical, 10)

          // Like the feed: the photos first and the words under the actions, or the words first.
          if hasPhotos {
            photoCarousel
          } else {
            words
              .padding(.horizontal, 16)
              .padding(.bottom, 8)
          }

          if !otherMedia.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
              PostMediaView(items: otherMedia)
            }
            .padding(.horizontal, 16)
            .padding(.top, 10)
          }

          actions(proxy: proxy)

          if hasPhotos {
            words
              .padding(.horizontal, 16)
              .padding(.top, 6)
          }

          comments
            .id("comments")
            .padding(.horizontal, 16)
            .padding(.top, VinctusTokens.Spacing.xl)
            .padding(.bottom, VinctusTokens.Spacing.xl)
        }
      }
    }
    .background(VinctusTokens.Color.background)
    .navigationTitle("Publicación")
    .navigationBarTitleDisplayMode(.inline)
    .navigationDestination(item: $openedProfileID) { userID in
      ProfileView(repo: profileRepo, userID: userID)
    }
    .navigationDestination(item: $openedGroupID) { groupID in
      GroupView(repo: AppRepos.groups(), groupID: groupID, profileRepo: profileRepo)
    }
    .task {
      await vm.refreshComments()
      syncCommentCountToFeed()
    }
    .onChange(of: vm.comments.count) { _, _ in
      syncCommentCountToFeed()
    }
    .onChange(of: vm.submittedCommentCount) { _, _ in
      syncCommentCountToFeed()
    }
    .onDisappear {
      syncCommentCountToFeed()
    }
    .refreshable {
      await vm.refreshComments()
      syncCommentCountToFeed()
    }
    .vinctusLoading(vm.isSubmittingComment)
  }

  // MARK: Post

  private var photoCarousel: some View {
    let sources = photos.isEmpty ? [item.imageURL].compactMap { $0 } : photos.map(\.url)
    return TabView {
      ForEach(Array(sources.enumerated()), id: \.offset) { index, source in
        PostImageView(source: source)
          .clipped()
          .accessibilityLabel(sources.count > 1 ? "Foto \(index + 1) de \(sources.count)" : "Foto de la publicación")
      }
    }
    .tabViewStyle(.page(indexDisplayMode: sources.count > 1 ? .always : .never))
    .aspectRatio(1, contentMode: .fit)
    .background(VinctusTokens.Color.surface)
  }

  @ViewBuilder
  private var words: some View {
    VStack(alignment: .leading, spacing: 8) {
      if let title = item.title {
        Text(title)
          .font(VinctusTokens.Typography.serif(26))
          .foregroundStyle(VinctusTokens.Color.textPrimary)
      }
      if !item.text.isEmpty {
        Text(item.text)
          .font(hasPhotos ? .subheadline : .body)
          .foregroundStyle(VinctusTokens.Color.textPrimary)
          .multilineTextAlignment(.leading)
          .textSelection(.enabled)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  // Same order as the web: like, comments, share; save on the right.
  private func actions(proxy: ScrollViewProxy) -> some View {
    HStack(spacing: 18) {
      PostReactionButton(postID: item.id, initialCount: item.likeCount)
        .font(.title3)
      Button {
        openComposer(proxy: proxy)
      } label: {
        Image(systemName: "bubble.left")
          .font(.title3)
          .foregroundStyle(VinctusTokens.Color.textPrimary)
      }
      .buttonStyle(.borderless)
      .accessibilityLabel("Comentarios")
      ShareLink(item: PostLinks.webURL(postID: item.id)) {
        Image(systemName: "square.and.arrow.up")
          .font(.title3)
          .foregroundStyle(VinctusTokens.Color.textPrimary)
      }
      .accessibilityLabel("Compartir publicación")
      Spacer()
      PostReactionButton(postID: item.id, kind: .save)
        .font(.title3)
        .labelStyle(.iconOnly)
    }
    .padding(.horizontal, 16)
    .padding(.top, 10)
  }

  // MARK: Comments

  private var comments: some View {
    VStack(alignment: .leading, spacing: VinctusTokens.Spacing.md) {
      Text("Comentarios (\(displayCommentCount))")
        .font(VinctusTokens.Typography.serif(22))
        .foregroundStyle(VinctusTokens.Color.textPrimary)
        .accessibilityAddTraits(.isHeader)

      composer

      if let error = vm.errorMessage {
        Text(error)
          .font(.footnote)
          .foregroundStyle(.red)
      }
      if let info = vm.infoMessage {
        Text(info)
          .font(.footnote)
          .foregroundStyle(VinctusTokens.Color.accent)
      }
      if vm.isShowingCachedData {
        Label("Mostrando comentarios desde cache local.", systemImage: "externaldrive.badge.clock")
          .font(.footnote)
          .foregroundStyle(VinctusTokens.Color.textMuted)
      }

      if vm.isLoadingComments, vm.comments.isEmpty {
        commentSkeleton
      } else if visibleComments.isEmpty {
        Text("Aún no hay comentarios.")
          .font(.footnote)
          .foregroundStyle(VinctusTokens.Color.textMuted)
          .frame(maxWidth: .infinity)
          .padding(.vertical, VinctusTokens.Spacing.lg)
      } else {
        ForEach(visibleComments) { comment in
          CommentRow(postID: item.id, comment: comment) {
            if let authorID = comment.authorID { openedProfileID = authorID }
          }
        }
      }

      if let error = vm.loadMoreErrorMessage {
        Text(error)
          .font(.footnote)
          .foregroundStyle(.red)
      }
      if vm.canLoadMoreComments {
        Button {
          Task { await vm.loadMoreComments() }
        } label: {
          HStack(spacing: 6) {
            if vm.isLoadingMoreComments { ProgressView().controlSize(.small) }
            Text(vm.loadMoreErrorMessage == nil ? "Ver comentarios anteriores" : "Reintentar carga")
          }
          .font(.footnote.weight(.medium))
          .padding(.horizontal, 14)
          .padding(.vertical, 8)
          .overlay(Capsule().stroke(VinctusTokens.Color.border, lineWidth: 1))
        }
        .buttonStyle(.plain)
        .frame(maxWidth: .infinity)
        .disabled(vm.isLoadingComments || vm.isLoadingMoreComments)
      }
    }
  }

  private var visibleComments: [PostComment] {
    vm.comments.filter { !blockedUsers.isBlocked($0.authorID) }
  }

  @ViewBuilder
  private var composer: some View {
    if isComposing {
      VStack(alignment: .leading, spacing: 8) {
        ZStack(alignment: .topLeading) {
          if vm.draftComment.isEmpty {
            Text("Escribe tu comentario...")
              .foregroundStyle(VinctusTokens.Color.textMuted)
              .padding(.top, 10)
              .padding(.leading, 12)
          }
          TextEditor(text: $vm.draftComment)
            .focused($composerFocused)
            .scrollContentBackground(.hidden)
            .frame(minHeight: 88)
            .padding(.horizontal, 7)
            .padding(.vertical, 4)
            .onChange(of: vm.draftComment) { _, _ in
              vm.clearFeedbackIfNeeded()
            }
        }
        .background(VinctusTokens.Color.surface)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(
          RoundedRectangle(cornerRadius: 16, style: .continuous)
            .stroke(
              vm.remainingCharacters < 0 ? SwiftUI.Color.red.opacity(0.45) : VinctusTokens.Color.border.opacity(0.6),
              lineWidth: 1
            )
        )

        HStack(spacing: 12) {
          Button("Ocultar") {
            composerFocused = false
            isComposing = false
          }
          .font(.caption)
          .foregroundStyle(VinctusTokens.Color.textMuted)
          Spacer()
          Text("\(vm.remainingCharacters)")
            .font(.caption.monospacedDigit())
            .foregroundStyle(vm.remainingCharacters < 0 ? .red : VinctusTokens.Color.textMuted)
          Button {
            vm.submitComment()
          } label: {
            Text("Comentar")
              .font(.subheadline.weight(.semibold))
              .padding(.horizontal, 16)
              .padding(.vertical, 7)
              .foregroundStyle(.black)
              .background(VinctusTokens.Color.accent.opacity(vm.canSendComment ? 1 : 0.4), in: Capsule())
          }
          .buttonStyle(.plain)
          .disabled(!vm.canSendComment)
        }
      }
    } else {
      Button {
        isComposing = true
        composerFocused = true
      } label: {
        Text("Agregar comentario…")
          .font(.subheadline)
          .foregroundStyle(VinctusTokens.Color.textMuted)
          .frame(maxWidth: .infinity, alignment: .leading)
          .padding(.horizontal, 16)
          .padding(.vertical, 11)
          .overlay(Capsule().stroke(VinctusTokens.Color.border.opacity(0.7), lineWidth: 1))
      }
      .buttonStyle(.plain)
    }
  }

  private func openComposer(proxy: ScrollViewProxy) {
    isComposing = true
    withAnimation { proxy.scrollTo("comments", anchor: .top) }
    composerFocused = true
  }

  private var displayCommentCount: Int {
    max(item.commentCount, vm.commentCount)
  }

  private func syncCommentCountToFeed() {
    onCommentCountChange?(displayCommentCount)
  }

  @ViewBuilder
  private var commentSkeleton: some View {
    ForEach(0..<3, id: \.self) { _ in
      HStack(alignment: .top, spacing: 10) {
        Circle()
          .fill(SwiftUI.Color.gray.opacity(0.2))
          .frame(width: 32, height: 32)
        VStack(alignment: .leading, spacing: 8) {
          RoundedRectangle(cornerRadius: 4, style: .continuous)
            .fill(SwiftUI.Color.gray.opacity(0.2))
            .frame(height: 12)
          RoundedRectangle(cornerRadius: 4, style: .continuous)
            .fill(SwiftUI.Color.gray.opacity(0.15))
            .frame(width: 140, height: 12)
        }
      }
      .redacted(reason: .placeholder)
    }
  }
}

/// One comment like Instagram's: the photo, the name in bold followed by the text, then the time
/// and the options to report or block.
private struct CommentRow: View {
  let postID: String
  let comment: PostComment
  let onOpenProfile: () -> Void

  var body: some View {
    HStack(alignment: .top, spacing: 10) {
      Button(action: onOpenProfile) {
        AvatarView(name: comment.authorName, photoURLString: nil, size: 32)
      }
      .buttonStyle(.borderless)
      .disabled(comment.authorID == nil)
      .accessibilityLabel("Perfil de \(comment.authorName)")

      VStack(alignment: .leading, spacing: 4) {
        (Text(comment.authorName).fontWeight(.semibold) + Text("  \(comment.text)"))
          .font(.subheadline)
          .foregroundStyle(VinctusTokens.Color.textPrimary)
          .multilineTextAlignment(.leading)
          .textSelection(.enabled)
        if let createdAt = comment.createdAt {
          Text(ConnectionsFormat.relativeAge(createdAt))
            .font(.caption)
            .foregroundStyle(VinctusTokens.Color.textMuted)
        }
      }
      Spacer(minLength: 4)
      ModerationMenu(
        target: .comment(postID: postID, commentID: comment.id, authorID: comment.authorID),
        authorID: comment.authorID,
        authorName: comment.authorName
      )
    }
  }
}

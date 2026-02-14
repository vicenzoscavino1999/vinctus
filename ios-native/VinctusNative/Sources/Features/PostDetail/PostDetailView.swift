import SwiftUI

struct PostDetailView: View {
  private static let mediaHeight: CGFloat = 220

  private let item: FeedItem
  private let profileRepo: ProfileRepo
  private let onCommentCountChange: ((Int) -> Void)?
  @StateObject private var vm: PostDetailViewModel

  init(
    item: FeedItem,
    profileRepo: ProfileRepo,
    commentsRepo: any PostCommentsRepo,
    onCommentCountChange: ((Int) -> Void)? = nil
  ) {
    self.item = item
    self.profileRepo = profileRepo
    self.onCommentCountChange = onCommentCountChange
    _vm = StateObject(wrappedValue: PostDetailViewModel(postID: item.id, repo: commentsRepo))
  }

  var body: some View {
    List {
      Section {
        VCard {
          VStack(alignment: .leading, spacing: VinctusTokens.Spacing.sm) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
              Text(item.authorName)
                .font(.headline)

              if let createdAt = item.createdAt {
                Text(createdAt, style: .relative)
                  .font(.caption)
                  .foregroundStyle(.secondary)
              }

              Spacer()
            }

            if !item.text.isEmpty {
              Text(item.text)
                .font(.body)
                .multilineTextAlignment(.leading)
            } else {
              Text("Sin texto")
                .font(.footnote)
                .foregroundStyle(.secondary)
            }

            if let mediaURL = item.primaryMediaURL, item.primaryMediaType == nil || item.primaryMediaType == "image" {
              mediaPreview(url: mediaURL)
            }

            HStack(spacing: 12) {
              Label("\(item.likeCount)", systemImage: "heart")
              Label("\(displayCommentCount)", systemImage: "text.bubble")
            }
            .font(.caption)
            .foregroundStyle(.secondary)

            if let authorID = item.authorID {
              NavigationLink(destination: ProfileView(repo: profileRepo, userID: authorID)) {
                Label("Ver perfil del autor", systemImage: "person.crop.circle")
                  .font(.caption.weight(.semibold))
                  .foregroundStyle(VinctusTokens.Color.accent)
              }
              .buttonStyle(.plain)
            }
          }
          .frame(maxWidth: .infinity, alignment: .leading)
        }
      }
      .listRowSeparator(.hidden)

      if vm.isShowingCachedData {
        VCard {
          HStack(spacing: 8) {
            Image(systemName: "externaldrive.badge.clock")
              .foregroundStyle(.orange)
            Text("Mostrando comentarios desde cache local.")
              .font(.footnote)
              .foregroundStyle(.secondary)
          }
        }
        .listRowSeparator(.hidden)
      }

      Section("Comentarios") {
        if vm.isLoadingComments, vm.comments.isEmpty {
          commentSkeleton
        } else if vm.comments.isEmpty {
          VCard {
            Text("Aun no hay comentarios.")
              .font(.footnote)
              .foregroundStyle(.secondary)
          }
          .listRowSeparator(.hidden)
        } else {
          ForEach(vm.comments) { comment in
            CommentRow(comment: comment)
              .listRowSeparator(.hidden)
          }
        }
      }

      Section("Agregar comentario") {
        VStack(alignment: .leading, spacing: VinctusTokens.Spacing.sm) {
          ZStack(alignment: .topLeading) {
            if vm.draftComment.isEmpty {
              Text("Escribe tu comentario...")
                .foregroundStyle(.secondary)
                .padding(.top, 10)
                .padding(.leading, 10)
            }

            TextEditor(text: $vm.draftComment)
              .frame(minHeight: 100)
              .padding(.horizontal, 6)
              .padding(.vertical, 6)
              .onChange(of: vm.draftComment) { _, _ in
                vm.clearFeedbackIfNeeded()
              }
          }
          .background(VinctusTokens.Color.surface2)
          .clipShape(RoundedRectangle(cornerRadius: VinctusTokens.Radius.md, style: .continuous))
          .overlay(
            RoundedRectangle(cornerRadius: VinctusTokens.Radius.md, style: .continuous)
              .stroke(
                vm.remainingCharacters < 0
                  ? SwiftUI.Color.red.opacity(0.45)
                  : VinctusTokens.Color.border.opacity(0.35),
                lineWidth: 1
              )
          )

          HStack {
            Text("Maximo 1000 caracteres")
              .font(.caption)
              .foregroundStyle(.secondary)

            Spacer()

            Text("\(vm.remainingCharacters)")
              .font(.caption.monospacedDigit())
              .foregroundStyle(vm.remainingCharacters < 0 ? .red : .secondary)
          }

          VButton("Enviar comentario") {
            vm.submitComment()
          }
          .disabled(!vm.canSendComment)
        }
        .listRowSeparator(.hidden)
      }

      if let error = vm.errorMessage {
        Text(error)
          .font(.footnote)
          .foregroundStyle(.red)
          .listRowSeparator(.hidden)
      }

      if let info = vm.infoMessage {
        Text(info)
          .font(.footnote)
          .foregroundStyle(VinctusTokens.Color.accent)
          .listRowSeparator(.hidden)
      }
    }
    .listStyle(.insetGrouped)
    .navigationTitle("Post")
    .task {
      await vm.refreshComments()
      syncCommentCountToFeed()
    }
    .onChange(of: vm.comments.count) { _, newCount in
      syncCommentCountToFeed(newCount)
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

  private var displayCommentCount: Int {
    max(item.commentCount, vm.comments.count)
  }

  private func syncCommentCountToFeed(_ count: Int? = nil) {
    let resolvedCount = max(item.commentCount, count ?? vm.comments.count)
    onCommentCountChange?(resolvedCount)
  }

  @ViewBuilder
  private var commentSkeleton: some View {
    ForEach(0..<3, id: \.self) { _ in
      VCard {
        VStack(alignment: .leading, spacing: 8) {
          RoundedRectangle(cornerRadius: 4, style: .continuous)
            .fill(SwiftUI.Color.gray.opacity(0.2))
            .frame(width: 120, height: 13)
          RoundedRectangle(cornerRadius: 4, style: .continuous)
            .fill(SwiftUI.Color.gray.opacity(0.17))
            .frame(height: 13)
          RoundedRectangle(cornerRadius: 4, style: .continuous)
            .fill(SwiftUI.Color.gray.opacity(0.14))
            .frame(width: 220, height: 13)
        }
      }
      .redacted(reason: .placeholder)
      .listRowSeparator(.hidden)
    }
  }

  private func mediaPreview(url: URL) -> some View {
    ZStack {
      RoundedRectangle(cornerRadius: 12, style: .continuous)
        .fill(VinctusTokens.Color.surface2.opacity(0.8))

      AsyncImage(url: url) { phase in
        switch phase {
        case .empty:
          ProgressView()
            .tint(VinctusTokens.Color.accent)
        case .success(let image):
          image
            .resizable()
            .scaledToFit()
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
            .background(VinctusTokens.Color.surface2.opacity(0.8))
        case .failure:
          Label("No se pudo cargar la imagen", systemImage: "photo")
            .font(.caption)
            .foregroundStyle(.secondary)
        @unknown default:
          EmptyView()
        }
      }
    }
    .frame(maxWidth: .infinity)
    .frame(height: Self.mediaHeight)
    .clipped()
    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
  }
}

private struct CommentRow: View {
  let comment: PostComment

  var body: some View {
    VCard {
      VStack(alignment: .leading, spacing: 6) {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
          Text(comment.authorName)
            .font(.subheadline.weight(.semibold))

          if let createdAt = comment.createdAt {
            Text(createdAt, style: .relative)
              .font(.caption)
              .foregroundStyle(.secondary)
          }
          Spacer()
        }

        Text(comment.text)
          .font(.body)
          .multilineTextAlignment(.leading)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    }
  }
}

import SwiftUI

struct FeedView: View {
  @StateObject private var vm: FeedViewModel
  private let profileRepo: ProfileRepo
  private let commentsRepo: any PostCommentsRepo

  init(repo: FeedRepo, profileRepo: ProfileRepo) {
    self.profileRepo = profileRepo
    self.commentsRepo = FirebasePostCommentsRepo()
    _vm = StateObject(wrappedValue: FeedViewModel(repo: repo))
  }

  var body: some View {
    List {
      Section {
        FeedTopBar()
      }
      .listRowSeparator(.hidden)
      .listRowBackground(SwiftUI.Color.clear)

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
            Text("Tu feed esta vacio")
              .font(.headline)
              .foregroundStyle(VinctusTokens.Color.textPrimary)
            Text("Cuando haya publicaciones recientes, apareceran aqui.")
              .font(.footnote)
              .foregroundStyle(VinctusTokens.Color.textMuted)
          }
        }
        .listRowSeparator(.hidden)
        .listRowBackground(SwiftUI.Color.clear)
      } else {
        ForEach(vm.items) { item in
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
              Text("Cargando mas publicaciones…")
                .font(.footnote)
                .foregroundStyle(VinctusTokens.Color.textMuted)
            } else {
              Text("Desliza para cargar mas")
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
          Text("No hay mas publicaciones por ahora.")
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
    .toolbar(.hidden, for: .navigationBar)
    .scrollContentBackground(.hidden)
    .background(VinctusTokens.Color.background)
    .task {
      await vm.refresh()
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
        }

        if !item.text.isEmpty {
          Text(item.text)
            .font(.body)
            .lineLimit(6)
            .multilineTextAlignment(.leading)
            .foregroundStyle(VinctusTokens.Color.textPrimary)
        }

        HStack(spacing: 12) {
          Label("\(item.likeCount)", systemImage: "heart")
            .font(.caption)
            .foregroundStyle(VinctusTokens.Color.textMuted)

          Label("\(item.commentCount)", systemImage: "text.bubble")
            .font(.caption)
            .foregroundStyle(VinctusTokens.Color.textMuted)

          Spacer()

          NavigationLink(
            destination: PostDetailView(
              item: item,
              profileRepo: profileRepo,
              commentsRepo: commentsRepo,
              onCommentCountChange: onCommentCountChanged
            )
          ) {
            Text("Ver post")
              .font(.caption.weight(.semibold))
              .foregroundStyle(VinctusTokens.Color.accent)
          }
          .buttonStyle(.plain)
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    }
  }
}

private struct FeedTopBar: View {
  var body: some View {
    VStack(alignment: .leading, spacing: 16) {
      HStack {
        Circle()
          .fill(VinctusTokens.Color.accent)
          .frame(width: 44, height: 44)
          .overlay(
            Image(systemName: "plus")
              .font(.title3.weight(.semibold))
              .foregroundStyle(.black)
          )

        Spacer()

        Text("Vinctus")
          .font(VinctusTokens.Typography.brandTitle(size: 36))
          .foregroundStyle(VinctusTokens.Color.textPrimary)

        Spacer()

        HStack(spacing: 16) {
          Image(systemName: "sparkles")
          Image(systemName: "bell")
        }
        .foregroundStyle(VinctusTokens.Color.textMuted)
      }

      Text("Feed")
        .font(VinctusTokens.Typography.sectionTitle(size: 16))
        .foregroundStyle(VinctusTokens.Color.textMuted)
        .tracking(3)
    }
    .padding(.top, 2)
    .padding(.bottom, 6)
  }
}

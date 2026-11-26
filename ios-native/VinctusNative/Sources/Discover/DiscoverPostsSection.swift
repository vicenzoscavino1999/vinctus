import SwiftUI

/// Descubrir's "Publicaciones": the latest posts in a carousel and "Ver todo" for the full feed,
/// like the web's Discover page. The feed has no tab of its own since the bottom bar matches the web.
/// It uses buttons, not NavigationLinks: a link inside a List row makes List add its own arrow.
/// DiscoverView declares the destinations.
struct DiscoverPostsSection: View {
  @EnvironmentObject private var blockedUsers: BlockedUsersStore
  @ObservedObject var vm: FeedViewModel
  let onSeeAll: () -> Void
  let onOpenPost: (FeedItem) -> Void

  private var visibleItems: [FeedItem] {
    Array(vm.items.filter { !blockedUsers.isBlocked($0.authorID) }.prefix(8))
  }

  var body: some View {
    VStack(alignment: .leading, spacing: VinctusTokens.Spacing.md) {
      HStack(alignment: .firstTextBaseline) {
        DiscoverSectionHeader(title: "Publicaciones")
        Spacer()
        Button(action: onSeeAll) {
          Text("Ver todo")
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(VinctusTokens.Color.accent)
        }
        .buttonStyle(.borderless)
      }

      if vm.items.isEmpty, vm.isInitialLoading {
        HStack(spacing: VinctusTokens.Spacing.md) {
          ForEach(0..<2, id: \.self) { _ in
            RoundedRectangle(cornerRadius: VinctusTokens.Radius.md, style: .continuous)
              .fill(VinctusTokens.Color.surface)
              .frame(width: 260, height: 150)
          }
        }
      } else if visibleItems.isEmpty {
        VCard {
          Text(vm.errorMessage == nil ? "Aún no hay publicaciones. Comparte la primera con el botón +." : "No se pudieron cargar las publicaciones.")
            .font(.footnote)
            .foregroundStyle(VinctusTokens.Color.textSecondary)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
      } else {
        ScrollView(.horizontal, showsIndicators: false) {
          HStack(alignment: .top, spacing: VinctusTokens.Spacing.md) {
            ForEach(visibleItems) { item in
              Button {
                onOpenPost(item)
              } label: {
                DiscoverPostCard(item: item)
              }
              .buttonStyle(.plain)
            }
          }
          .padding(.vertical, 2)
        }
      }
    }
  }
}

struct DiscoverPostCard: View {
  let item: FeedItem

  var body: some View {
    VCard {
      VStack(alignment: .leading, spacing: VinctusTokens.Spacing.sm) {
        HStack(spacing: VinctusTokens.Spacing.sm) {
          AvatarView(name: item.authorName, photoURLString: nil, size: 28)
          VStack(alignment: .leading, spacing: 0) {
            Text(item.authorName)
              .font(.subheadline.weight(.semibold))
              .foregroundStyle(VinctusTokens.Color.textPrimary)
              .lineLimit(1)
            if let createdAt = item.createdAt {
              Text(ConnectionsFormat.relativeAge(createdAt))
                .font(.caption)
                .foregroundStyle(VinctusTokens.Color.textMuted)
            }
          }
        }

        if let preview = item.previewImageURL {
          SwiftUI.Color.clear
            .frame(height: 120)
            .overlay { PostImageView(source: preview) }
            .clipShape(RoundedRectangle(cornerRadius: VinctusTokens.Radius.sm, style: .continuous))
        }

        Text(item.title ?? item.text)
          .font(.subheadline)
          .foregroundStyle(VinctusTokens.Color.textPrimary)
          .lineLimit(item.previewImageURL == nil ? 4 : 2)
          .multilineTextAlignment(.leading)

        Spacer(minLength: 0)

        HStack(spacing: 14) {
          Label("\(item.likeCount)", systemImage: "heart")
          Label("\(item.commentCount)", systemImage: "bubble.left")
        }
        .font(.caption)
        .foregroundStyle(VinctusTokens.Color.textMuted)
      }
      .frame(width: 236, height: item.previewImageURL == nil ? 150 : 250, alignment: .topLeading)
    }
    .accessibilityElement(children: .combine)
    .accessibilityHint("Abre la publicación")
  }
}

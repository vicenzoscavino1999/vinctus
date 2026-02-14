import SwiftUI

struct DiscoverPublicationsSection: View {
  @Binding var searchText: String
  let items: [FeedItem]
  let isInitialLoading: Bool
  let hasLoadedData: Bool
  let errorMessage: String?
  let isShowingCachedData: Bool
  let onOpenPost: (FeedItem) -> Void
  let onRetry: () -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      Text("Publicaciones")
        .font(VinctusTokens.Typography.sectionTitle(size: 32))
        .foregroundStyle(VinctusTokens.Color.textPrimary)
        .padding(.leading, 2)

      Text("Feed continuo de comunidad + YouTube para mantener Discover activo sin verse vacio.")
        .font(.subheadline)
        .foregroundStyle(VinctusTokens.Color.textMuted)
        .padding(.leading, 2)

      DiscoverPublicationSearchField(searchText: $searchText)

      Text("YOUTUBE EN VIVO · \(items.count) ITEMS")
        .font(.caption2.weight(.semibold))
        .tracking(2.4)
        .foregroundStyle(VinctusTokens.Color.textMuted)

      if isShowingCachedData {
        HStack(spacing: 8) {
          Image(systemName: "externaldrive.badge.clock")
            .foregroundStyle(VinctusTokens.Color.accent)
          Text("Mostrando publicaciones desde cache local.")
            .font(.footnote)
            .foregroundStyle(VinctusTokens.Color.textMuted)
        }
      }

      if isInitialLoading, !hasLoadedData {
        VStack(spacing: VinctusTokens.Spacing.sm) {
          ForEach(0..<2, id: \.self) { _ in
            VCard {
              RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(SwiftUI.Color.gray.opacity(0.2))
                .frame(height: 250)
                .redacted(reason: .placeholder)
            }
          }
        }
      } else if let errorMessage, items.isEmpty {
        VCard {
          VStack(alignment: .leading, spacing: 10) {
            Text(errorMessage)
              .font(.footnote)
              .foregroundStyle(.red)
            VButton("Reintentar", variant: .secondary, action: onRetry)
          }
        }
      } else if items.isEmpty {
        VCard {
          Text("Aun no hay publicaciones para mostrar.")
            .font(.footnote)
            .foregroundStyle(VinctusTokens.Color.textMuted)
        }
      } else {
        VStack(spacing: VinctusTokens.Spacing.sm) {
          ForEach(Array(items.prefix(3))) { item in
            Button {
              onOpenPost(item)
            } label: {
              DiscoverPublicationCard(item: item)
            }
            .buttonStyle(.plain)
          }
        }
      }
    }
    .padding(.bottom, 8)
  }
}

struct DiscoverPublicationSearchField: View {
  @Binding var searchText: String

  var body: some View {
    HStack(spacing: 10) {
      Image(systemName: "magnifyingglass")
        .foregroundStyle(VinctusTokens.Color.textMuted)

      TextField("ciencia tecnologia musica", text: $searchText)
        .font(.subheadline)
        .textInputAutocapitalization(.never)
        .autocorrectionDisabled()
        .foregroundStyle(VinctusTokens.Color.textPrimary)

      if !searchText.isEmpty {
        Button {
          searchText = ""
        } label: {
          Image(systemName: "xmark.circle.fill")
            .foregroundStyle(VinctusTokens.Color.textMuted.opacity(0.9))
        }
        .buttonStyle(.plain)
      }
    }
    .padding(.horizontal, 12)
    .padding(.vertical, 10)
    .background(VinctusTokens.Color.surface)
    .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    .overlay(
      RoundedRectangle(cornerRadius: 16, style: .continuous)
        .stroke(VinctusTokens.Color.border.opacity(0.5), lineWidth: 1)
    )
  }
}

struct DiscoverPublicationCard: View {
  let item: FeedItem

  var body: some View {
    VCard {
      VStack(alignment: .leading, spacing: 0) {
        HStack(spacing: 10) {
          Circle()
            .stroke(VinctusTokens.Color.accent.opacity(0.65), lineWidth: 1)
            .frame(width: 30, height: 30)
            .overlay(
              Image(systemName: "atom")
                .font(.caption)
                .foregroundStyle(SwiftUI.Color.blue)
            )

          VStack(alignment: .leading, spacing: 1) {
            Text(item.authorName)
              .font(.subheadline.weight(.semibold))
              .foregroundStyle(VinctusTokens.Color.textPrimary)
              .lineLimit(1)
            Text("CIENCIA & MATERIA")
              .font(.caption2.weight(.medium))
              .tracking(1.0)
              .foregroundStyle(VinctusTokens.Color.textMuted)
          }

          Spacer(minLength: 8)

          HStack(spacing: 7) {
            Text("VER PUBLICACION")
              .font(.caption2.weight(.semibold))
              .tracking(0.9)
            Image(systemName: "arrow.right")
              .font(.caption2.weight(.semibold))
          }
          .foregroundStyle(VinctusTokens.Color.textPrimary.opacity(0.9))
          .padding(.horizontal, 10)
          .padding(.vertical, 7)
          .overlay(
            Capsule()
              .stroke(VinctusTokens.Color.border.opacity(0.65), lineWidth: 1)
          )
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)

        mediaBackground
          .frame(height: 196)
          .clipped()

        if !hasPrimaryImage {
          VStack(alignment: .leading, spacing: 6) {
            Text(titleText)
              .font(.headline)
              .foregroundStyle(VinctusTokens.Color.textPrimary)
              .lineLimit(2)

            if let summaryText {
              Text(summaryText)
                .font(.caption)
                .foregroundStyle(VinctusTokens.Color.textMuted)
                .lineLimit(2)
              }
            }
          .padding(.horizontal, 12)
          .padding(.top, 10)
          .padding(.bottom, 8)
        }

        HStack(spacing: 10) {
          DiscoverPublicationMetricChip(icon: "heart", value: item.likeCount)
          DiscoverPublicationMetricChip(icon: "bubble.left", value: item.commentCount)

          HStack(spacing: 6) {
            Image(systemName: "bookmark")
              .font(.caption)
            Text("Guardar")
              .font(.caption.weight(.medium))
              .lineLimit(1)
              .fixedSize(horizontal: true, vertical: false)
          }
          .foregroundStyle(VinctusTokens.Color.textPrimary.opacity(0.92))
          .padding(.horizontal, 10)
          .padding(.vertical, 7)
          .overlay(
            Capsule()
              .stroke(VinctusTokens.Color.border.opacity(0.65), lineWidth: 1)
          )

          Spacer()
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 9)
        .background(VinctusTokens.Color.surface.opacity(0.72))
      }
      .clipShape(RoundedRectangle(cornerRadius: VinctusTokens.Radius.md, style: .continuous))
      .overlay(
        RoundedRectangle(cornerRadius: VinctusTokens.Radius.md, style: .continuous)
          .stroke(VinctusTokens.Color.border.opacity(0.55), lineWidth: 1)
      )
    }
  }

  private var trimmedText: String {
    let cleaned = item.text.trimmingCharacters(in: .whitespacesAndNewlines)
    return cleaned.isEmpty ? "Sin contenido aun." : cleaned
  }

  private var hasPrimaryImage: Bool {
    guard item.primaryMediaURL != nil else { return false }
    return item.primaryMediaType == nil || item.primaryMediaType == "image"
  }

  private var titleText: String {
    if trimmedText.count <= 52 { return trimmedText }
    return "\(trimmedText.prefix(52))..."
  }

  private var summaryText: String? {
    guard trimmedText.count > 52 else { return nil }
    if trimmedText.count <= 110 { return trimmedText }
    return "\(trimmedText.prefix(110))..."
  }

  @ViewBuilder
  private var mediaBackground: some View {
    if let url = item.primaryMediaURL, item.primaryMediaType == nil || item.primaryMediaType == "image" {
      AsyncImage(url: url) { phase in
        switch phase {
        case .empty:
          publicationGradientBackground
            .overlay {
              ProgressView()
                .tint(VinctusTokens.Color.accent)
            }
        case .success(let image):
          image
            .resizable()
            .scaledToFill()
        case .failure:
          publicationGradientBackground
        @unknown default:
          publicationGradientBackground
        }
      }
      .clipped()
    } else {
      publicationGradientBackground
    }
  }

  private var publicationGradientBackground: some View {
    LinearGradient(
      colors: [
        SwiftUI.Color(red: 0.07, green: 0.08, blue: 0.15),
        SwiftUI.Color(red: 0.24, green: 0.17, blue: 0.07),
        SwiftUI.Color(red: 0.03, green: 0.03, blue: 0.06)
      ],
      startPoint: .topLeading,
      endPoint: .bottomTrailing
    )
  }
}

struct DiscoverPublicationMetricChip: View {
  let icon: String
  let value: Int

  var body: some View {
    HStack(spacing: 5) {
      Image(systemName: icon)
        .font(.caption)
      Text("\(max(0, value))")
        .font(.caption.weight(.medium))
    }
    .foregroundStyle(VinctusTokens.Color.textPrimary.opacity(0.9))
    .padding(.horizontal, 9)
    .padding(.vertical, 7)
    .overlay(
      Capsule()
        .stroke(VinctusTokens.Color.border.opacity(0.65), lineWidth: 1)
    )
  }
}

import SwiftUI

extension DiscoverCategory {
  /// Followed topics first, then the catalog order. It never depends on data that arrives later,
  /// so the tiles do not move while Discover loads (the web's `selectCategories`).
  static func ordered(_ categories: [DiscoverCategory], followed: Set<String>) -> [DiscoverCategory] {
    let position = Dictionary(uniqueKeysWithValues: all.enumerated().map { ($1.id, $0) })
    return categories.sorted { lhs, rhs in
      let lhsFollowed = followed.contains(lhs.id)
      let rhsFollowed = followed.contains(rhs.id)
      if lhsFollowed != rhsFollowed { return lhsFollowed }
      return (position[lhs.id] ?? 0) < (position[rhs.id] ?? 0)
    }
  }

  /// Name of the live source shown above a topic's newest item.
  var liveSourceName: String {
    switch apiSource {
    case "arxiv": return "arXiv"
    case "wikipedia": return "Wikipedia"
    case "hackernews": return "Hacker News"
    case "openlibrary": return "Open Library"
    case "inaturalist": return "iNaturalist"
    case "lastfm": return "Música"
    default: return "En vivo"
    }
  }
}

/// Discover's "Intereses": follow state and the newest live item of every topic.
@MainActor
final class DiscoverInterestsViewModel: ObservableObject {
  @Published private(set) var headlines: [String: DiscoverLiveItem] = [:]
  @Published private(set) var loadedHeadlines: Set<String> = []
  @Published private(set) var followed: Set<String> = []
  @Published private(set) var updatingFollow: Set<String> = []
  @Published var followError: String?

  /// Live items change slowly and the server caches them; ask again after this long.
  static let headlineMaxAge: TimeInterval = 15 * 60

  private let discoverRepo: DiscoverRepo
  private let profileContentRepo: ProfileContentRepo
  private var headlinesLoadedAt: Date?

  init(discoverRepo: DiscoverRepo, profileContentRepo: ProfileContentRepo) {
    self.discoverRepo = discoverRepo
    self.profileContentRepo = profileContentRepo
  }

  func categories(matching query: String) -> [DiscoverCategory] {
    DiscoverCategory.ordered(DiscoverCategory.all.filter { $0.matches(query: query) }, followed: followed)
  }

  func refresh(force: Bool = false) async {
    async let follows: Void = loadFollowed()
    async let lines: Void = loadHeadlines(force: force)
    _ = await (follows, lines)
  }

  func reset() {
    headlines = [:]
    loadedHeadlines = []
    followed = []
    headlinesLoadedAt = nil
  }

  private func loadFollowed() async {
    if let ids = try? await profileContentRepo.fetchFollowedCategories() {
      followed = Set(ids)
    }
  }

  /// One request per topic, all at once; each tile fills in as its answer arrives.
  private func loadHeadlines(force: Bool) async {
    if !force, let headlinesLoadedAt, Date().timeIntervalSince(headlinesLoadedAt) < Self.headlineMaxAge {
      return
    }
    headlinesLoadedAt = Date()
    let repo = discoverRepo
    await withTaskGroup(of: (String, DiscoverLiveItem?).self) { group in
      for category in DiscoverCategory.all {
        group.addTask {
          // Same limit as the web, so both share the server's cached answer.
          let items = try? await repo.fetchLiveContent(
            source: category.apiSource, query: category.defaultQuery, limit: 6
          )
          return (category.id, items?.first)
        }
      }
      for await (categoryID, item) in group {
        if let item { headlines[categoryID] = item }
        loadedHeadlines.insert(categoryID)
      }
    }
  }

  func toggleFollow(_ category: DiscoverCategory) async {
    guard !updatingFollow.contains(category.id) else { return }
    let follow = !followed.contains(category.id)
    updatingFollow.insert(category.id)
    defer { updatingFollow.remove(category.id) }
    // Shown at once; undone if the server refuses.
    if follow { followed.insert(category.id) } else { followed.remove(category.id) }
    do {
      try await profileContentRepo.setCategoryFollowed(follow, categoryID: category.id)
    } catch {
      if follow { followed.remove(category.id) } else { followed.insert(category.id) }
      followError = "No se pudo actualizar el seguimiento de \(category.title)."
    }
  }
}

/// A topic: icon, follow button, name, description and its newest live item. Like the web tile.
struct DiscoverInterestTile: View {
  let category: DiscoverCategory
  let headline: DiscoverLiveItem?
  let isHeadlineLoaded: Bool
  let isFollowed: Bool
  let isUpdatingFollow: Bool
  let onOpen: () -> Void
  let onToggleFollow: () -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      HStack(alignment: .top) {
        Image(systemName: category.icon)
          .font(.system(size: 17, weight: .medium))
          .foregroundStyle(VinctusTokens.Color.accent)
          .frame(width: 38, height: 38)
          .background(VinctusTokens.Color.surface2)
          .clipShape(RoundedRectangle(cornerRadius: 11, style: .continuous))
          .accessibilityHidden(true)
        Spacer(minLength: 6)
        Button(action: onToggleFollow) {
          Image(systemName: isFollowed ? "checkmark" : "plus")
            .font(.system(size: 13, weight: .semibold))
            .foregroundStyle(isFollowed ? VinctusTokens.Color.accent : VinctusTokens.Color.textSecondary)
            .frame(width: 32, height: 32)
            .background(Circle().fill(isFollowed ? VinctusTokens.Color.accent.opacity(0.16) : .clear))
            .overlay(Circle().stroke(isFollowed ? .clear : VinctusTokens.Color.border, lineWidth: 1))
        }
        .buttonStyle(.borderless)
        .disabled(isUpdatingFollow)
        .accessibilityLabel(isFollowed ? "Dejar de seguir \(category.title)" : "Seguir \(category.title)")
      }

      Button(action: onOpen) {
        VStack(alignment: .leading, spacing: 0) {
          Text(category.title)
            .font(VinctusTokens.Typography.sectionTitle(size: 18))
            .foregroundStyle(VinctusTokens.Color.textPrimary)
            .lineLimit(2)
            .multilineTextAlignment(.leading)
          Text(category.subtitle)
            .font(.caption)
            .foregroundStyle(VinctusTokens.Color.textMuted)
            .lineLimit(2, reservesSpace: true)
            .multilineTextAlignment(.leading)
            .padding(.top, 3)
          Rectangle()
            .fill(VinctusTokens.Color.border.opacity(0.5))
            .frame(height: 1)
            .padding(.vertical, 10)
          headlineView
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .padding(.top, 12)
      .accessibilityLabel(category.title)
      .accessibilityHint("Abre el tema")
    }
    .padding(14)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(VinctusTokens.Color.surface)
    .clipShape(RoundedRectangle(cornerRadius: VinctusTokens.Radius.lg, style: .continuous))
    .overlay(
      RoundedRectangle(cornerRadius: VinctusTokens.Radius.lg, style: .continuous)
        .stroke(VinctusTokens.Color.border.opacity(0.55), lineWidth: 1)
    )
  }

  @ViewBuilder
  private var headlineView: some View {
    VStack(alignment: .leading, spacing: 2) {
      if let headline {
        Text(category.liveSourceName)
          .font(.caption2.weight(.medium))
          .foregroundStyle(VinctusTokens.Color.textMuted)
          .lineLimit(1)
        Text(headline.title)
          .font(.caption)
          .foregroundStyle(VinctusTokens.Color.textSecondary)
          .lineLimit(2, reservesSpace: true)
          .multilineTextAlignment(.leading)
      } else if isHeadlineLoaded {
        Text("Sin novedades por ahora.")
          .font(.caption)
          .foregroundStyle(VinctusTokens.Color.textMuted)
          .lineLimit(3, reservesSpace: true)
      } else {
        RoundedRectangle(cornerRadius: 3).fill(VinctusTokens.Color.surface2).frame(width: 60, height: 9)
        RoundedRectangle(cornerRadius: 3).fill(VinctusTokens.Color.surface2).frame(height: 9).padding(.top, 4)
        RoundedRectangle(cornerRadius: 3).fill(VinctusTokens.Color.surface2).frame(width: 90, height: 9)
          .padding(.top, 3)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}

/// "Intereses": two columns of topic tiles.
struct DiscoverInterestsSection: View {
  @ObservedObject var vm: DiscoverInterestsViewModel
  let query: String
  let onOpen: (DiscoverCategory) -> Void

  private let columns = [
    GridItem(.flexible(), spacing: VinctusTokens.Spacing.md, alignment: .top),
    GridItem(.flexible(), spacing: VinctusTokens.Spacing.md, alignment: .top),
  ]

  var body: some View {
    let categories = vm.categories(matching: query)
    VStack(alignment: .leading, spacing: VinctusTokens.Spacing.md) {
      VStack(alignment: .leading, spacing: 2) {
        DiscoverSectionHeader(title: "Intereses")
        Text("Lo último de cada tema, en vivo.")
          .font(.footnote)
          .foregroundStyle(VinctusTokens.Color.textMuted)
      }

      if categories.isEmpty {
        VCard {
          Text("Ningún interés coincide con tu búsqueda.")
            .font(.footnote)
            .foregroundStyle(VinctusTokens.Color.textMuted)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
      } else {
        LazyVGrid(columns: columns, spacing: VinctusTokens.Spacing.md) {
          ForEach(categories) { category in
            DiscoverInterestTile(
              category: category,
              headline: vm.headlines[category.id],
              isHeadlineLoaded: vm.loadedHeadlines.contains(category.id),
              isFollowed: vm.followed.contains(category.id),
              isUpdatingFollow: vm.updatingFollow.contains(category.id),
              onOpen: { onOpen(category) },
              onToggleFollow: { Task { await vm.toggleFollow(category) } }
            )
          }
        }
      }

      if let followError = vm.followError {
        Text(followError)
          .font(.footnote)
          .foregroundStyle(.red)
      }
    }
  }
}

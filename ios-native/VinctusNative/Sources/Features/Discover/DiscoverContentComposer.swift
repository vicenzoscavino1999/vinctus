import Foundation

enum DiscoverContentComposer {
  static func normalizedQuery(_ text: String) -> String {
    text.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
  }

  static func filteredTrends(query: String, trends: [DiscoverTrend]) -> [DiscoverTrend] {
    guard !query.isEmpty else { return trends }
    return trends.filter { trend in
      trend.title.lowercased().contains(query)
        || trend.subtitle.lowercased().contains(query)
        || trend.tags.joined(separator: " ").lowercased().contains(query)
    }
  }

  static func filteredPublications(
    query: String,
    items: [FeedItem],
    preferredPostID: String?
  ) -> [FeedItem] {
    let orderedItems = orderedPublications(items: items, preferredPostID: preferredPostID)
    let normalized = normalizedQuery(query)
    guard !normalized.isEmpty else { return orderedItems }
    return orderedItems.filter { item in
      item.authorName.lowercased().contains(normalized)
        || item.text.lowercased().contains(normalized)
    }
  }

  static func buildTrends(groups: [GroupSummary], publicationItems: [FeedItem]) -> [DiscoverTrend] {
    let groupedByCategory = Dictionary(grouping: groups) { group in
      normalizedCategoryLabel(group.categoryID)
    }

    let ranked = groupedByCategory.sorted { lhs, rhs in
      if lhs.value.count != rhs.value.count {
        return lhs.value.count > rhs.value.count
      }
      let lhsLatest = lhs.value.map(\.updatedAt).max() ?? .distantPast
      let rhsLatest = rhs.value.map(\.updatedAt).max() ?? .distantPast
      return lhsLatest > rhsLatest
    }

    return ranked.prefix(6).enumerated().map { offset, entry in
      let category = entry.key
      let relatedGroups = entry.value
      let categoryQuery = category.lowercased()
      let relatedPublications = publicationItems.filter { item in
        item.text.lowercased().contains(categoryQuery) || item.authorName.lowercased().contains(categoryQuery)
      }
      let aggregatedMembers = relatedGroups.reduce(0) { partial, group in
        partial + max(group.memberCount, 0)
      }
      let scoreValue = min(99, max(65, aggregatedMembers + (relatedGroups.count * 7)))

      return DiscoverTrend(
        id: "trend_\(category.lowercased().replacingOccurrences(of: " ", with: "_"))",
        icon: iconName(forRank: offset),
        title: category,
        subtitle: "Conversaciones activas en \(category.lowercased()).",
        rankLabel: "TOP \(offset + 1)",
        scoreLabel: "\(scoreValue) SCORE",
        signalLabel: "\(max(relatedPublications.count, 1)) publicaciones hoy",
        groupsLabel: "\(relatedGroups.count) grupos activos",
        tags: extractTags(from: relatedGroups, fallbackCategory: category)
      )
    }
  }

  static func buildInstantPreview(
    trends: [DiscoverTrend],
    items: [FeedItem],
    preferredPostID: String?
  ) -> (
    categoryTitle: String,
    overviewText: String,
    papers: [DiscoverPaperHighlight],
    searchQuery: String
  )? {
    guard let topTrend = trends.first else { return nil }
    let papers = publicationHighlights(
      prefix: 2,
      filteringBy: topTrend.title,
      items: items,
      preferredPostID: preferredPostID
    )
    guard !papers.isEmpty else { return nil }

    return (
      categoryTitle: topTrend.title,
      overviewText: "Top hallazgos recientes de \(topTrend.title.lowercased()), sin salir de Discover.",
      papers: papers,
      searchQuery: topTrend.title.lowercased()
    )
  }

  static func buildDebateHighlight(
    items: [FeedItem],
    preferredPostID: String?,
    dominantCategoryTag: String
  ) -> DiscoverDebateHighlight? {
    let sourceItems = orderedPublications(items: items, preferredPostID: preferredPostID)
    guard let candidate = sourceItems.first(where: { !$0.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }) else {
      return nil
    }

    let trimmedText = candidate.text.trimmingCharacters(in: .whitespacesAndNewlines)
    let title = trimmedText.count > 56 ? "\(trimmedText.prefix(56))..." : trimmedText
    let summary = trimmedText.count > 220 ? "\(trimmedText.prefix(220))..." : trimmedText

    let dateFormatter = DateFormatter()
    dateFormatter.locale = Locale(identifier: "es_ES")
    dateFormatter.dateFormat = "d MMM yyyy"
    let dateLabel = candidate.createdAt.map { dateFormatter.string(from: $0) } ?? "Sin fecha"

    return DiscoverDebateHighlight(
      title: title,
      matchupLabel: "\(candidate.authorName) · \(dateLabel)",
      summary: summary,
      topicTag: dominantCategoryTag,
      sourcesCount: max(1, min(candidate.commentCount, 9)),
      likesCount: max(candidate.likeCount, 0)
    )
  }

  static func dominantCategoryTag(from trends: [DiscoverTrend]) -> String {
    trends.first?.title.uppercased() ?? "COMUNIDAD"
  }

  private static func orderedPublications(items: [FeedItem], preferredPostID: String?) -> [FeedItem] {
    items.sorted { lhs, rhs in
      isNewerPublication(lhs, rhs, preferredPostID: preferredPostID)
    }
  }

  private static func isNewerPublication(
    _ lhs: FeedItem,
    _ rhs: FeedItem,
    preferredPostID: String?
  ) -> Bool {
    if let preferredPostID {
      if lhs.id == preferredPostID, rhs.id != preferredPostID { return true }
      if rhs.id == preferredPostID, lhs.id != preferredPostID { return false }
    }

    switch (lhs.createdAt, rhs.createdAt) {
    case let (left?, right?):
      if left != right { return left > right }
      return lhs.id > rhs.id
    case (_?, nil):
      return false
    case (nil, _?):
      return true
    default:
      return lhs.id > rhs.id
    }
  }

  private static func normalizedCategoryLabel(_ rawCategory: String?) -> String {
    guard
      let category = rawCategory?
        .replacingOccurrences(of: "_", with: " ")
        .trimmingCharacters(in: .whitespacesAndNewlines),
      !category.isEmpty
    else {
      return "Comunidad"
    }
    return category.capitalized
  }

  private static func iconName(forRank rank: Int) -> String {
    switch rank {
    case 0: return "atom"
    case 1: return "music.note"
    case 2: return "cpu"
    default: return "sparkles"
    }
  }

  private static func extractTags(from groups: [GroupSummary], fallbackCategory: String) -> [String] {
    var seen = Set<String>()
    var tags: [String] = []

    for group in groups {
      let sourceText = "\(group.name) \(group.description)"
      let words = sourceText
        .lowercased()
        .split(whereSeparator: { !$0.isLetter && !$0.isNumber })
        .map(String.init)
        .filter { $0.count >= 4 }

      for word in words where !seen.contains(word) {
        seen.insert(word)
        tags.append(word)
        if tags.count == 4 { return tags }
      }
    }

    if tags.isEmpty {
      return [fallbackCategory.lowercased()]
    }
    return tags
  }

  private static func publicationHighlights(
    prefix count: Int,
    filteringBy category: String,
    items: [FeedItem],
    preferredPostID: String?
  ) -> [DiscoverPaperHighlight] {
    let normalizedCategory = category.lowercased()
    let source = orderedPublications(items: items, preferredPostID: preferredPostID)
      .filter { item in
        item.text.lowercased().contains(normalizedCategory) || item.authorName.lowercased().contains(normalizedCategory)
      }

    let dateFormatter = DateFormatter()
    dateFormatter.locale = Locale(identifier: "en_US_POSIX")
    dateFormatter.dateFormat = "yyyy-MM-dd"

    return source.prefix(count).map { item in
      let titleText = item.text.trimmingCharacters(in: .whitespacesAndNewlines)
      let normalizedTitle = titleText.isEmpty ? "Publicacion sin titulo" : titleText
      return DiscoverPaperHighlight(
        id: item.id,
        publishedAt: item.createdAt.map { dateFormatter.string(from: $0) } ?? "Sin fecha",
        title: normalizedTitle.count > 92 ? "\(normalizedTitle.prefix(92))..." : normalizedTitle,
        authors: item.authorName
      )
    }
  }
}

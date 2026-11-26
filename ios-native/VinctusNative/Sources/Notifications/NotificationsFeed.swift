import Foundation

/// What a notification is about (`ActivityType` in `src/shared/lib/firestore/sharedTypes.ts`).
enum ActivityKind: String, Hashable, Sendable {
  case like = "post_like"
  case comment = "post_comment"
  case follow = "follow"
}

/// One document of `notifications`.
struct ActivityNotification: Identifiable, Hashable, Sendable {
  let id: String
  let kind: ActivityKind
  let fromUID: String
  let fromName: String
  let fromPhotoURL: String?
  let postID: String?
  let postSnippet: String?
  let commentText: String?
  let createdAt: Date
  var read: Bool

  init(
    id: String,
    kind: ActivityKind,
    fromUID: String,
    fromName: String,
    fromPhotoURL: String? = nil,
    postID: String? = nil,
    postSnippet: String? = nil,
    commentText: String? = nil,
    createdAt: Date,
    read: Bool
  ) {
    self.id = id
    self.kind = kind
    self.fromUID = fromUID
    self.fromName = fromName
    self.fromPhotoURL = fromPhotoURL
    self.postID = postID
    self.postSnippet = postSnippet
    self.commentText = commentText
    self.createdAt = createdAt
    self.read = read
  }

  /// Reads a `notifications` document; nil for unknown types or a missing sender.
  init?(id: String, data: [String: Any]) {
    guard let kind = (data["type"] as? String).flatMap(ActivityKind.init(rawValue:)),
      let fromUID = FirestoreValue.string(data["fromUid"])
    else { return nil }
    self.init(
      id: id,
      kind: kind,
      fromUID: fromUID,
      fromName: FirestoreValue.string(data["fromUserName"]) ?? "Usuario",
      fromPhotoURL: FirestoreValue.string(data["fromUserPhoto"]),
      postID: FirestoreValue.string(data["postId"]),
      postSnippet: FirestoreValue.string(data["postSnippet"]),
      commentText: FirestoreValue.string(data["commentText"]),
      createdAt: FirestoreValue.date(data["createdAt"]) ?? Date(),
      read: data["read"] as? Bool ?? false
    )
  }
}

enum ActivityFilter: String, CaseIterable, Identifiable {
  case all, unread, like, comment, follow

  var id: String { rawValue }

  var title: String {
    switch self {
    case .all: return "Todas"
    case .unread: return "No leídas"
    case .like: return "Me gusta"
    case .comment: return "Comentarios"
    case .follow: return "Seguidores"
    }
  }

  func matches(_ item: ActivityNotification) -> Bool {
    switch self {
    case .all: return true
    case .unread: return !item.read
    case .like: return item.kind == .like
    case .comment: return item.kind == .comment
    case .follow: return item.kind == .follow
    }
  }
}

enum ActivitySectionID: Int, CaseIterable, Hashable {
  case today, week, month, earlier

  var title: String {
    switch self {
    case .today: return "Hoy"
    case .week: return "Esta semana"
    case .month: return "Este mes"
    case .earlier: return "Anteriores"
    }
  }
}

struct ActivityActor: Hashable {
  let uid: String
  let name: String
  let photoURL: String?
}

/// One row: one notification, or several that read as one.
struct ActivityGroup: Identifiable, Hashable {
  let id: String
  let kind: ActivityKind
  let section: ActivitySectionID
  /// Newest first.
  var items: [ActivityNotification]
  /// Distinct people, newest first.
  var actors: [ActivityActor]

  var latest: ActivityNotification { items[0] }
  var isRead: Bool { items.allSatisfy(\.read) }
  var unreadIDs: [String] { items.filter { !$0.read }.map(\.id) }
}

struct ActivitySection: Identifiable, Hashable {
  let id: ActivitySectionID
  let groups: [ActivityGroup]

  var title: String { id.title }
}

/// The same grouping as the web (`src/features/notifications/model/activityFeed.ts`).
enum NotificationsFeed {
  static func section(for date: Date, now: Date, calendar: Calendar = .current) -> ActivitySectionID {
    let startOfToday = calendar.startOfDay(for: now)
    if date >= startOfToday { return .today }
    if let weekStart = calendar.date(byAdding: .day, value: -6, to: startOfToday), date >= weekStart {
      return .week
    }
    if let monthStart = calendar.date(byAdding: .day, value: -29, to: startOfToday), date >= monthStart {
      return .month
    }
    return .earlier
  }

  /// Repeated follows from one person become one row (following, unfollowing and following
  /// again leaves a notification each time); likes on one post within a period become
  /// "Ana y 2 personas más…"; comments stay one per row.
  static func group(
    _ items: [ActivityNotification],
    now: Date = Date(),
    calendar: Calendar = .current
  ) -> [ActivitySection] {
    let sorted = items.sorted { $0.createdAt > $1.createdAt }
    var order: [String] = []
    var groups: [String: ActivityGroup] = [:]

    for item in sorted {
      let period = Self.section(for: item.createdAt, now: now, calendar: calendar)
      let key: String
      switch item.kind {
      case .follow: key = "follow:\(item.fromUID)"
      case .like: key = item.postID.map { "like:\($0):\(period.rawValue)" } ?? "item:\(item.id)"
      case .comment: key = "item:\(item.id)"
      }
      var group = groups[key] ?? ActivityGroup(id: key, kind: item.kind, section: period, items: [], actors: [])
      if groups[key] == nil { order.append(key) }
      group.items.append(item)
      if !group.actors.contains(where: { $0.uid == item.fromUID }) {
        group.actors.append(ActivityActor(uid: item.fromUID, name: item.fromName, photoURL: item.fromPhotoURL))
      }
      groups[key] = group
    }

    let ordered = order.compactMap { groups[$0] }
    return ActivitySectionID.allCases.compactMap { id in
      let inSection = ordered.filter { $0.section == id }
      return inSection.isEmpty ? nil : ActivitySection(id: id, groups: inSection)
    }
  }

  /// Who (one or two names, plus how many more) and what happened.
  static func parts(_ group: ActivityGroup) -> (names: [String], others: Int, action: String) {
    let count = group.actors.count
    let names = count == 2 ? group.actors.map(\.name) : [group.actors.first?.name ?? "Usuario"]
    let others = count > 2 ? count - 1 : 0
    let action: String
    switch group.kind {
    case .follow: action = "empezó a seguirte"
    case .like: action = "\(count > 1 ? "le dieron" : "le dio") “Me gusta” a tu publicación"
    case .comment: action = "comentó en tu publicación"
    }
    return (names, others, action)
  }

  /// The whole sentence, e.g. "Ana y 2 personas más le dieron “Me gusta” a tu publicación".
  static func sentence(_ group: ActivityGroup) -> String {
    let (names, others, action) = parts(group)
    let who = others > 0
      ? "\(names[0]) y \(others) \(others == 1 ? "persona más" : "personas más")"
      : names.joined(separator: " y ")
    return "\(who) \(action)"
  }

  /// "Ahora", "5 min", "3 h", "2 d", then the date: "12 feb", or "12 feb 2025" for another year.
  static func timeLabel(_ date: Date, now: Date = Date(), calendar: Calendar = .current) -> String {
    let elapsed = now.timeIntervalSince(date)
    if elapsed < 60 { return "Ahora" }
    if elapsed < 3_600 { return "\(Int(elapsed / 60)) min" }
    if elapsed < 86_400 { return "\(Int(elapsed / 3_600)) h" }
    if elapsed < 7 * 86_400 { return "\(Int(elapsed / 86_400)) d" }
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "es_ES")
    formatter.calendar = calendar
    formatter.timeZone = calendar.timeZone
    let sameYear = calendar.component(.year, from: date) == calendar.component(.year, from: now)
    formatter.dateFormat = sameYear ? "d MMM" : "d MMM yyyy"
    return formatter.string(from: date).replacingOccurrences(of: ".", with: "")
  }
}

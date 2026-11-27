import Foundation

/// Todos · Privados · Grupos, like the web's inbox (`src/features/chat/model/inbox.ts`).
enum InboxFilter: String, CaseIterable, Identifiable {
  case all
  case direct
  case group

  var id: String { rawValue }

  var label: String {
    switch self {
    case .all: return "Todos"
    case .direct: return "Privados"
    case .group: return "Grupos"
    }
  }

  func includes(_ conversation: ChatConversation) -> Bool {
    switch self {
    case .all: return true
    case .direct: return !conversation.isGroup
    case .group: return conversation.isGroup
    }
  }
}

/// How the inbox writes times, previews and searches, the same as the web.
enum InboxFormat {
  private static let spanish = Locale(identifier: "es_ES")

  /// "14:05" today, "Ayer", the weekday this week ("Lun"), else "12 nov".
  static func time(_ date: Date, now: Date = Date(), calendar: Calendar = .current) -> String {
    guard date > .distantPast else { return "" }
    let days = calendar.dateComponents(
      [.day],
      from: calendar.startOfDay(for: date),
      to: calendar.startOfDay(for: now)
    ).day ?? 0
    let formatter = DateFormatter()
    formatter.locale = spanish
    formatter.calendar = calendar
    formatter.timeZone = calendar.timeZone
    if days <= 0 {
      formatter.dateFormat = "HH:mm"
      return formatter.string(from: date)
    }
    if days == 1 { return "Ayer" }
    if days < 7 {
      formatter.dateFormat = "EEE"
      let weekday = formatter.string(from: date).replacingOccurrences(of: ".", with: "")
      return weekday.prefix(1).uppercased() + weekday.dropFirst()
    }
    formatter.dateFormat = "d MMM"
    return formatter.string(from: date).replacingOccurrences(of: ".", with: "")
  }

  /// The last message in one line, "Tú: …" when it is yours.
  static func preview(_ conversation: ChatConversation, uid: String?) -> String {
    guard let text = conversation.lastMessageText?.trimmingCharacters(in: .whitespacesAndNewlines) else {
      return conversation.isGroup ? "Chat del grupo" : "Empieza la conversación"
    }
    let line = text.isEmpty ? "Archivo adjunto" : text
    if let uid, conversation.lastMessageSenderID == uid { return "Tú: \(line)" }
    return line
  }

  /// Whether a name matches a search, ignoring case and accents ("fisica" finds "Física").
  static func matches(_ name: String, query: String) -> Bool {
    let needle = query.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !needle.isEmpty else { return true }
    return name.range(of: needle, options: [.caseInsensitive, .diacriticInsensitive], locale: spanish) != nil
  }
}

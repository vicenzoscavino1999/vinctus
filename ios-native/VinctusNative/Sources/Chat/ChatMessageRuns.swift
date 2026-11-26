import Foundation

/// Where a message sits in a run of messages, like the web's `describeRuns`
/// (`src/features/chat/lib/messageRuns.ts`): messages from the same person within five minutes
/// join one run, with tight spacing, tighter corners on the sender's side and one timestamp.
struct ChatMessageRun: Equatable {
  /// First message of its day: shows the day separator above it.
  let showsDay: Bool
  let joinsPrevious: Bool
  let joinsNext: Bool
}

enum ChatMessageRuns {
  static let gap: TimeInterval = 5 * 60

  static func describe(_ messages: [ChatMessage], calendar: Calendar = .current) -> [String: ChatMessageRun] {
    var runs: [String: ChatMessageRun] = [:]
    for (index, message) in messages.enumerated() {
      let previous = index > 0 ? messages[index - 1] : nil
      let next = index + 1 < messages.count ? messages[index + 1] : nil
      let showsDay = previous.map { !calendar.isDate($0.createdAt, inSameDayAs: message.createdAt) } ?? true
      runs[message.id] = ChatMessageRun(
        showsDay: showsDay,
        joinsPrevious: joins(previous, message, calendar: calendar),
        joinsNext: joins(message, next, calendar: calendar)
      )
    }
    return runs
  }

  static func joins(_ earlier: ChatMessage?, _ later: ChatMessage?, calendar: Calendar = .current) -> Bool {
    guard let earlier, let later else { return false }
    return earlier.senderID == later.senderID
      && calendar.isDate(earlier.createdAt, inSameDayAs: later.createdAt)
      && later.createdAt.timeIntervalSince(earlier.createdAt) < gap
  }

  /// "Hoy", "Ayer", the weekday within a week, else the date (with the year when it differs).
  static func dayLabel(_ date: Date, now: Date = Date(), calendar: Calendar = .current) -> String {
    if calendar.isDate(date, inSameDayAs: now) { return "Hoy" }
    if let yesterday = calendar.date(byAdding: .day, value: -1, to: now),
       calendar.isDate(date, inSameDayAs: yesterday) {
      return "Ayer"
    }
    let days = calendar.dateComponents(
      [.day], from: calendar.startOfDay(for: date), to: calendar.startOfDay(for: now)
    ).day ?? 0
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "es_ES")
    formatter.calendar = calendar
    formatter.timeZone = calendar.timeZone
    if days > 1 && days < 7 {
      formatter.dateFormat = "EEEE d MMM"
    } else if calendar.component(.year, from: date) == calendar.component(.year, from: now) {
      formatter.dateFormat = "d MMM"
    } else {
      formatter.dateFormat = "d MMM yyyy"
    }
    let label = formatter.string(from: date).replacingOccurrences(of: ".", with: "")
    return label.prefix(1).uppercased() + label.dropFirst()
  }
}

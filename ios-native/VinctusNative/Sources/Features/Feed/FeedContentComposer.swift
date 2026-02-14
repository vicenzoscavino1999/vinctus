import Foundation

enum FeedContentComposer {
  static func normalizedSearchQuery(_ text: String) -> String {
    text.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
  }

  static func relativeTimeLabel(from date: Date) -> String {
    let elapsed = max(Int(Date().timeIntervalSince(date)), 0)
    if elapsed >= 24 * 60 * 60 {
      return "Hace \(elapsed / (24 * 60 * 60)) d"
    }
    if elapsed >= 60 * 60 {
      return "Hace \(elapsed / (60 * 60)) h"
    }
    if elapsed >= 60 {
      return "Hace \(elapsed / 60) min"
    }
    return "Ahora"
  }
}

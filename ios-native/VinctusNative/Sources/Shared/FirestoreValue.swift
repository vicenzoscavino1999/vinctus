import FirebaseFirestore
import Foundation

/// Reads loosely typed Firestore fields. Documents are written by the web, the app and Cloud
/// Functions, so numbers can arrive as Int, NSNumber or String and dates as Timestamp or Date.
enum FirestoreValue {
  /// The string with surrounding whitespace removed, or nil when it is missing or empty.
  static func string(_ value: Any?) -> String? {
    guard let string = value as? String else { return nil }
    let trimmed = string.trimmingCharacters(in: .whitespacesAndNewlines)
    return trimmed.isEmpty ? nil : trimmed
  }

  static func int(_ value: Any?) -> Int? {
    if let int = value as? Int { return int }
    if let number = value as? NSNumber { return number.intValue }
    if let string = value as? String { return Int(string) }
    return nil
  }

  static func double(_ value: Any?) -> Double? {
    if let number = value as? NSNumber { return number.doubleValue }
    if let string = value as? String { return Double(string) }
    return nil
  }

  static func date(_ value: Any?) -> Date? {
    if let timestamp = value as? Timestamp { return timestamp.dateValue() }
    if let date = value as? Date { return date }
    return nil
  }

  static func isPermissionDenied(_ error: Error) -> Bool {
    let nsError = error as NSError
    return nsError.domain == FirestoreErrorDomain
      && nsError.code == FirestoreErrorCode.permissionDenied.rawValue
  }
}

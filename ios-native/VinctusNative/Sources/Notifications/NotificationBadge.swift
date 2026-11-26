import FirebaseAuth
import FirebaseCore
import Foundation

/// The number on the bell: unread activity plus pending requests, like the web's header.
/// Shared by every tab's top bar; asked at most every 30 seconds, or at once after a change.
@MainActor
final class NotificationBadge: ObservableObject {
  static let shared = NotificationBadge()

  @Published private(set) var count = 0

  static let minimumInterval: TimeInterval = 30

  private let makeRepo: () -> NotificationsRepo
  private let currentUID: () -> String?
  private var lastRefresh: Date?
  private var lastUID: String?

  init(
    makeRepo: @escaping () -> NotificationsRepo = { AppRepos.notifications() },
    currentUID: @escaping () -> String? = NotificationBadge.signedInUID
  ) {
    self.makeRepo = makeRepo
    self.currentUID = currentUID
  }

  nonisolated static func signedInUID() -> String? {
    if AppRepos.isDemo { return AppRepos.demoUserID }
    return FirebaseApp.app() == nil ? nil : Auth.auth().currentUser?.uid
  }

  func refresh(force: Bool = false) async {
    let uid = currentUID()
    guard let uid else {
      count = 0
      lastUID = nil
      return
    }
    let sameAccount = uid == lastUID
    if !force, sameAccount, let lastRefresh, Date().timeIntervalSince(lastRefresh) < Self.minimumInterval {
      return
    }
    if !sameAccount { count = 0 }
    lastUID = uid
    lastRefresh = Date()
    if let value = try? await makeRepo().badgeCount(), lastUID == uid {
      count = value
    }
  }
}

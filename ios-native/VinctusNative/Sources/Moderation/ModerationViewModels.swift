import Foundation

/// The report form: a reason and optional details, sent once.
@MainActor
final class ReportViewModel: ObservableObject {
  @Published var reason: ReportReason = .spam
  @Published var details = ""
  @Published private(set) var isSubmitting = false
  @Published private(set) var didSubmit = false
  @Published private(set) var errorMessage: String?

  static let detailsLimit = 1000

  private let target: ReportTarget
  private let repo: ModerationRepo

  init(target: ReportTarget, repo: ModerationRepo) {
    self.target = target
    self.repo = repo
  }

  var detailsCharactersLeft: Int { Self.detailsLimit - details.count }

  var canSubmit: Bool { !isSubmitting && !didSubmit && details.count <= Self.detailsLimit }

  func submit() async {
    guard canSubmit else { return }
    isSubmitting = true
    errorMessage = nil
    defer { isSubmitting = false }
    do {
      try await repo.report(target, reason: reason, details: details)
      didSubmit = true
    } catch {
      errorMessage = error.localizedDescription
    }
  }
}

/// Settings > Usuarios bloqueados: names of the blocked users and unblocking. The blocked IDs
/// live in the shared `BlockedUsersStore`, which the view gets from the environment.
@MainActor
final class BlockedUsersViewModel: ObservableObject {
  @Published private(set) var displayNames: [String: String] = [:]
  @Published private(set) var pendingUserID: String?
  @Published private(set) var errorMessage: String?

  private let profileRepo: ProfileRepo

  init(profileRepo: ProfileRepo) {
    self.profileRepo = profileRepo
  }

  func displayName(for userID: String) -> String {
    displayNames[userID] ?? "Usuario"
  }

  /// Reloads the blocked IDs, then the names not loaded yet.
  func reload(_ store: BlockedUsersStore) async {
    await store.refresh()
    for userID in store.blockedUserIDs.sorted() where displayNames[userID] == nil {
      if let profile = try? await profileRepo.fetchUserProfile(uid: userID) {
        displayNames[userID] = profile.displayName
      }
    }
  }

  func unblock(_ userID: String, in store: BlockedUsersStore) async {
    guard pendingUserID == nil else { return }
    pendingUserID = userID
    errorMessage = nil
    defer { pendingUserID = nil }
    do {
      try await store.unblock(userID)
    } catch {
      errorMessage = error.localizedDescription
    }
  }
}

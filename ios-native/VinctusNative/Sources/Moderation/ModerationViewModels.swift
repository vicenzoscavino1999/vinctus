import Foundation

/// The report form: a reason and optional details, sent once.
@MainActor
final class ReportViewModel: ObservableObject {
  @Published var reason: ReportReason = .spam
  @Published var details = ""
  @Published private(set) var isSubmitting = false
  @Published private(set) var didSubmit = false
  @Published private(set) var errorMessage: String?

  static let detailsLimit = Limits.Reports.detailsMaxLength

  private let target: ReportTarget
  private let repo: ModerationRepo

  init(target: ReportTarget, repo: ModerationRepo) {
    self.target = target
    self.repo = repo
  }

  var maxUserDetailsLength: Int {
    ReportFields.maxUserDetailsLength(for: target)
  }

  var detailsCharactersLeft: Int {
    maxUserDetailsLength - details.utf8.count
  }

  var canSubmit: Bool {
    !isSubmitting &&
      !didSubmit &&
      detailsCharactersLeft >= 0 &&
      ReportFields(target: target, details: details).fitsRules
  }

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
  @Published private(set) var isLoading = false
  @Published private(set) var loadError: String?
  @Published private(set) var pendingUserID: String?
  @Published private(set) var errorMessage: String?

  private let profileRepo: ProfileRepo
  private var loadGeneration = 0

  init(profileRepo: ProfileRepo) {
    self.profileRepo = profileRepo
  }

  func displayName(for userID: String) -> String {
    displayNames[userID] ?? "Usuario"
  }

  /// Reloads the blocked IDs, then the names not loaded yet.
  func reload(_ store: BlockedUsersStore) async {
    loadGeneration += 1
    let generation = loadGeneration
    isLoading = true
    loadError = nil
    defer {
      if generation == loadGeneration {
        isLoading = false
      }
    }

    await store.refresh()
    guard !Task.isCancelled, generation == loadGeneration else { return }

    if let storeError = store.lastLoadError {
      loadError = storeError
      return
    }

    for userID in store.blockedUserIDs.sorted() where displayNames[userID] == nil {
      guard !Task.isCancelled, generation == loadGeneration else { return }
      if let profile = try? await profileRepo.fetchUserProfile(uid: userID) {
        guard !Task.isCancelled, generation == loadGeneration else { return }
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

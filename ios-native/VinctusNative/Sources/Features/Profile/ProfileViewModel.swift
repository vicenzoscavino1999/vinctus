import Foundation

@MainActor
final class ProfileViewModel: ObservableObject {
  @Published private(set) var profile: UserProfile?
  @Published private(set) var isLoading = false
  @Published private(set) var errorMessage: String?

  private let repo: ProfileRepo

  init(repo: ProfileRepo) {
    self.repo = repo
  }

  func load(userID: String) async {
    let normalizedUID = userID.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !normalizedUID.isEmpty else {
      profile = nil
      errorMessage = "UID invalido"
      return
    }

    isLoading = true
    errorMessage = nil
    defer { isLoading = false }

    do {
      profile = try await repo.fetchUserProfile(uid: normalizedUID)
      if profile == nil {
        errorMessage = "No encontramos este perfil."
      }
    } catch {
      AppLog.profile.error("profile.load.failed errorType=\(AppLog.errorType(error), privacy: .public)")
      errorMessage = error.localizedDescription
    }
  }
}

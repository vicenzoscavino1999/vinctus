import Foundation

/// Whether the user agreed to send their messages to the external AI providers, saved on the user
/// profile like on the web (App Review Guideline 5.1.2(i)).
@MainActor
final class AIConsentViewModel: ObservableObject {
  /// nil until loaded; a failed load counts as not granted.
  @Published private(set) var consent: AIConsentState?
  @Published private(set) var isSaving = false
  @Published private(set) var errorMessage: String?

  private let source: AIConsentSource
  private let repo: AIConsentRepo

  init(source: AIConsentSource, repo: AIConsentRepo) {
    self.source = source
    self.repo = repo
  }

  var isGranted: Bool { consent?.granted == true }

  var isLoading: Bool { consent == nil && errorMessage == nil }

  func load(uid: String?) async {
    guard let uid else { return }
    do {
      consent = try await repo.getConsent(uid: uid)
      errorMessage = nil
    } catch {
      consent = .default
      errorMessage = "No se pudo cargar tu consentimiento de IA."
    }
  }

  func grant(uid: String?) async {
    guard let uid, !isSaving else { return }
    isSaving = true
    defer { isSaving = false }
    do {
      try await repo.setConsent(uid: uid, granted: true, source: source)
      consent = AIConsentState(granted: true, recorded: true, source: source, updatedAt: Date())
      errorMessage = nil
    } catch {
      errorMessage = "No se pudo guardar tu consentimiento. Intenta de nuevo."
    }
  }
}

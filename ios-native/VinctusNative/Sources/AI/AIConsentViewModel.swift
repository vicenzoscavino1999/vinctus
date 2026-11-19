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
  private var loadGeneration = 0

  init(source: AIConsentSource, repo: AIConsentRepo) {
    self.source = source
    self.repo = repo
  }

  var isGranted: Bool { consent?.granted == true }

  var isLoading: Bool { consent == nil && errorMessage == nil }

  func load(uid: String?) async {
    loadGeneration += 1
    let generation = loadGeneration
    consent = nil
    errorMessage = nil

    guard let uid, !uid.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
    do {
      let loaded = try await repo.getConsent(uid: uid)
      guard !Task.isCancelled, generation == loadGeneration else { return }
      consent = loaded
      errorMessage = nil
    } catch {
      guard !Task.isCancelled, generation == loadGeneration else { return }
      consent = .default
      errorMessage = "No se pudo cargar tu consentimiento de IA."
    }
  }

  func grant(uid: String?) async {
    guard let uid, !uid.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, !isSaving else {
      return
    }
    let generation = loadGeneration
    isSaving = true
    defer { isSaving = false }
    do {
      try await repo.setConsent(uid: uid, granted: true, source: source)
      guard generation == loadGeneration else { return }
      consent = AIConsentState(granted: true, recorded: true, source: source, updatedAt: Date())
      errorMessage = nil
    } catch {
      guard generation == loadGeneration else { return }
      errorMessage = "No se pudo guardar tu consentimiento. Intenta de nuevo."
    }
  }
}

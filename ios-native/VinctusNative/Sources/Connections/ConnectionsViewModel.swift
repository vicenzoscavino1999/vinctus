import Foundation

/// How the signed-in user relates to a collaboration, for its badge (like the web's ProjectsPage:
/// "Tu proyecto", "Solicitud enviada").
enum CollaborationRelation: Equatable {
  case own
  case requested
  case available

  var badge: String? {
    switch self {
    case .own: return "Tu proyecto"
    case .requested: return "Solicitud enviada"
    case .available: return nil
    }
  }

  static func of(_ collaboration: Collaboration, uid: String?, requestedIDs: Set<String>) -> CollaborationRelation {
    if let uid, collaboration.authorID == uid { return .own }
    if requestedIDs.contains(collaboration.id) { return .requested }
    return .available
  }
}

@MainActor
final class ConnectionsViewModel: ObservableObject {
  @Published private(set) var collaborations: [Collaboration] = []
  @Published private(set) var encounters: [Encounter] = []
  @Published private(set) var requestedIDs: Set<String> = []
  @Published private(set) var isLoadingCollaborations = false
  @Published private(set) var isLoadingEncounters = false
  @Published private(set) var collaborationsError: String?
  @Published private(set) var encountersError: String?
  @Published private(set) var isSubmitting = false
  /// A short confirmation or error after an action, shown under the header.
  @Published var notice: String?

  private let repo: ConnectionsRepo

  init(repo: ConnectionsRepo) {
    self.repo = repo
  }

  func relation(of collaboration: Collaboration, uid: String?) -> CollaborationRelation {
    CollaborationRelation.of(collaboration, uid: uid, requestedIDs: requestedIDs)
  }

  func load(uid: String?) async {
    await loadCollaborations(uid: uid)
    await loadEncounters()
  }

  func loadCollaborations(uid: String?) async {
    isLoadingCollaborations = true
    defer { isLoadingCollaborations = false }
    do {
      collaborations = try await repo.fetchCollaborations(limit: 20)
      collaborationsError = nil
    } catch {
      collaborationsError = "No se pudieron cargar las colaboraciones."
    }
    if let uid {
      // A failure here only hides the "Solicitud enviada" badges.
      requestedIDs = (try? await repo.fetchRequestedCollaborationIDs(uid: uid)) ?? requestedIDs
    } else {
      requestedIDs = []
    }
  }

  func loadEncounters() async {
    isLoadingEncounters = true
    defer { isLoadingEncounters = false }
    do {
      encounters = try await repo.fetchUpcomingEncounters(limit: 12)
      encountersError = nil
    } catch {
      encountersError = "No se pudieron cargar los encuentros."
    }
  }

  // MARK: Collaborations

  /// Publishes the draft; returns true when it was saved.
  func publish(_ draft: CollaborationDraft, uid: String?) async -> Bool {
    guard uid != nil else {
      notice = "Inicia sesión para publicar proyectos."
      return false
    }
    guard let valid = draft.validated() else {
      notice = ConnectionsRepoError.invalidDraft.errorDescription
      return false
    }
    isSubmitting = true
    defer { isSubmitting = false }
    do {
      let author = try await repo.currentAuthor()
      _ = try await repo.createCollaboration(valid, author: author)
      notice = "Proyecto publicado."
      await loadCollaborations(uid: uid)
      return true
    } catch {
      notice = Self.message(for: error, fallback: "No se pudo publicar el proyecto.")
      return false
    }
  }

  func sendRequest(to collaboration: Collaboration, message: String, uid: String?) async -> Bool {
    guard let uid else {
      notice = "Inicia sesión para enviar solicitudes."
      return false
    }
    guard relation(of: collaboration, uid: uid) == .available else { return false }
    isSubmitting = true
    defer { isSubmitting = false }
    do {
      let author = try await repo.currentAuthor()
      try await repo.sendCollaborationRequest(to: collaboration, from: author, message: message)
      requestedIDs.insert(collaboration.id)
      notice = "Solicitud enviada."
      return true
    } catch ConnectionsRepoError.requestAlreadySent, ConnectionsRepoError.requestAlreadyAccepted {
      requestedIDs.insert(collaboration.id)
      notice = "Ya enviaste una solicitud para este proyecto."
      return false
    } catch {
      notice = Self.message(for: error, fallback: "No se pudo enviar la solicitud.")
      return false
    }
  }

  func delete(_ collaboration: Collaboration, uid: String?) async -> Bool {
    guard let uid, collaboration.authorID == uid else { return false }
    isSubmitting = true
    defer { isSubmitting = false }
    do {
      try await repo.deleteCollaboration(id: collaboration.id, authorID: uid)
      collaborations.removeAll { $0.id == collaboration.id }
      notice = "Proyecto eliminado."
      return true
    } catch {
      notice = Self.message(for: error, fallback: "No se pudo eliminar el proyecto.")
      return false
    }
  }

  // MARK: Encounters

  func publish(_ draft: EncounterDraft, uid: String?) async -> Bool {
    guard let uid else {
      notice = "Inicia sesión para publicar encuentros."
      return false
    }
    guard let valid = draft.validated() else {
      notice = "Revisa el título, la fecha (debe ser futura) y el aforo."
      return false
    }
    isSubmitting = true
    defer { isSubmitting = false }
    do {
      _ = try await repo.createEncounter(valid, ownerID: uid)
      notice = "Encuentro publicado."
      await loadEncounters()
      return true
    } catch {
      notice = Self.message(for: error, fallback: "No se pudo publicar el encuentro.")
      return false
    }
  }

  func removeEncounter(id: String) {
    encounters.removeAll { $0.id == id }
  }

  static func message(for error: Error, fallback: String) -> String {
    if let repoError = error as? ConnectionsRepoError, let description = repoError.errorDescription {
      return description
    }
    if FirestoreValue.isPermissionDenied(error) {
      return "No tienes permiso para hacer esto."
    }
    return fallback
  }
}

/// Attendance for one encounter, in its detail sheet.
@MainActor
final class EncounterDetailViewModel: ObservableObject {
  @Published private(set) var isAttending = false
  @Published private(set) var attendeesCount: Int?
  @Published private(set) var isBusy = false
  @Published var errorMessage: String?

  let encounter: Encounter
  private let repo: ConnectionsRepo

  init(encounter: Encounter, repo: ConnectionsRepo) {
    self.encounter = encounter
    self.repo = repo
    self.attendeesCount = encounter.attendeesCount
  }

  func isOwner(uid: String?) -> Bool { uid != nil && uid == encounter.createdBy }

  var isFull: Bool {
    guard let capacity = encounter.capacity, capacity > 0, let attendeesCount else { return false }
    return attendeesCount >= capacity
  }

  func load(uid: String?) async {
    guard let uid else { return }
    isAttending = (try? await repo.isAttending(encounterID: encounter.id, uid: uid)) ?? false
  }

  func toggleAttendance(uid: String?) async {
    guard let uid else {
      errorMessage = "Inicia sesión para asistir."
      return
    }
    isBusy = true
    defer { isBusy = false }
    do {
      if isAttending {
        try await repo.leaveEncounter(encounterID: encounter.id, uid: uid)
        isAttending = false
        attendeesCount = attendeesCount.map { max(0, $0 - 1) }
      } else {
        guard !isFull else {
          errorMessage = "Aforo completo."
          return
        }
        try await repo.joinEncounter(encounterID: encounter.id, uid: uid)
        isAttending = true
        attendeesCount = (attendeesCount ?? 0) + 1
      }
      errorMessage = nil
    } catch {
      errorMessage = ConnectionsViewModel.message(for: error, fallback: "No se pudo actualizar tu asistencia.")
    }
  }

  /// Deletes the encounter; returns true when it was deleted.
  func delete(uid: String?) async -> Bool {
    guard isOwner(uid: uid) else { return false }
    isBusy = true
    defer { isBusy = false }
    do {
      try await repo.deleteEncounter(encounterID: encounter.id)
      return true
    } catch {
      errorMessage = ConnectionsViewModel.message(for: error, fallback: "No se pudo eliminar el encuentro.")
      return false
    }
  }
}

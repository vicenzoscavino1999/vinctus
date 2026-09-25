import SwiftUI

/// Blocked user IDs of the signed-in user. Shared by every tab through the environment, so a
/// blocked author disappears everywhere as soon as they are blocked.
@MainActor
final class BlockedUsersStore: ObservableObject {
  @Published private(set) var blockedUserIDs: Set<String> = []

  let repo: ModerationRepo

  init(repo: ModerationRepo) {
    self.repo = repo
  }

  func refresh() async {
    do {
      blockedUserIDs = try await repo.fetchBlockedUserIDs()
    } catch {
      AppLog.moderation.error(
        "blocked.load.failed errorType=\(AppLog.errorType(error), privacy: .public)"
      )
    }
  }

  func isBlocked(_ userID: String?) -> Bool {
    guard let userID else { return false }
    return blockedUserIDs.contains(userID)
  }

  func block(_ userID: String) async throws {
    try await repo.blockUser(userID)
    blockedUserIDs.insert(userID)
  }

  func unblock(_ userID: String) async throws {
    try await repo.unblockUser(userID)
    blockedUserIDs.remove(userID)
  }
}

/// "..." menu to report content and block (or unblock) its author. Blocking asks for
/// confirmation first.
@MainActor
struct ModerationMenu: View {
  let target: ReportTarget
  let authorID: String?
  let authorName: String
  var onBlocked: (() -> Void)? = nil

  @EnvironmentObject private var authVM: AuthViewModel
  @EnvironmentObject private var blockedUsers: BlockedUsersStore
  @State private var isShowingReport = false
  @State private var isConfirmingBlock = false
  @State private var isUpdatingBlock = false
  @State private var actionError: String?

  var body: some View {
    Menu {
      Button {
        isShowingReport = true
      } label: {
        Label(target.title, systemImage: "flag")
      }

      if let blockableAuthorID {
        if blockedUsers.isBlocked(blockableAuthorID) {
          Button {
            unblock()
          } label: {
            Label("Desbloquear a \(authorName)", systemImage: "hand.raised.slash")
          }
        } else {
          Button(role: .destructive) {
            isConfirmingBlock = true
          } label: {
            Label("Bloquear a \(authorName)", systemImage: "hand.raised")
          }
        }
      }
    } label: {
      Image(systemName: "ellipsis")
        .font(.body.weight(.semibold))
        .foregroundStyle(VinctusTokens.Color.textMuted)
        .frame(width: 32, height: 32)
        .contentShape(Rectangle())
    }
    .buttonStyle(.borderless)
    .accessibilityLabel("Mas opciones")
    .disabled(isUpdatingBlock)
    .sheet(isPresented: $isShowingReport) {
      ReportSheet(target: target, repo: blockedUsers.repo)
    }
    .confirmationDialog(
      "Bloquear a \(authorName)",
      isPresented: $isConfirmingBlock,
      titleVisibility: .visible
    ) {
      Button("Bloquear", role: .destructive) {
        block()
      }
      Button("Cancelar", role: .cancel) {}
    } message: {
      Text(
        "Dejaras de ver sus publicaciones y comentarios, y se eliminara el seguimiento entre ustedes. Puedes desbloquearlo en Ajustes."
      )
    }
    .alert(
      "No se pudo completar",
      isPresented: Binding(
        get: { actionError != nil },
        set: { isPresented in
          if !isPresented { actionError = nil }
        }
      )
    ) {
      Button("OK", role: .cancel) {}
    } message: {
      Text(actionError ?? "")
    }
  }

  private var blockableAuthorID: String? {
    guard let authorID, !authorID.isEmpty, authorID != authVM.currentUserID else { return nil }
    return authorID
  }

  private func block() {
    guard let authorID = blockableAuthorID else { return }
    isUpdatingBlock = true
    Task {
      do {
        try await blockedUsers.block(authorID)
        onBlocked?()
      } catch {
        actionError = error.localizedDescription
      }
      isUpdatingBlock = false
    }
  }

  private func unblock() {
    guard let authorID = blockableAuthorID else { return }
    isUpdatingBlock = true
    Task {
      do {
        try await blockedUsers.unblock(authorID)
      } catch {
        actionError = error.localizedDescription
      }
      isUpdatingBlock = false
    }
  }
}

@MainActor
struct ReportSheet: View {
  let target: ReportTarget
  let repo: ModerationRepo

  @Environment(\.dismiss) private var dismiss
  @State private var reason: ReportReason = .spam
  @State private var details = ""
  @State private var isSubmitting = false
  @State private var didSubmit = false
  @State private var errorMessage: String?

  private let detailsLimit = 1000

  var body: some View {
    NavigationStack {
      Form {
        if didSubmit {
          Section {
            Label("Gracias. Revisaremos tu denuncia.", systemImage: "checkmark.shield")
          } footer: {
            Text("El equipo de moderacion revisa las denuncias y retira el contenido que incumple las normas de la comunidad.")
          }
        } else {
          Section("Motivo") {
            Picker("Motivo", selection: $reason) {
              ForEach(ReportReason.allCases) { reason in
                Text(reason.title).tag(reason)
              }
            }
            .pickerStyle(.inline)
            .labelsHidden()
          }

          Section {
            TextField("Detalles (opcional)", text: $details, axis: .vertical)
              .lineLimit(3...6)
          } footer: {
            Text("\(detailsLimit - details.count) caracteres restantes")
              .foregroundStyle(details.count > detailsLimit ? .red : .secondary)
          }

          if let errorMessage {
            Section {
              Text(errorMessage)
                .font(.footnote)
                .foregroundStyle(.red)
            }
          }
        }
      }
      .navigationTitle(target.title)
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(didSubmit ? "Cerrar" : "Cancelar") {
            dismiss()
          }
        }
        ToolbarItem(placement: .confirmationAction) {
          if !didSubmit {
            Button("Enviar") {
              submit()
            }
            .disabled(isSubmitting || details.count > detailsLimit)
          }
        }
      }
      .vinctusLoading(isSubmitting)
    }
  }

  private func submit() {
    isSubmitting = true
    errorMessage = nil
    Task {
      do {
        try await repo.report(target, reason: reason, details: details)
        didSubmit = true
      } catch {
        errorMessage = error.localizedDescription
      }
      isSubmitting = false
    }
  }
}

@MainActor
struct BlockedUsersView: View {
  @EnvironmentObject private var blockedUsers: BlockedUsersStore
  @State private var displayNames: [String: String] = [:]
  @State private var pendingUserID: String?
  @State private var errorMessage: String?

  private let profileRepo: ProfileRepo

  init(profileRepo: ProfileRepo = FirebaseProfileRepo()) {
    self.profileRepo = profileRepo
  }

  var body: some View {
    List {
      if blockedUsers.blockedUserIDs.isEmpty {
        Text("No has bloqueado a nadie.")
          .foregroundStyle(.secondary)
      } else {
        ForEach(blockedUsers.blockedUserIDs.sorted(), id: \.self) { userID in
          HStack {
            Text(displayNames[userID] ?? "Usuario")
            Spacer()
            Button("Desbloquear") {
              unblock(userID)
            }
            .buttonStyle(.borderless)
            .disabled(pendingUserID != nil)
          }
        }
      }

      if let errorMessage {
        Text(errorMessage)
          .font(.footnote)
          .foregroundStyle(.red)
      }
    }
    .navigationTitle("Usuarios bloqueados")
    .task {
      await reload()
    }
    .refreshable {
      await reload()
    }
  }

  private func reload() async {
    await blockedUsers.refresh()
    for userID in blockedUsers.blockedUserIDs where displayNames[userID] == nil {
      if let profile = try? await profileRepo.fetchUserProfile(uid: userID) {
        displayNames[userID] = profile.displayName
      }
    }
  }

  private func unblock(_ userID: String) {
    pendingUserID = userID
    errorMessage = nil
    Task {
      do {
        try await blockedUsers.unblock(userID)
      } catch {
        errorMessage = error.localizedDescription
      }
      pendingUserID = nil
    }
  }
}

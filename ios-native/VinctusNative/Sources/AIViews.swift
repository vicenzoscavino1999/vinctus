import SwiftUI

// MARK: - Consent

/// Shows `content` only after the user agrees to send their messages to the external AI
/// providers (App Review Guideline 5.1.2(i)). The choice is saved on the user profile, like on
/// the web, and can be withdrawn from Settings.
struct AIConsentGate<Content: View>: View {
  let source: AIConsentSource
  @ViewBuilder let content: () -> Content

  @EnvironmentObject private var authVM: AuthViewModel
  @State private var consent: AIConsentState?
  @State private var isSaving = false
  @State private var errorMessage: String?

  private let repo: AIConsentRepo = FirebaseAIConsentRepo()

  var body: some View {
    Group {
      if consent?.granted == true {
        content()
      } else if consent == nil && errorMessage == nil {
        ProgressView()
          .frame(maxWidth: .infinity, maxHeight: .infinity)
      } else {
        consentRequest
      }
    }
    .task(id: authVM.currentUserID) {
      await load()
    }
  }

  private var consentRequest: some View {
    ScrollView {
      VCard {
        VStack(alignment: .leading, spacing: VinctusTokens.Spacing.md) {
          Label("Antes de usar la IA", systemImage: "sparkles")
            .font(.headline)
            .foregroundStyle(VinctusTokens.Color.accent)

          Text(
            "Para responderte, lo que escribas se envía a proveedores externos de inteligencia artificial: Google (Gemini) y NVIDIA."
          )
          Text("No se envían tu correo ni tu nombre, y quitamos correos y teléfonos del texto.")
            .foregroundStyle(VinctusTokens.Color.textMuted)
          Text("Puedes retirar este permiso cuando quieras en Perfil > Ajustes > IA.")
            .foregroundStyle(VinctusTokens.Color.textMuted)

          Link("Ver la Política de privacidad", destination: LegalConfig.privacyPolicyURL)
            .font(.footnote)
            .foregroundStyle(VinctusTokens.Color.accent)

          if let errorMessage {
            Text(errorMessage)
              .font(.footnote)
              .foregroundStyle(.red)
          }

          VButton("Acepto enviar mis mensajes a la IA") {
            Task { await grant() }
          }
          .disabled(isSaving || authVM.currentUserID == nil)
        }
      }
      .padding(VinctusTokens.Spacing.lg)
    }
    .vinctusLoading(isSaving)
  }

  private func load() async {
    guard let uid = authVM.currentUserID else { return }
    do {
      consent = try await repo.getConsent(uid: uid)
      errorMessage = nil
    } catch {
      consent = .default
      errorMessage = "No se pudo cargar tu consentimiento de IA."
    }
  }

  private func grant() async {
    guard let uid = authVM.currentUserID else { return }
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

// MARK: - Hub

struct AIHubView: View {
  let repo: AIRepo

  var body: some View {
    List {
      Section {
        NavigationLink(destination: AIChatView(repo: repo)) {
          Label {
            VStack(alignment: .leading, spacing: 2) {
              Text("Chat con IA")
              Text("Pregúntale lo que quieras al asistente de Vinctus.")
                .font(.footnote)
                .foregroundStyle(VinctusTokens.Color.textMuted)
            }
          } icon: {
            Image(systemName: "bubble.left.and.text.bubble.right")
          }
        }

        NavigationLink(destination: ArenaView(repo: repo)) {
          Label {
            VStack(alignment: .leading, spacing: 2) {
              Text("Arena IA")
              Text("Dos personalidades de IA debaten un tema y un juez da el veredicto.")
                .font(.footnote)
                .foregroundStyle(VinctusTokens.Color.textMuted)
            }
          } icon: {
            Image(systemName: "person.2.wave.2")
          }
        }
      } footer: {
        Text("Las respuestas las genera una IA y pueden contener errores.")
      }
    }
    .navigationTitle("IA")
  }
}

// MARK: - Chat

@MainActor
final class AIChatViewModel: ObservableObject {
  @Published private(set) var messages: [AIChatMessage] = []
  @Published var draft = ""
  @Published private(set) var isSending = false
  @Published var errorMessage: String?

  private let repo: AIRepo

  init(repo: AIRepo) {
    self.repo = repo
  }

  var canSend: Bool {
    let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
    return !isSending && !text.isEmpty && text.count <= FirebaseAIRepo.maxMessageLength
  }

  func send() {
    let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
    guard canSend else { return }
    let previous = messages
    messages.append(AIChatMessage(role: "user", parts: [.init(text: text)]))
    draft = ""
    errorMessage = nil
    isSending = true

    Task {
      do {
        messages = try await repo.sendChatMessage(text, history: previous)
      } catch {
        messages = previous
        draft = text
        errorMessage = error.localizedDescription
      }
      isSending = false
    }
  }
}

struct AIChatView: View {
  @StateObject private var vm: AIChatViewModel

  init(repo: AIRepo) {
    _vm = StateObject(wrappedValue: AIChatViewModel(repo: repo))
  }

  var body: some View {
    AIConsentGate(source: .aiChat) {
      VStack(spacing: 0) {
        ScrollViewReader { proxy in
          ScrollView {
            LazyVStack(alignment: .leading, spacing: VinctusTokens.Spacing.sm) {
              if vm.messages.isEmpty {
                Text("Escribe una pregunta para empezar. Las respuestas las genera una IA y pueden contener errores.")
                  .font(.footnote)
                  .foregroundStyle(VinctusTokens.Color.textMuted)
                  .padding(.top, VinctusTokens.Spacing.lg)
              }

              ForEach(vm.messages) { message in
                AIChatBubble(message: message)
                  .id(message.id)
              }

              if vm.isSending {
                HStack(spacing: 8) {
                  ProgressView()
                  Text("Pensando...")
                    .font(.footnote)
                    .foregroundStyle(VinctusTokens.Color.textMuted)
                }
                .id("typing")
              }
            }
            .padding(VinctusTokens.Spacing.lg)
          }
          .onChange(of: vm.messages.count) { _, _ in
            withAnimation {
              if vm.isSending {
                proxy.scrollTo("typing")
              } else if let lastID = vm.messages.last?.id {
                proxy.scrollTo(lastID)
              }
            }
          }
        }

        if let error = vm.errorMessage {
          Text(error)
            .font(.footnote)
            .foregroundStyle(.red)
            .padding(.horizontal, VinctusTokens.Spacing.lg)
            .padding(.top, VinctusTokens.Spacing.xs)
        }

        HStack(alignment: .bottom, spacing: VinctusTokens.Spacing.sm) {
          TextField("Escribe un mensaje", text: $vm.draft, axis: .vertical)
            .lineLimit(1...5)
            .padding(10)
            .background(VinctusTokens.Color.surface2)
            .clipShape(RoundedRectangle(cornerRadius: VinctusTokens.Radius.sm, style: .continuous))

          Button {
            vm.send()
          } label: {
            Image(systemName: "arrow.up.circle.fill")
              .font(.title)
          }
          .disabled(!vm.canSend)
          .accessibilityLabel("Enviar")
        }
        .padding(VinctusTokens.Spacing.md)
        .background(VinctusTokens.Color.surface)
      }
    }
    .navigationTitle("Chat con IA")
    .navigationBarTitleDisplayMode(.inline)
  }
}

private struct AIChatBubble: View {
  let message: AIChatMessage

  var body: some View {
    HStack {
      if message.isUser { Spacer(minLength: 40) }
      VStack(alignment: .leading, spacing: 4) {
        Text(message.text)
          .textSelection(.enabled)
          .padding(12)
          .background(message.isUser ? VinctusTokens.Color.accent.opacity(0.22) : VinctusTokens.Color.surface2)
          .clipShape(RoundedRectangle(cornerRadius: VinctusTokens.Radius.md, style: .continuous))

        if !message.isUser {
          AIReportButton(target: .aiResponse(contextID: "chat", excerpt: message.text))
        }
      }
      if !message.isUser { Spacer(minLength: 40) }
    }
  }
}

/// Lets people flag an offensive or harmful AI reply; it reaches the moderation queue like any
/// other report.
private struct AIReportButton: View {
  let target: ReportTarget

  @EnvironmentObject private var blockedUsers: BlockedUsersStore
  @State private var isShowingReport = false

  var body: some View {
    Button {
      isShowingReport = true
    } label: {
      Label("Denunciar respuesta", systemImage: "flag")
        .font(.caption)
        .foregroundStyle(VinctusTokens.Color.textMuted)
    }
    .buttonStyle(.borderless)
    .sheet(isPresented: $isShowingReport) {
      ReportSheet(target: target, repo: blockedUsers.repo)
    }
  }
}

// MARK: - Arena

@MainActor
final class ArenaViewModel: ObservableObject {
  static let maxTopicLength = 500

  @Published private(set) var personas: [ArenaPersona] = []
  @Published private(set) var usage: ArenaUsage?
  @Published var topic = ""
  @Published var personaA = ""
  @Published var personaB = ""
  @Published private(set) var isLoading = false
  @Published private(set) var isCreating = false
  @Published private(set) var result: ArenaDebateResult?
  /// Names of the two sides of `result`, fixed when it was created.
  @Published private(set) var resultNames: [String: String] = [:]
  /// The debate that `result` answers, to save it on the profile.
  @Published private(set) var resultDebate: SavedDebate?
  @Published private(set) var isResultSaved = false
  @Published private(set) var isSavingResult = false
  @Published var errorMessage: String?

  private let repo: AIRepo

  init(repo: AIRepo) {
    self.repo = repo
  }

  var canCreate: Bool {
    let text = topic.trimmingCharacters(in: .whitespacesAndNewlines)
    return !isCreating && !text.isEmpty && text.count <= Self.maxTopicLength
      && !personaA.isEmpty && !personaB.isEmpty && personaA != personaB
      && (usage?.remaining ?? 1) > 0
  }

  func persona(_ id: String) -> ArenaPersona? {
    personas.first { $0.id == id }
  }

  func load() async {
    isLoading = true
    defer { isLoading = false }
    do {
      personas = try await repo.fetchArenaPersonas()
      if personaA.isEmpty, let first = personas.first { personaA = first.id }
      if personaB.isEmpty, personas.count > 1 { personaB = personas[1].id }
      usage = try? await repo.fetchArenaUsage()
      errorMessage = nil
    } catch {
      errorMessage = error.localizedDescription
    }
  }

  /// Saves the last debate to the profile, like "Guardar debate" on the web.
  func saveResult(repo: ProfileContentRepo = AppRepos.profileContent()) {
    guard let resultDebate, !isResultSaved, !isSavingResult else { return }
    isSavingResult = true
    Task {
      do {
        try await repo.saveDebate(resultDebate)
        isResultSaved = true
      } catch {
        errorMessage = "No se pudo guardar el debate."
      }
      isSavingResult = false
    }
  }

  func create() {
    guard canCreate else { return }
    let text = topic.trimmingCharacters(in: .whitespacesAndNewlines)
    isCreating = true
    errorMessage = nil
    result = nil

    Task {
      do {
        let debate = try await repo.createDebate(topic: text, personaA: personaA, personaB: personaB)
        result = debate
        resultDebate = SavedDebate(
          id: debate.debateID, topic: text, personaA: personaA, personaB: personaB,
          summary: debate.summary.isEmpty ? nil : debate.summary, winner: debate.winner, createdAt: nil
        )
        isResultSaved = false
        resultNames = [
          "A": persona(personaA)?.name ?? "Participante A",
          "B": persona(personaB)?.name ?? "Participante B",
        ]
        if let usage, let remaining = debate.remaining {
          self.usage = ArenaUsage(used: usage.limit - remaining, limit: usage.limit, remaining: remaining)
        }
      } catch {
        errorMessage = error.localizedDescription
      }
      isCreating = false
    }
  }
}

struct ArenaView: View {
  @StateObject private var vm: ArenaViewModel

  init(repo: AIRepo) {
    _vm = StateObject(wrappedValue: ArenaViewModel(repo: repo))
  }

  var body: some View {
    AIConsentGate(source: .arena) {
      Form {
        Section {
          TextField("Tema del debate", text: $vm.topic, axis: .vertical)
            .lineLimit(2...4)
          Picker("A favor", selection: $vm.personaA) {
            ForEach(vm.personas) { persona in
              Text(persona.name).tag(persona.id)
            }
          }
          Picker("En contra", selection: $vm.personaB) {
            ForEach(vm.personas) { persona in
              Text(persona.name).tag(persona.id)
            }
          }
        } header: {
          Text("Nuevo debate")
        } footer: {
          VStack(alignment: .leading, spacing: 4) {
            if vm.personaA == vm.personaB && !vm.personaA.isEmpty {
              Text("Elige dos personalidades distintas.")
                .foregroundStyle(.red)
            }
            if let usage = vm.usage {
              Text("Debates disponibles hoy: \(usage.remaining) de \(usage.limit).")
            }
            Text("Tus debates desde la app son privados.")
          }
        }

        Section {
          Button {
            vm.create()
          } label: {
            HStack {
              if vm.isCreating {
                ProgressView()
                Text("Generando el debate (puede tardar hasta 2 minutos)...")
              } else {
                Text("Crear debate")
              }
            }
          }
          .disabled(!vm.canCreate)
        }

        if let error = vm.errorMessage {
          Section {
            Text(error)
              .font(.footnote)
              .foregroundStyle(.red)
          }
        }

        if let result = vm.result {
          if !result.turns.isEmpty {
            Section("Debate") {
              ForEach(result.turns) { turn in
                VStack(alignment: .leading, spacing: 4) {
                  Text(speakerName(turn.speaker))
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(turn.speaker == "A" ? VinctusTokens.Color.accent : VinctusTokens.Color.accentAlt)
                  Text(turn.text)
                    .textSelection(.enabled)
                }
                .padding(.vertical, 4)
              }
            }
          }

          Section {
            Text(result.summary)
            Text("Ganador: \(winnerName(result.winner))")
              .font(.headline)
            if !result.verdictReason.isEmpty {
              Text(result.verdictReason)
                .foregroundStyle(VinctusTokens.Color.textMuted)
            }

            AIReportButton(
              target: .aiResponse(
                contextID: "arena_\(result.debateID)",
                excerpt: ([result.summary, result.verdictReason] + result.turns.map(\.text))
                  .joined(separator: " / ")
              )
            )

            Button {
              vm.saveResult()
            } label: {
              Label(
                vm.isResultSaved ? "Guardado en tu perfil" : "Guardar debate",
                systemImage: vm.isResultSaved ? "bookmark.fill" : "bookmark"
              )
            }
            .disabled(vm.isResultSaved || vm.isSavingResult)
          } header: {
            Text("Resumen y veredicto")
          } footer: {
            Text("Generado por IA. Puede contener errores.")
          }
        }
      }
      .task {
        if vm.personas.isEmpty {
          await vm.load()
        }
      }
      .vinctusLoading(vm.isLoading)
    }
    .navigationTitle("Arena IA")
    .navigationBarTitleDisplayMode(.inline)
  }

  private func speakerName(_ speaker: String) -> String {
    vm.resultNames[speaker] ?? "Participante \(speaker)"
  }

  private func winnerName(_ winner: String) -> String {
    switch winner {
    case "A":
      return speakerName("A")
    case "B":
      return speakerName("B")
    default:
      return "Empate"
    }
  }
}

import SwiftUI

// MARK: - Arena

@MainActor
final class ArenaViewModel: ObservableObject {
  /// Matches `MIN_TOPIC_CHARS` and `MAX_TOPIC_CHARS` of `createDebate` (functions/src/arena/createDebate.ts).
  static let minTopicLength = 5
  static let maxTopicLength = Limits.Arena.topicMaxLength

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
  private var sessionGeneration = 0

  init(repo: AIRepo) {
    self.repo = repo
  }

  var trimmedTopicLength: Int {
    topic.trimmingCharacters(in: .whitespacesAndNewlines).count
  }

  var canCreate: Bool {
    !isCreating && trimmedTopicLength >= Self.minTopicLength
      && trimmedTopicLength <= Self.maxTopicLength
      && !personaA.isEmpty && !personaB.isEmpty && personaA != personaB
      && (usage?.remaining ?? 1) > 0
  }

  func persona(_ id: String) -> ArenaPersona? {
    personas.first { $0.id == id }
  }

  func reset() {
    sessionGeneration += 1
    topic = ""
    usage = nil
    isLoading = false
    isCreating = false
    result = nil
    resultNames = [:]
    resultDebate = nil
    isResultSaved = false
    isSavingResult = false
    errorMessage = nil
  }

  func load() async {
    let generation = sessionGeneration
    isLoading = true
    errorMessage = nil
    do {
      let loadedPersonas = try await repo.fetchArenaPersonas()
      guard !Task.isCancelled, generation == sessionGeneration else { return }
      personas = loadedPersonas
      if personaA.isEmpty, let first = personas.first { personaA = first.id }
      if personaB.isEmpty, personas.count > 1 { personaB = personas[1].id }
      let loadedUsage = try? await repo.fetchArenaUsage()
      guard !Task.isCancelled, generation == sessionGeneration else { return }
      usage = loadedUsage
      errorMessage = nil
    } catch {
      guard !Task.isCancelled, generation == sessionGeneration else { return }
      errorMessage = error.localizedDescription
    }
    if generation == sessionGeneration {
      isLoading = false
    }
  }

  /// Saves the last debate to the profile, like "Guardar debate" on the web.
  func saveResult(repo: ProfileContentRepo = AppRepos.profileContent()) {
    guard resultDebate != nil, !isResultSaved, !isSavingResult else { return }
    Task { await saveResultNow(repo: repo) }
  }

  func saveResultNow(repo: ProfileContentRepo = AppRepos.profileContent()) async {
    guard let resultDebate, !isResultSaved, !isSavingResult else { return }
    let generation = sessionGeneration
    isSavingResult = true
    errorMessage = nil
    do {
      try await repo.saveDebate(resultDebate)
      guard generation == sessionGeneration else { return }
      isResultSaved = true
    } catch {
      guard generation == sessionGeneration else { return }
      errorMessage = "No se pudo guardar el debate."
    }
    if generation == sessionGeneration {
      isSavingResult = false
    }
  }

  func create() {
    guard canCreate else { return }
    Task { await createNow() }
  }

  func createNow() async {
    guard canCreate else { return }
    let text = topic.trimmingCharacters(in: .whitespacesAndNewlines)
    let selectedA = personaA
    let selectedB = personaB
    let generation = sessionGeneration
    isCreating = true
    errorMessage = nil
    result = nil
    resultDebate = nil
    isResultSaved = false

    do {
      let debate = try await repo.createDebate(topic: text, personaA: selectedA, personaB: selectedB)
      guard generation == sessionGeneration else { return }
      result = debate
      resultDebate = SavedDebate(
        id: debate.debateID, topic: text, personaA: selectedA, personaB: selectedB,
        summary: debate.summary.isEmpty ? nil : debate.summary, winner: debate.winner, createdAt: nil
      )
      isResultSaved = false
      resultNames = [
        "A": persona(selectedA)?.name ?? "Participante A",
        "B": persona(selectedB)?.name ?? "Participante B",
      ]
      if let usage, let remaining = debate.remaining {
        self.usage = ArenaUsage(
          used: max(0, usage.limit - remaining),
          limit: usage.limit,
          remaining: remaining
        )
      }
    } catch {
      guard generation == sessionGeneration else { return }
      errorMessage = error.localizedDescription
    }
    if generation == sessionGeneration {
      isCreating = false
    }
  }
}

struct ArenaView: View {
  @EnvironmentObject private var authVM: AuthViewModel
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
            .disabled(vm.isCreating)
          Picker("A favor", selection: $vm.personaA) {
            ForEach(vm.personas) { persona in
              Text(persona.name).tag(persona.id)
            }
          }
          .disabled(vm.isCreating)
          Picker("En contra", selection: $vm.personaB) {
            ForEach(vm.personas) { persona in
              Text(persona.name).tag(persona.id)
            }
          }
          .disabled(vm.isCreating)
        } header: {
          Text("Nuevo debate")
        } footer: {
          VStack(alignment: .leading, spacing: 4) {
            HStack {
              if vm.trimmedTopicLength > 0 && vm.trimmedTopicLength < ArenaViewModel.minTopicLength {
                Text("Mínimo \(ArenaViewModel.minTopicLength) caracteres.")
                  .foregroundStyle(.red)
              }
              Spacer()
              Text("\(vm.trimmedTopicLength)/\(ArenaViewModel.maxTopicLength)")
                .foregroundStyle(
                  vm.trimmedTopicLength > ArenaViewModel.maxTopicLength
                    ? .red
                    : VinctusTokens.Color.textMuted
                )
            }
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
            if vm.personas.isEmpty {
              Button("Reintentar") {
                Task { await vm.load() }
              }
            }
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
      .task(id: authVM.currentUserID) {
        vm.reset()
        if authVM.currentUserID != nil {
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

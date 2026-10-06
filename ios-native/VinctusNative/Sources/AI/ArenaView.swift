import SwiftUI

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

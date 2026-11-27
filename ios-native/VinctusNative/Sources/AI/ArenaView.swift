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

  /// Back to the form after a debate, keeping the topic and the personas, like the web's
  /// "Nuevo debate".
  func newDebate() {
    result = nil
    resultDebate = nil
    resultNames = [:]
    isResultSaved = false
    errorMessage = nil
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

/// Arena IA, like the web's: the topic with ideas, A favor and En contra as persona cards with
/// VS between them, and the debate as a conversation with the verdict highlighted.
struct ArenaView: View {
  @EnvironmentObject private var authVM: AuthViewModel
  @StateObject private var vm: ArenaViewModel
  @State private var didRunDemo = false

  static let ideas = [
    "La IA va a reemplazar el trabajo creativo humano.",
    "El trabajo remoto es mejor que el presencial.",
    "Las criptomonedas serán adopción masiva en 5 años.",
  ]

  init(repo: AIRepo) {
    _vm = StateObject(wrappedValue: ArenaViewModel(repo: repo))
  }

  var body: some View {
    AIConsentGate(source: .arena) {
      content
        .task(id: authVM.currentUserID) {
          vm.reset()
          if authVM.currentUserID != nil {
            await vm.load()
            runDemoDebate()
          }
        }
        .vinctusLoading(vm.isLoading)
    }
    .background(VinctusTokens.Color.background)
    .navigationTitle("Arena IA")
    .navigationBarTitleDisplayMode(.inline)
    .toolbar { usageToolbar }
  }

  @ToolbarContentBuilder
  private var usageToolbar: some ToolbarContent {
    if let usage = vm.usage {
      ToolbarItem(placement: .topBarTrailing) {
        Text("Hoy \(usage.used)/\(usage.limit)")
          .font(.caption.weight(.semibold))
          .foregroundStyle(usage.remaining == 0 ? .red : VinctusTokens.Color.accent)
          .padding(.horizontal, 10)
          .padding(.vertical, 5)
          .overlay(Capsule().stroke(VinctusTokens.Color.border, lineWidth: 1))
          .accessibilityLabel("Debates hoy: \(usage.used) de \(usage.limit)")
      }
    }
  }

  private var content: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 24) {
        if let result = vm.result {
          ArenaResultView(
            result: result,
            topic: vm.resultDebate?.topic ?? vm.topic,
            nameA: speakerName("A"),
            nameB: speakerName("B"),
            emojiA: ArenaPersonaStyle.emoji(for: vm.resultDebate?.personaA ?? vm.personaA),
            emojiB: ArenaPersonaStyle.emoji(for: vm.resultDebate?.personaB ?? vm.personaB),
            isSaved: vm.isResultSaved,
            isSaving: vm.isSavingResult,
            onSave: { vm.saveResult() },
            onNewDebate: { vm.newDebate() }
          )
        } else {
          creator
        }
        errorSection
      }
      .padding(VinctusTokens.Spacing.lg)
      .padding(.bottom, 24)
    }
    .scrollDismissesKeyboard(.interactively)
  }

  // MARK: Creator

  private var creator: some View {
    VStack(alignment: .leading, spacing: 24) {
      topicSection
      personaSection(title: "A favor", side: "A", selection: $vm.personaA, excluding: vm.personaB)
      versus
      personaSection(title: "En contra", side: "B", selection: $vm.personaB, excluding: vm.personaA)
      createSection
    }
  }

  private var topicSection: some View {
    VStack(alignment: .leading, spacing: 10) {
      Text("TEMA")
        .font(.caption.weight(.semibold))
        .tracking(1)
        .foregroundStyle(VinctusTokens.Color.textMuted)
      TextField("¿Sobre qué quieres que debatan?", text: $vm.topic, axis: .vertical)
        .font(VinctusTokens.Typography.serif(20))
        .lineLimit(3...5)
        .disabled(vm.isCreating)
        .padding(14)
        .background(VinctusTokens.Color.surface, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(
          RoundedRectangle(cornerRadius: 18, style: .continuous)
            .stroke(VinctusTokens.Color.border.opacity(0.7), lineWidth: 0.5)
        )
        .accessibilityLabel("Tema del debate")
      HStack {
        if vm.trimmedTopicLength > 0 && vm.trimmedTopicLength < ArenaViewModel.minTopicLength {
          Text("Mínimo \(ArenaViewModel.minTopicLength) caracteres.")
            .foregroundStyle(.red)
        }
        Spacer()
        Text("\(vm.trimmedTopicLength)/\(ArenaViewModel.maxTopicLength)")
          .foregroundStyle(
            vm.trimmedTopicLength > ArenaViewModel.maxTopicLength ? .red : VinctusTokens.Color.textMuted
          )
      }
      .font(.caption)
      if vm.trimmedTopicLength == 0 {
        ScrollView(.horizontal, showsIndicators: false) {
          HStack(spacing: 8) {
            ForEach(Self.ideas, id: \.self) { idea in
              Button(idea) { vm.topic = idea }
                .font(.caption)
                .foregroundStyle(VinctusTokens.Color.textSecondary)
                .padding(.horizontal, 12)
                .padding(.vertical, 7)
                .overlay(Capsule().stroke(VinctusTokens.Color.border, lineWidth: 1))
                .buttonStyle(.plain)
            }
          }
        }
      }
    }
  }

  private func personaSection(
    title: String, side: String, selection: Binding<String>, excluding other: String
  ) -> some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack(spacing: 8) {
        Text(side)
          .font(.caption.weight(.bold))
          .foregroundStyle(.black)
          .frame(width: 20, height: 20)
          .background(side == "A" ? SwiftUI.Color.white : VinctusTokens.Color.accent, in: Circle())
        Text(title)
          .font(.subheadline.weight(.semibold))
          .foregroundStyle(VinctusTokens.Color.textPrimary)
      }
      ScrollView(.horizontal, showsIndicators: false) {
        HStack(spacing: 10) {
          ForEach(vm.personas.filter { $0.id != other }) { persona in
            ArenaPersonaCard(persona: persona, isSelected: selection.wrappedValue == persona.id) {
              selection.wrappedValue = persona.id
            }
            .disabled(vm.isCreating)
          }
        }
      }
    }
  }

  private var versus: some View {
    HStack(spacing: 12) {
      Rectangle().fill(VinctusTokens.Color.border.opacity(0.6)).frame(height: 0.5)
      Text("VS")
        .font(.caption.weight(.bold))
        .tracking(2)
        .foregroundStyle(VinctusTokens.Color.textMuted)
      Rectangle().fill(VinctusTokens.Color.border.opacity(0.6)).frame(height: 0.5)
    }
    .accessibilityHidden(true)
  }

  private var createSection: some View {
    VStack(spacing: 10) {
      if vm.personaA == vm.personaB && !vm.personaA.isEmpty {
        Text("Elige dos personalidades distintas.")
          .font(.footnote)
          .foregroundStyle(.red)
      }
      Button {
        vm.create()
      } label: {
        HStack(spacing: 8) {
          if vm.isCreating { ProgressView().tint(.black) }
          Text(vm.isCreating ? "Generando el debate..." : (vm.usage?.remaining == 0 ? "Límite diario alcanzado" : "Iniciar debate"))
        }
        .font(.headline)
        .foregroundStyle(.black)
        .frame(maxWidth: .infinity)
        .frame(height: 52)
        .background(VinctusTokens.Color.accent.opacity(vm.canCreate || vm.isCreating ? 1 : 0.4), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
      }
      .buttonStyle(.plain)
      .disabled(!vm.canCreate)
      Text(vm.isCreating
        ? "Puede tardar hasta 2 minutos."
        : "6 turnos alternados · resumen y veredicto imparcial")
        .font(.caption)
        .foregroundStyle(VinctusTokens.Color.textMuted)
      Text("Tus debates desde la app son privados.")
        .font(.caption)
        .foregroundStyle(VinctusTokens.Color.textMuted)
    }
  }

  @ViewBuilder
  private var errorSection: some View {
    if let error = vm.errorMessage {
      VStack(alignment: .leading, spacing: 8) {
        Text(error)
          .font(.footnote)
          .foregroundStyle(.red)
        if vm.personas.isEmpty {
          Button("Reintentar") {
            Task { await vm.load() }
          }
          .font(.footnote.weight(.semibold))
        }
      }
    }
  }

  private func speakerName(_ speaker: String) -> String {
    vm.resultNames[speaker] ?? "Participante \(speaker)"
  }

  /// Screenshot builds start a sample debate with `-VinctusArenaTopic "<tema>"`.
  private func runDemoDebate() {
    guard !didRunDemo, let topic = AppRepos.demoArgument("-VinctusArenaTopic") else { return }
    didRunDemo = true
    vm.topic = topic
    vm.create()
  }
}

private struct ArenaPersonaCard: View {
  let persona: ArenaPersona
  let isSelected: Bool
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      VStack(alignment: .leading, spacing: 6) {
        HStack(alignment: .top) {
          Text(ArenaPersonaStyle.emoji(for: persona.id))
            .font(.title2)
          Spacer()
          if isSelected {
            Image(systemName: "checkmark")
              .font(.system(size: 10, weight: .heavy))
              .foregroundStyle(.black)
              .frame(width: 20, height: 20)
              .background(VinctusTokens.Color.accent, in: Circle())
          }
        }
        Text(persona.name)
          .font(.subheadline.weight(.semibold))
          .foregroundStyle(VinctusTokens.Color.textPrimary)
          .lineLimit(1)
        Text(persona.description)
          .font(.caption)
          .foregroundStyle(VinctusTokens.Color.textMuted)
          .lineLimit(2)
          .multilineTextAlignment(.leading)
      }
      .frame(width: 140, height: 118, alignment: .topLeading)
      .padding(12)
      .background(
        isSelected ? VinctusTokens.Color.accent.opacity(0.12) : VinctusTokens.Color.surface,
        in: RoundedRectangle(cornerRadius: 18, style: .continuous)
      )
      .overlay(
        RoundedRectangle(cornerRadius: 18, style: .continuous)
          .stroke(isSelected ? VinctusTokens.Color.accent.opacity(0.7) : VinctusTokens.Color.border.opacity(0.7),
                  lineWidth: isSelected ? 1 : 0.5)
      )
    }
    .buttonStyle(.plain)
    .accessibilityLabel(persona.name)
    .accessibilityAddTraits(isSelected ? .isSelected : [])
  }
}

/// A finished debate: the matchup, the turns as a conversation, the verdict, and its actions.
private struct ArenaResultView: View {
  let result: ArenaDebateResult
  let topic: String
  let nameA: String
  let nameB: String
  let emojiA: String
  let emojiB: String
  let isSaved: Bool
  let isSaving: Bool
  let onSave: () -> Void
  let onNewDebate: () -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: 22) {
      header
      ForEach(result.turns) { turn in
        ArenaTurnBubble(
          turn: turn,
          name: turn.speaker == "A" ? nameA : nameB,
          emoji: turn.speaker == "A" ? emojiA : emojiB
        )
      }
      verdict
      actions
    }
  }

  private var header: some View {
    VStack(alignment: .leading, spacing: 12) {
      Text("ARENA IA · PRIVADO")
        .font(.caption.weight(.semibold))
        .tracking(1)
        .foregroundStyle(VinctusTokens.Color.textMuted)
      Text(topic)
        .font(VinctusTokens.Typography.serif(26))
        .foregroundStyle(VinctusTokens.Color.textPrimary)
        .fixedSize(horizontal: false, vertical: true)
      HStack(spacing: 10) {
        matchupChip(emoji: emojiA, name: nameA, isB: false)
        Text("VS")
          .font(.caption.weight(.bold))
          .foregroundStyle(VinctusTokens.Color.textMuted)
        matchupChip(emoji: emojiB, name: nameB, isB: true)
      }
    }
  }

  private func matchupChip(emoji: String, name: String, isB: Bool) -> some View {
    HStack(spacing: 6) {
      Text(emoji)
      Text(name)
        .lineLimit(1)
    }
    .font(.subheadline)
    .foregroundStyle(isB ? VinctusTokens.Color.accent : VinctusTokens.Color.textPrimary)
    .padding(.horizontal, 10)
    .padding(.vertical, 6)
    .background(isB ? VinctusTokens.Color.accent.opacity(0.12) : VinctusTokens.Color.surface2, in: Capsule())
  }

  private var winnerText: String {
    switch result.winner {
    case "A": return "Ganador: \(nameA)"
    case "B": return "Ganador: \(nameB)"
    default: return "Resultado: empate"
    }
  }

  private var verdict: some View {
    VStack(alignment: .leading, spacing: 10) {
      Label("VEREDICTO", systemImage: "trophy")
        .font(.caption.weight(.semibold))
        .foregroundStyle(VinctusTokens.Color.accent)
      Text(winnerText)
        .font(VinctusTokens.Typography.serif(24))
        .foregroundStyle(VinctusTokens.Color.textPrimary)
      if !result.verdictReason.isEmpty {
        Text(result.verdictReason)
          .font(.subheadline)
          .foregroundStyle(VinctusTokens.Color.textSecondary)
      }
      if !result.summary.isEmpty {
        Divider().overlay(VinctusTokens.Color.border)
        Text(result.summary)
          .font(.subheadline)
          .foregroundStyle(VinctusTokens.Color.textMuted)
      }
      Text("Generado por IA. Puede contener errores.")
        .font(.caption2)
        .foregroundStyle(VinctusTokens.Color.textMuted)
        .padding(.top, 2)
    }
    .padding(18)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(
      LinearGradient(
        colors: [VinctusTokens.Color.accent.opacity(0.14), VinctusTokens.Color.accent.opacity(0.03)],
        startPoint: .top, endPoint: .bottom
      ),
      in: RoundedRectangle(cornerRadius: 22, style: .continuous)
    )
    .overlay(
      RoundedRectangle(cornerRadius: 22, style: .continuous)
        .stroke(VinctusTokens.Color.accent.opacity(0.35), lineWidth: 1)
    )
  }

  private var actions: some View {
    HStack(spacing: 10) {
      Button(action: onSave) {
        Label(isSaved ? "Guardado en tu perfil" : "Guardar debate", systemImage: isSaved ? "bookmark.fill" : "bookmark")
          .font(.subheadline.weight(.semibold))
          .foregroundStyle(isSaved ? VinctusTokens.Color.accent : VinctusTokens.Color.textPrimary)
          .padding(.horizontal, 14)
          .frame(height: 40)
          .overlay(Capsule().stroke(VinctusTokens.Color.border, lineWidth: 1))
      }
      .buttonStyle(.plain)
      .disabled(isSaved || isSaving)

      AIReportButton(
        target: .aiResponse(
          contextID: "arena_\(result.debateID)",
          excerpt: ([result.summary, result.verdictReason] + result.turns.map(\.text)).joined(separator: " / ")
        ),
        showsTitle: true
      )
      .font(.subheadline)
      .foregroundStyle(VinctusTokens.Color.textMuted)

      Spacer()

      Button(action: onNewDebate) {
        Text("Nuevo debate")
          .font(.subheadline.weight(.semibold))
          .foregroundStyle(.black)
          .padding(.horizontal, 14)
          .frame(height: 40)
          .background(VinctusTokens.Color.accent, in: Capsule())
      }
      .buttonStyle(.plain)
    }
  }
}

private struct ArenaTurnBubble: View {
  let turn: ArenaTurn
  let name: String
  let emoji: String

  private var isA: Bool { turn.speaker == "A" }

  var body: some View {
    HStack(alignment: .top, spacing: 8) {
      if !isA { Spacer(minLength: 24) }
      if isA { avatar }
      VStack(alignment: isA ? .leading : .trailing, spacing: 4) {
        Text("\(name) · Turno \(turn.index + 1)")
          .font(.caption2)
          .foregroundStyle(VinctusTokens.Color.textMuted)
        Text(turn.text)
          .textSelection(.enabled)
          .foregroundStyle(VinctusTokens.Color.textPrimary)
          .padding(.horizontal, 14)
          .padding(.vertical, 11)
          .background(
            isA ? VinctusTokens.Color.surface2 : VinctusTokens.Color.accent.opacity(0.13),
            in: UnevenRoundedRectangle(
              topLeadingRadius: isA ? 6 : 20, bottomLeadingRadius: 20,
              bottomTrailingRadius: 20, topTrailingRadius: isA ? 20 : 6,
              style: .continuous
            )
          )
      }
      if !isA { avatar }
      if isA { Spacer(minLength: 24) }
    }
  }

  private var avatar: some View {
    Text(emoji)
      .frame(width: 32, height: 32)
      .background(isA ? VinctusTokens.Color.surface2 : VinctusTokens.Color.accent.opacity(0.15), in: Circle())
      .accessibilityHidden(true)
  }
}

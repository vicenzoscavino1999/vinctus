import Foundation

// Screenshot builds only (see App/DemoData.swift).

#if SCREENSHOTS
struct SampleAIRepo: AIRepo {
  func sendChatMessage(_ message: String, history: [AIChatMessage]) async throws -> [AIChatMessage] {
    try? await Task.sleep(for: .milliseconds(600))
    let reply = """
    Sí. Con un telescopio pequeño (60–80 mm) los anillos de Saturno ya se ven en una noche \
    despejada, sobre todo cuando el planeta está alto en el cielo.

    ¿Quieres que cree un grupo para observarlos juntos?
    """
    return history + [
      AIChatMessage(role: "user", parts: [.init(text: message)]),
      AIChatMessage(role: "model", parts: [.init(text: reply)], groupID: "g1"),
    ]
  }

  func fetchArenaPersonas() async throws -> [ArenaPersona] {
    [
      ArenaPersona(id: "scientist", name: "El Cientifico", description: "Basado en datos y evidencia empirica"),
      ArenaPersona(id: "philosopher", name: "El Filosofo", description: "Reflexivo y profundo en sus argumentos"),
      ArenaPersona(id: "pragmatist", name: "El Pragmatico", description: "Enfocado en soluciones practicas"),
      ArenaPersona(id: "skeptic", name: "El Esceptico", description: "Cuestiona todo y pide pruebas"),
      ArenaPersona(id: "optimist", name: "El Optimista", description: "Ve oportunidades y posibilidades"),
      ArenaPersona(id: "devil", name: "Abogado del Diablo", description: "Defiende la posicion contraria"),
    ]
  }

  func fetchArenaUsage() async throws -> ArenaUsage {
    ArenaUsage(used: 2, limit: 10, remaining: 8)
  }

  func createDebate(topic: String, personaA: String, personaB: String) async throws -> ArenaDebateResult {
    ArenaDebateResult(
      debateID: "demo_debate",
      summary: "Ambas posturas analizaron costos, seguridad y la velocidad de la transición.",
      winner: "A",
      verdictReason: "Presentó más evidencia concreta y respondió mejor a las objeciones.",
      remaining: 7,
      turns: try await fetchDebateTurns(debateID: "demo_debate")
    )
  }

  func fetchDebateTurns(debateID: String) async throws -> [ArenaTurn] {
    [
      ArenaTurn(id: "t0", index: 0, speaker: "A", text: "La energía nuclear ofrece carga base sin carbono y con muy poca superficie."),
      ArenaTurn(id: "t1", index: 1, speaker: "B", text: "Sus plazos de construcción y costos iniciales siguen siendo un reto frente a las renovables."),
      ArenaTurn(id: "t2", index: 2, speaker: "A", text: "Los reactores modulares acortan esos plazos y complementan a solar y eólica."),
    ]
  }
}

struct SampleAIConsentRepo: AIConsentRepo {
  func getConsent(uid: String) async throws -> AIConsentState {
    AIConsentState(granted: true, recorded: true, source: .aiChat, updatedAt: Date())
  }

  func setConsent(uid: String, granted: Bool, source: AIConsentSource) async throws {}
}
#endif

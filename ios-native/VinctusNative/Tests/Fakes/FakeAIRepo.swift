import Foundation
@testable import VinctusNative

final class FakeAIRepo: AIRepo {
  var chatReplyText = "Respuesta de prueba"
  var chatReplyGroupID: String?
  var chatHandler: ((String, [AIChatMessage]) async throws -> [AIChatMessage])?
  var failsChat = false

  var personas: [ArenaPersona] = [
    ArenaPersona(id: "scientist", name: "Científico", description: "Evidencia"),
    ArenaPersona(id: "philosopher", name: "Filósofo", description: "Ética"),
    ArenaPersona(id: "skeptic", name: "Escéptico", description: "Duda metódica"),
  ]
  var usage = ArenaUsage(used: 1, limit: 5, remaining: 4)
  var failsPersonas = false
  var failsUsage = false
  var failsCreate = false
  var createHandler: ((String, String, String) async throws -> ArenaDebateResult)?
  var createdRequests: [(topic: String, personaA: String, personaB: String)] = []

  var turns: [ArenaTurn] = []
  var failsTurns = false

  func sendChatMessage(_ message: String, history: [AIChatMessage]) async throws -> [AIChatMessage] {
    if let chatHandler { return try await chatHandler(message, history) }
    if failsChat { throw FakeError() }
    return history + [
      AIChatMessage(role: "user", parts: [.init(text: message)]),
      AIChatMessage(role: "model", parts: [.init(text: chatReplyText)], groupID: chatReplyGroupID),
    ]
  }

  func fetchArenaPersonas() async throws -> [ArenaPersona] {
    if failsPersonas { throw FakeError() }
    return personas
  }

  func fetchArenaUsage() async throws -> ArenaUsage {
    if failsUsage { throw FakeError() }
    return usage
  }

  func createDebate(topic: String, personaA: String, personaB: String) async throws -> ArenaDebateResult {
    createdRequests.append((topic: topic, personaA: personaA, personaB: personaB))
    if let createHandler { return try await createHandler(topic, personaA, personaB) }
    if failsCreate { throw FakeError() }
    return ArenaDebateResult(
      debateID: "deb_1",
      summary: "Resumen del debate",
      winner: "A",
      verdictReason: "Mejor argumentado",
      remaining: max(0, usage.remaining - 1),
      turns: [
        ArenaTurn(id: "t0", index: 0, speaker: "A", text: "Argumento A"),
        ArenaTurn(id: "t1", index: 1, speaker: "B", text: "Argumento B"),
      ]
    )
  }

  func fetchDebateTurns(debateID: String) async throws -> [ArenaTurn] {
    if failsTurns { throw FakeError() }
    return turns
  }
}

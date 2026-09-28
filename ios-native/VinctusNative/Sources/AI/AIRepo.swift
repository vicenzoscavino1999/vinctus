import FirebaseAuth
import FirebaseCore
import FirebaseFirestore
import FirebaseFunctions
import Foundation

/// One entry of the conversation the chat API keeps (`api/chat.ts`, Gemini's message shape).
struct AIChatMessage: Codable, Equatable, Identifiable {
  struct Part: Codable, Equatable {
    let text: String
  }

  let id = UUID()
  let role: String
  let parts: [Part]

  var isUser: Bool { role == "user" }
  var text: String { parts.map(\.text).joined(separator: "\n") }

  enum CodingKeys: String, CodingKey {
    case role
    case parts
  }

  static func == (lhs: AIChatMessage, rhs: AIChatMessage) -> Bool {
    lhs.role == rhs.role && lhs.parts == rhs.parts
  }
}

struct ArenaPersona: Identifiable, Hashable {
  let id: String
  let name: String
  let description: String
}

struct ArenaTurn: Identifiable, Hashable {
  let id: String
  let index: Int
  let speaker: String
  let text: String
}

struct ArenaDebateResult {
  let debateID: String
  let summary: String
  let winner: String
  let verdictReason: String
  let remaining: Int?
  let turns: [ArenaTurn]
}

struct ArenaUsage {
  let used: Int
  let limit: Int
  let remaining: Int
}

protocol AIRepo {
  func sendChatMessage(_ message: String, history: [AIChatMessage]) async throws -> [AIChatMessage]
  func fetchArenaPersonas() async throws -> [ArenaPersona]
  func fetchArenaUsage() async throws -> ArenaUsage
  func createDebate(topic: String, personaA: String, personaB: String) async throws -> ArenaDebateResult
  /// Turns of a debate, for saved debates shown on the profile.
  func fetchDebateTurns(debateID: String) async throws -> [ArenaTurn]
}

enum AIRepoError: LocalizedError {
  case firebaseNotConfigured
  case userNotAuthenticated
  case server(String)
  case invalidResponse

  var errorDescription: String? {
    switch self {
    case .firebaseNotConfigured:
      return "Firebase no está configurado."
    case .userNotAuthenticated:
      return "Debes iniciar sesión."
    case .server(let message):
      return message
    case .invalidResponse:
      return "La IA devolvió una respuesta inválida. Intenta de nuevo."
    }
  }
}

final class FirebaseAIRepo: AIRepo {
  /// Limits enforced by `validateChatRequest` in api/chat.ts.
  static let maxMessageLength = 2000
  private static let maxHistoryMessages = 20
  private static let maxHistoryCharacters = 12_000
  /// Same region as the Arena callables (functions/src/arena/createDebate.ts).
  private static let functionsRegion = "us-central1"
  /// A debate generates six turns plus a verdict, well past the SDK's 70-second default.
  private static let createDebateTimeout: TimeInterval = 300

  private let session: URLSession

  init(session: URLSession = .shared) {
    self.session = session
  }

  func sendChatMessage(_ message: String, history: [AIChatMessage]) async throws -> [AIChatMessage] {
    guard FirebaseApp.app() != nil else { throw AIRepoError.firebaseNotConfigured }
    guard let user = Auth.auth().currentUser else { throw AIRepoError.userNotAuthenticated }
    let token = try await user.getIDToken()

    var request = URLRequest(url: LegalConfig.apiBaseURL.appendingPathComponent("api/chat"))
    request.httpMethod = "POST"
    request.timeoutInterval = 60
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    request.httpBody = try JSONEncoder().encode(
      ChatRequestBody(message: message, history: Self.trimmedHistory(history))
    )

    let (data, response) = try await session.data(for: request)
    let status = (response as? HTTPURLResponse)?.statusCode ?? 0
    let payload = try? JSONDecoder().decode(ChatResponseBody.self, from: data)

    if (200..<300).contains(status), let history = payload?.history {
      return history
    }
    if let history = payload?.history, payload?.response != nil {
      // The API answers some failures with a reply the user should see (e.g. an action that failed).
      return history
    }
    throw AIRepoError.server(Self.chatErrorMessage(status: status, serverMessage: payload?.error))
  }

  func fetchArenaPersonas() async throws -> [ArenaPersona] {
    let data = try await call("getArenaPersonas")
    guard let list = data as? [[String: Any]] else { throw AIRepoError.invalidResponse }
    return list.compactMap { item in
      guard let id = item["id"] as? String, let name = item["name"] as? String else { return nil }
      return ArenaPersona(id: id, name: name, description: item["description"] as? String ?? "")
    }
  }

  func fetchArenaUsage() async throws -> ArenaUsage {
    guard let data = try await call("getArenaUsage") as? [String: Any] else {
      throw AIRepoError.invalidResponse
    }
    return ArenaUsage(
      used: FirestoreValue.int(data["used"]) ?? 0,
      limit: FirestoreValue.int(data["limit"]) ?? 0,
      remaining: FirestoreValue.int(data["remaining"]) ?? 0
    )
  }

  func createDebate(topic: String, personaA: String, personaB: String) async throws -> ArenaDebateResult {
    let payload: [String: Any] = [
      "topic": topic,
      "personaA": personaA,
      "personaB": personaB,
      // Debates made in the app stay private: they are only shown to their author here.
      "visibility": "private",
    ]
    guard
      let data = try await call("createDebate", payload: payload, timeout: Self.createDebateTimeout)
        as? [String: Any],
      let debateID = data["debateId"] as? String
    else {
      throw AIRepoError.invalidResponse
    }

    let verdict = data["verdict"] as? [String: Any]
    return ArenaDebateResult(
      debateID: debateID,
      summary: data["summary"] as? String ?? "",
      winner: verdict?["winner"] as? String ?? "draw",
      verdictReason: verdict?["reason"] as? String ?? "",
      remaining: FirestoreValue.int(data["remaining"]),
      turns: (try? await fetchTurns(debateID: debateID)) ?? []
    )
  }

  func fetchDebateTurns(debateID: String) async throws -> [ArenaTurn] {
    guard FirebaseApp.app() != nil else { throw AIRepoError.firebaseNotConfigured }
    return try await fetchTurns(debateID: debateID)
  }

  private func fetchTurns(debateID: String) async throws -> [ArenaTurn] {
    let snapshot = try await Firestore.firestore()
      .collection("arenaDebates").document(debateID)
      .collection("turns")
      .order(by: "idx")
      .getDocuments()
    return snapshot.documents.compactMap { doc in
      let data = doc.data()
      guard let text = data["text"] as? String else { return nil }
      return ArenaTurn(
        id: doc.documentID,
        index: FirestoreValue.int(data["idx"]) ?? 0,
        speaker: data["speaker"] as? String ?? "A",
        text: text
      )
    }
  }

  private func call(_ name: String, payload: Any? = nil, timeout: TimeInterval? = nil) async throws -> Any {
    guard FirebaseApp.app() != nil else { throw AIRepoError.firebaseNotConfigured }
    guard Auth.auth().currentUser != nil else { throw AIRepoError.userNotAuthenticated }

    let callable = Functions.functions(region: Self.functionsRegion).httpsCallable(name)
    if let timeout {
      callable.timeoutInterval = timeout
    }
    do {
      return try await callable.call(payload).data
    } catch {
      // The callables send user-facing Spanish messages (HttpsError); keep them.
      let message = (error as NSError).localizedDescription
      throw AIRepoError.server(message.isEmpty ? "No se pudo contactar a la IA." : message)
    }
  }

  /// Keeps the newest messages within the API's count and size limits.
  static func trimmedHistory(_ history: [AIChatMessage]) -> [AIChatMessage] {
    var trimmed = Array(history.suffix(maxHistoryMessages))
    while !trimmed.isEmpty, trimmed.reduce(0, { $0 + $1.text.count }) > maxHistoryCharacters {
      trimmed.removeFirst()
    }
    // Gemini expects the conversation to start with a user turn.
    while let first = trimmed.first, !first.isUser {
      trimmed.removeFirst()
    }
    return trimmed
  }

  private static func chatErrorMessage(status: Int, serverMessage: String?) -> String {
    switch status {
    case 401:
      return "Tu sesión expiró. Vuelve a iniciar sesión."
    case 403:
      return serverMessage ?? "Debes aceptar el consentimiento de IA."
    case 429:
      return "Llegaste al límite de mensajes por ahora. Intenta más tarde."
    case 504:
      return "La IA tardó demasiado en responder. Intenta de nuevo."
    default:
      return "No se pudo contactar a la IA. Intenta de nuevo."
    }
  }
}

private struct ChatRequestBody: Encodable {
  let message: String
  let history: [AIChatMessage]
}

private struct ChatResponseBody: Decodable {
  let response: String?
  let history: [AIChatMessage]?
  let error: String?
}

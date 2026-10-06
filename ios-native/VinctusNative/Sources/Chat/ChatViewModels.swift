import Foundation

// MARK: - Conversation list (Mensajes tab)

@MainActor
final class ConversationsViewModel: ObservableObject {
  @Published private(set) var conversations: [ChatConversation] = []
  @Published private(set) var isLoading = true
  @Published private(set) var errorMessage: String?

  private let repo: ChatRepo
  private var subscription: ChatSubscription?

  init(repo: ChatRepo) {
    self.repo = repo
  }

  func start() {
    guard subscription == nil else { return }
    isLoading = true
    subscription = repo.observeConversations(
      onChange: { [weak self] conversations in
        self?.conversations = conversations
        self?.isLoading = false
        self?.errorMessage = nil
      },
      onError: { [weak self] error in
        self?.isLoading = false
        self?.errorMessage = "No se pudieron cargar tus conversaciones."
        AppLog.ui.error("chat.list.failed errorType=\(AppLog.errorType(error), privacy: .public)")
      }
    )
  }

  func stop() {
    subscription?.cancel()
    subscription = nil
  }
}

// MARK: - Conversation

@MainActor
final class ConversationViewModel: ObservableObject {
  @Published private(set) var messages: [ChatMessage] = []
  @Published private(set) var isLoading = true
  @Published var draft = ""
  @Published private(set) var isSending = false
  @Published var errorMessage: String?

  let conversationID: String
  private let repo: ChatRepo
  private var subscription: ChatSubscription?

  init(repo: ChatRepo, conversationID: String) {
    self.repo = repo
    self.conversationID = conversationID
  }

  var canSend: Bool {
    let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
    return !isSending && !text.isEmpty && text.count <= FirebaseChatRepo.maxMessageLength
  }

  func start() {
    guard subscription == nil else { return }
    subscription = repo.observeMessages(
      conversationID: conversationID,
      onChange: { [weak self] messages in
        guard let self else { return }
        self.messages = messages
        self.isLoading = false
        Task { await self.repo.markRead(conversationID: self.conversationID) }
      },
      onError: { [weak self] error in
        self?.isLoading = false
        self?.errorMessage = "No se pudieron cargar los mensajes."
        AppLog.ui.error("chat.messages.failed errorType=\(AppLog.errorType(error), privacy: .public)")
      }
    )
  }

  func stop() {
    subscription?.cancel()
    subscription = nil
  }

  /// Sends the draft. Returns the send task, so tests can wait for it.
  @discardableResult
  func send() -> Task<Void, Never>? {
    guard canSend else { return nil }
    let text = draft
    draft = ""
    isSending = true
    errorMessage = nil
    return Task {
      do {
        try await repo.sendMessage(conversationID: conversationID, text: text)
      } catch {
        draft = text
        errorMessage = (error as? LocalizedError)?.errorDescription ?? "No se pudo enviar el mensaje."
      }
      isSending = false
    }
  }
}

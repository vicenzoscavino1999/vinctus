import Combine
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

struct FailedChatMessage: Identifiable {
  let id = UUID()
  let text: String
}

@MainActor
final class ConversationViewModel: ObservableObject {
  @Published private(set) var messages: [ChatMessage] = []
  @Published private(set) var isLoading = true
  @Published var draft = ""
  @Published private(set) var isSending = false
  @Published private(set) var failedMessages: [FailedChatMessage] = []
  @Published private(set) var hasOlderMessages = false
  @Published private(set) var isLoadingOlder = false
  @Published private(set) var loadErrorMessage: String?
  @Published private(set) var historyErrorMessage: String?
  @Published private(set) var sendErrorMessage: String?

  var errorMessage: String? { loadErrorMessage ?? historyErrorMessage ?? sendErrorMessage }

  let conversationID: String
  private let repo: ChatRepo
  private var subscription: ChatSubscription?
  private var oldestCursor: ChatMessageCursor?
  private var sessionID = UUID()
  private var listenerID = UUID()
  private var isStarted = false
  private var isActive = false
  private var lastReadClientAt: Int64?

  init(repo: ChatRepo, conversationID: String) {
    self.repo = repo
    self.conversationID = conversationID
  }

  var canSend: Bool {
    let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
    return !isSending && !text.isEmpty && text.count <= FirebaseChatRepo.maxMessageLength
  }

  func start() {
    guard !isStarted else { return }
    isStarted = true
    sessionID = UUID()
    isLoading = messages.isEmpty
    listen(through: oldestCursor)
  }

  private func listen(through cursor: ChatMessageCursor?) {
    subscription?.cancel()
    let token = UUID()
    listenerID = token
    subscription = repo.observeMessages(
      conversationID: conversationID,
      through: cursor,
      onChange: { [weak self] page in
        guard let self, self.isStarted, self.listenerID == token else { return }
        // Cache snapshots can be partial after widening a query. Only a server snapshot is
        // authoritative about deletions and the initial pagination boundary.
        self.messages = page.isFromCache ? self.merging(page.messages) : page.messages
        self.isLoading = false
        self.loadErrorMessage = nil
        if cursor == nil, self.oldestCursor == nil, !page.isFromCache {
          self.oldestCursor = page.oldestCursor
          self.hasOlderMessages = page.hasMore
          if let boundary = page.oldestCursor {
            // Install after observeMessages returns, including for synchronous demo/test repos.
            Task { [weak self] in
              guard let self, self.isStarted, self.listenerID == token else { return }
              self.listen(through: boundary)
            }
          }
        }
      },
      onError: { [weak self] error in
        guard let self, self.isStarted, self.listenerID == token else { return }
        self.isLoading = false
        self.loadErrorMessage = "No se pudieron cargar los mensajes."
        AppLog.ui.error("chat.messages.failed errorType=\(AppLog.errorType(error), privacy: .public)")
      }
    )
  }

  func stop() {
    isStarted = false
    isActive = false
    sessionID = UUID()
    listenerID = UUID()
    isLoadingOlder = false
    subscription?.cancel()
    subscription = nil
  }

  func retryLoading() {
    guard isStarted else { return }
    isLoading = messages.isEmpty
    listen(through: oldestCursor)
  }

  func loadOlder() async {
    guard isStarted, hasOlderMessages, !isLoadingOlder, let cursor = oldestCursor else { return }
    let token = sessionID
    isLoadingOlder = true
    historyErrorMessage = nil
    defer { if sessionID == token { isLoadingOlder = false } }
    do {
      let page = try await repo.fetchOlderMessages(conversationID: conversationID, before: cursor)
      guard isStarted, sessionID == token else { return }
      hasOlderMessages = page.hasMore
      guard let boundary = page.oldestCursor else { return }
      oldestCursor = boundary
      // Retain new arrivals while the older page is fetched. The expanded listener then owns
      // the whole window, including deletions and edits, without gaps at page boundaries.
      messages = merging(page.messages)
      listen(through: boundary)
    } catch {
      guard isStarted, sessionID == token else { return }
      historyErrorMessage = "No se pudieron cargar los mensajes anteriores. Reintenta."
    }
  }

  private func merging(_ page: [ChatMessage]) -> [ChatMessage] {
    var byID = Dictionary(uniqueKeysWithValues: page.map { ($0.id, $0) })
    for message in messages { byID[message.id] = message }
    return byID.values.sorted {
      if $0.clientCreatedAt == $1.clientCreatedAt { return $0.id < $1.id }
      return $0.clientCreatedAt < $1.clientCreatedAt
    }
  }

  /// Called with the last message actually laid out inside the visible viewport. Merely
  /// receiving a snapshot must not acknowledge messages while reading history/backgrounded.
  @discardableResult
  func updateReadingContext(isActive: Bool, visibleLastMessageID: String?) -> Task<Void, Never>? {
    self.isActive = isActive
    guard isStarted, isActive, let message = messages.last,
      message.id == visibleLastMessageID,
      lastReadClientAt.map({ message.clientCreatedAt > $0 }) ?? true
    else { return nil }
    let token = sessionID
    return Task { [weak self] in
      guard let self, self.isStarted, self.isActive, self.sessionID == token else { return }
      guard self.lastReadClientAt.map({ message.clientCreatedAt > $0 }) ?? true else { return }
      self.lastReadClientAt = message.clientCreatedAt
      await self.repo.markRead(conversationID: self.conversationID, through: message.clientCreatedAt)
    }
  }

  /// Sends the draft. Returns the send task, so tests can wait for it.
  @discardableResult
  func send() -> Task<Void, Never>? {
    guard canSend else { return nil }
    let text = draft
    draft = ""
    return performSend(text: text, retryID: nil)
  }

  @discardableResult
  func retry(_ message: FailedChatMessage) -> Task<Void, Never>? {
    guard !isSending, failedMessages.contains(where: { $0.id == message.id }) else { return nil }
    return performSend(text: message.text, retryID: message.id)
  }

  private func performSend(text: String, retryID: UUID?) -> Task<Void, Never> {
    isSending = true
    sendErrorMessage = nil
    return Task {
      do {
        try await repo.sendMessage(conversationID: conversationID, text: text)
        if let retryID { failedMessages.removeAll { $0.id == retryID } }
      } catch {
        if retryID == nil {
          if draft.isEmpty {
            draft = text
          } else {
            failedMessages.append(FailedChatMessage(text: text))
          }
        }
        sendErrorMessage = (error as? LocalizedError)?.errorDescription ?? "No se pudo enviar el mensaje."
      }
      isSending = false
    }
  }
}

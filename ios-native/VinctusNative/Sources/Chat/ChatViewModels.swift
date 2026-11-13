import Combine
import Foundation
import PhotosUI
import SwiftUI

// MARK: - Conversation list (Mensajes tab)

@MainActor
final class ConversationsViewModel: ObservableObject {
  @Published private(set) var conversations: [ChatConversation] = []
  @Published private(set) var isLoading = true
  @Published private(set) var errorMessage: String?

  private let repo: ChatRepo
  private var subscription: ChatSubscription?
  private var listenerID = UUID()

  init(repo: ChatRepo) {
    self.repo = repo
  }

  func start() {
    guard subscription == nil else { return }
    isLoading = true
    let token = UUID()
    listenerID = token
    subscription = repo.observeConversations(
      onChange: { [weak self] conversations in
        guard let self, self.listenerID == token else { return }
        self.conversations = conversations
        self.isLoading = false
        self.errorMessage = nil
      },
      onError: { [weak self] error in
        guard let self, self.listenerID == token else { return }
        self.isLoading = false
        self.errorMessage = "No se pudieron cargar tus conversaciones."
        AppLog.ui.error("chat.list.failed errorType=\(AppLog.errorType(error), privacy: .public)")
      }
    )
  }

  func stop() {
    listenerID = UUID()
    subscription?.cancel()
    subscription = nil
  }
}

// MARK: - Conversation

struct FailedChatMessage: Identifiable {
  let id: String
  let text: String
  let attachments: [ChatPendingAttachment]
}

/// Distinguishes layout movement caused by incoming rows from an intentional user scroll.
struct ChatScrollState {
  private(set) var isAtBottom = true
  private(set) var hasNewMessages = false
  private var didPositionInitialMessages = false
  private var bottomVisibleMessageID: String?
  private var isScrollingToLatest = false

  mutating func updateBottom(isVisible: Bool, messageID: String?) {
    isAtBottom = isVisible
    if isVisible {
      hasNewMessages = false
      bottomVisibleMessageID = messageID
      isScrollingToLatest = false
    } else if !isScrollingToLatest, messageID == bottomVisibleMessageID {
      bottomVisibleMessageID = nil
    }
  }

  mutating func lastMessageChanged(previousID: String?, lastID: String?, isSendingOwnMessage: Bool) -> Bool {
    guard lastID != nil else { return false }
    let followsLatest = !didPositionInitialMessages || isAtBottom || isScrollingToLatest ||
      (previousID != nil && bottomVisibleMessageID == previousID) || isSendingOwnMessage
    didPositionInitialMessages = true
    if followsLatest {
      scrollToLatest()
    } else {
      hasNewMessages = true
    }
    return followsLatest
  }

  mutating func scrollToLatest() {
    isScrollingToLatest = true
    hasNewMessages = false
  }

  mutating func userDidScroll() {
    isScrollingToLatest = false
    bottomVisibleMessageID = nil
    isAtBottom = false
  }
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
  @Published private(set) var readErrorMessage: String?
  @Published private(set) var attachments: [ChatPendingAttachment] = []
  @Published private(set) var isPreparingMedia = false
  @Published private(set) var uploadProgress: Double = 0
  @Published var mediaErrorMessage: String?

  var errorMessage: String? { loadErrorMessage ?? historyErrorMessage ?? sendErrorMessage ?? mediaErrorMessage ?? readErrorMessage }

  let conversationID: String
  private let repo: ChatRepo
  private var subscription: ChatSubscription?
  private var oldestCursor: ChatMessageCursor?
  private var sessionID = UUID()
  private var listenerID = UUID()
  private var isStarted = false
  private var isActive = false
  private var lastReadClientAt: Int64?
  private var readRequestID: UUID?
  private var restoredDraft: (text: String, clientID: String)?
  private var visibleLastMessageID: String?

  init(repo: ChatRepo, conversationID: String) {
    self.repo = repo
    self.conversationID = conversationID
  }

  var canSend: Bool {
    let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
    return !isSending && !isPreparingMedia && (!text.isEmpty || !attachments.isEmpty) && text.count <= FirebaseChatRepo.maxMessageLength
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
    readRequestID = nil
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
    self.visibleLastMessageID = visibleLastMessageID
    guard isStarted, isActive, readRequestID == nil, let message = messages.last,
      message.id == visibleLastMessageID,
      lastReadClientAt.map({ message.clientCreatedAt > $0 }) ?? true
    else { return nil }
    let token = sessionID
    let requestID = UUID()
    readRequestID = requestID
    return Task { [weak self] in
      guard let self else { return }
      defer { if self.readRequestID == requestID { self.readRequestID = nil } }
      // Coalesce arrivals while Firebase acknowledges an earlier visible message. A new
      // layout callback may already have run during that await, so drain its latest context.
      while self.isStarted, self.isActive, self.sessionID == token, self.readRequestID == requestID {
        guard let message = self.messages.last, message.id == self.visibleLastMessageID,
          self.lastReadClientAt.map({ message.clientCreatedAt > $0 }) ?? true else { return }
        do {
          try await self.repo.markRead(conversationID: self.conversationID, through: message.clientCreatedAt)
          guard self.sessionID == token, self.readRequestID == requestID else { return }
          self.lastReadClientAt = message.clientCreatedAt
          self.readErrorMessage = nil
        } catch {
          guard self.sessionID == token, self.readRequestID == requestID else { return }
          self.readErrorMessage = "No se pudo registrar la lectura. Toca Reintentar."
          return
        }
      }
    }
  }

  /// Sends the draft. Returns the send task, so tests can wait for it.
  @discardableResult
  func send() -> Task<Void, Never>? {
    guard canSend else { return nil }
    let text = draft
    let files = attachments
    draft = ""
    attachments = []
    let clientID = files.isEmpty && restoredDraft?.text == text ? restoredDraft!.clientID : UUID().uuidString
    restoredDraft = nil
    return performSend(text: text, files: files, clientID: clientID, isRetry: false)
  }

  @discardableResult
  func retry(_ message: FailedChatMessage) -> Task<Void, Never>? {
    guard !isSending, failedMessages.contains(where: { $0.id == message.id }) else { return nil }
    return performSend(text: message.text, files: message.attachments, clientID: message.id, isRetry: true)
  }

  private func performSend(text: String, files: [ChatPendingAttachment], clientID: String, isRetry: Bool) -> Task<Void, Never> {
    isSending = true
    uploadProgress = 0
    sendErrorMessage = nil
    return Task {
      do {
        try await repo.sendMessage(conversationID: conversationID, text: text, attachments: files, clientID: clientID) { [weak self] progress in
          Task { @MainActor [weak self] in self?.uploadProgress = progress }
        }
        failedMessages.removeAll { $0.id == clientID }
      } catch {
        if !isRetry {
          if files.isEmpty, draft.isEmpty {
            draft = text
            restoredDraft = (text, clientID)
          } else {
            failedMessages.append(FailedChatMessage(id: clientID, text: text, attachments: files))
          }
        }
        sendErrorMessage = (error as? LocalizedError)?.errorDescription ?? "No se pudo enviar el mensaje."
      }
      isSending = false
    }
  }

  func preparePhotos(_ items: [PhotosPickerItem]) async {
    guard !isPreparingMedia, !isSending else { return }
    isPreparingMedia = true
    mediaErrorMessage = nil
    defer { isPreparingMedia = false }
    for item in items {
      do {
        try Task.checkCancellation()
        guard let file = try await item.loadTransferable(type: ChatPickedFile.self)?.attachment else {
          throw ChatMediaError.invalidAttachment
        }
        try Task.checkCancellation()
        try addAttachment(file)
      } catch is CancellationError { return }
      catch { mediaErrorMessage = error.localizedDescription }
    }
  }

  func addAttachment(_ file: ChatPendingAttachment) throws {
    guard attachments.count < 10 else { throw ChatMediaError.tooManyAttachments }
    try file.validate()
    attachments.append(file)
  }

  func removeAttachment(_ id: String) {
    attachments.removeAll { $0.id == id }
  }
}

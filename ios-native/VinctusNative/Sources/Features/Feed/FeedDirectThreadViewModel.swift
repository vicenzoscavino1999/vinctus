import Foundation
import SwiftUI

@MainActor
final class FeedDirectThreadViewModel: ObservableObject {
  @Published private(set) var messages: [DirectMessage] = []
  @Published var draftMessage = ""
  @Published private(set) var isLoading = false
  @Published private(set) var isSending = false
  @Published private(set) var errorMessage: String?

  private let chatRepo: any ChatRepo
  private let conversationID: String
  private let currentUID: String
  private let currentUserName: String

  private var stopListener: (() -> Void)?

  init(
    chatRepo: any ChatRepo,
    conversationID: String,
    currentUID: String,
    currentUserName: String
  ) {
    self.chatRepo = chatRepo
    self.conversationID = conversationID
    self.currentUID = currentUID
    self.currentUserName = currentUserName
  }

  deinit {
    stopListener?()
  }

  func startListening() {
    guard stopListener == nil else { return }

    isLoading = true
    errorMessage = nil

    stopListener = chatRepo.subscribeToMessages(
      conversationID: conversationID,
      limit: 120,
      onUpdate: { [weak self] incoming in
        Task { @MainActor [weak self] in
          guard let self else { return }
          self.isLoading = false
          self.messages = self.sortedDedupedMessages(from: incoming)
        }
      },
      onError: { [weak self] error in
        Task { @MainActor [weak self] in
          self?.isLoading = false
          self?.errorMessage = error.localizedDescription
        }
      }
    )
  }

  func stopListening() {
    stopListener?()
    stopListener = nil
  }

  func sendMessage() async {
    guard !isSending else { return }

    let trimmed = draftMessage.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return }

    isSending = true
    errorMessage = nil
    defer { isSending = false }

    do {
      try await chatRepo.sendMessage(
        conversationID: conversationID,
        senderUID: currentUID,
        senderName: currentUserName,
        senderPhotoURL: nil,
        text: trimmed
      )
      draftMessage = ""
    } catch {
      errorMessage = error.localizedDescription
    }
  }

  func isMine(_ message: DirectMessage) -> Bool {
    message.senderID == currentUID
  }

  private func sortedDedupedMessages(from incoming: [DirectMessage]) -> [DirectMessage] {
    let ordered = incoming.sorted { lhs, rhs in
      if lhs.clientCreatedAt == rhs.clientCreatedAt {
        return lhs.id < rhs.id
      }
      return lhs.clientCreatedAt < rhs.clientCreatedAt
    }

    var seen = Set<String>()
    return ordered.filter { message in
      let dedupeKey = message.clientID.isEmpty ? message.id : message.clientID
      return seen.insert(dedupeKey).inserted
    }
  }
}

import Foundation
import SwiftUI

@MainActor
final class FeedDirectInboxViewModel: ObservableObject {
  @Published private(set) var conversations: [DirectConversationSummary] = []
  @Published private(set) var participantsByUID: [String: ChatPublicUser] = [:]
  @Published private(set) var suggestedUsers: [DiscoverUser] = []
  @Published private(set) var searchResults: [DiscoverUser] = []
  @Published private(set) var isLoadingConversations = false
  @Published private(set) var isSearchingUsers = false
  @Published private(set) var errorMessage: String?

  private let chatRepo: any ChatRepo
  private let discoverRepo: any DiscoverRepo

  private var stopConversationListener: (() -> Void)?
  private var searchTask: Task<Void, Never>?

  private var currentUID: String?
  private var isListeningEnabled = false

  init(chatRepo: any ChatRepo, discoverRepo: any DiscoverRepo) {
    self.chatRepo = chatRepo
    self.discoverRepo = discoverRepo
  }

  deinit {
    searchTask?.cancel()
    stopConversationListener?()
  }

  func setCurrentUserID(_ uid: String?) {
    let normalizedUID = normalize(uid)
    guard normalizedUID != currentUID else { return }

    currentUID = normalizedUID
    errorMessage = nil
    conversations = []
    searchResults = []
    participantsByUID.removeAll(keepingCapacity: true)
    cancelConversationListener()

    if isListeningEnabled {
      subscribeIfPossible()
    }

    Task {
      await loadSuggestedUsersIfNeeded(force: true)
    }
  }

  func activate() {
    isListeningEnabled = true
    subscribeIfPossible()

    Task {
      await loadSuggestedUsersIfNeeded(force: false)
    }
  }

  func deactivate() {
    isListeningEnabled = false
    isSearchingUsers = false
    searchTask?.cancel()
    cancelConversationListener()
  }

  func handleSearchTextChange(_ value: String) {
    searchTask?.cancel()

    let query = value.trimmingCharacters(in: .whitespacesAndNewlines)
    guard query.count >= 2 else {
      isSearchingUsers = false
      searchResults = []
      return
    }

    isSearchingUsers = true
    let normalized = query
    searchTask = Task { [weak self] in
      try? await Task.sleep(nanoseconds: 300_000_000)
      guard !Task.isCancelled else { return }
      await self?.runUserSearch(query: normalized)
    }
  }

  func filteredConversations(for query: String) -> [DirectConversationSummary] {
    let normalizedQuery = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    guard !normalizedQuery.isEmpty else { return conversations }

    return conversations.filter { conversation in
      let participant = participant(for: conversation)
      return participant.displayName.lowercased().contains(normalizedQuery)
        || conversation.lastMessageText.lowercased().contains(normalizedQuery)
    }
  }

  func participant(for conversation: DirectConversationSummary) -> ChatPublicUser {
    if let participant = participantsByUID[conversation.otherUID] {
      return participant
    }
    return fallbackParticipant(uid: conversation.otherUID)
  }

  func route(for conversation: DirectConversationSummary) -> FeedDirectThreadRoute {
    FeedDirectThreadRoute(
      conversationID: conversation.id,
      participant: participant(for: conversation)
    )
  }

  func loadSuggestedUsersIfNeeded(force: Bool) async {
    guard let currentUID else {
      suggestedUsers = []
      return
    }

    if !force, !suggestedUsers.isEmpty { return }

    do {
      suggestedUsers = try await discoverRepo.fetchRecentUsers(limit: 8, excluding: currentUID)
    } catch {
      errorMessage = error.localizedDescription
      suggestedUsers = []
    }
  }

  func startConversation(with user: DiscoverUser) async -> FeedDirectThreadRoute? {
    guard let currentUID else {
      errorMessage = "No hay sesion activa para iniciar chat."
      return nil
    }

    let participant = ChatPublicUser(uid: user.uid, displayName: user.displayName, photoURL: user.photoURL)
    participantsByUID[user.uid] = participant

    do {
      let conversationID = try await chatRepo.getOrCreateDirectConversation(
        currentUID: currentUID,
        otherUID: user.uid
      )
      return FeedDirectThreadRoute(conversationID: conversationID, participant: participant)
    } catch {
      errorMessage = error.localizedDescription
      return nil
    }
  }

  private func subscribeIfPossible() {
    guard isListeningEnabled else { return }
    guard let currentUID else { return }
    guard stopConversationListener == nil else { return }

    isLoadingConversations = true
    errorMessage = nil

    stopConversationListener = chatRepo.subscribeToDirectConversations(
      uid: currentUID,
      limit: 24,
      onUpdate: { [weak self] summaries in
        Task { @MainActor [weak self] in
          guard let self else { return }
          self.isLoadingConversations = false
          self.conversations = summaries
          await self.resolveParticipants(for: summaries)
        }
      },
      onError: { [weak self] error in
        Task { @MainActor [weak self] in
          self?.isLoadingConversations = false
          self?.errorMessage = error.localizedDescription
        }
      }
    )
  }

  private func runUserSearch(query: String) async {
    do {
      searchResults = try await discoverRepo.searchUsers(prefix: query, limit: 16, excluding: currentUID)
    } catch {
      errorMessage = error.localizedDescription
      searchResults = []
    }
    isSearchingUsers = false
  }

  private func resolveParticipants(for summaries: [DirectConversationSummary]) async {
    let missingUIDs = Array(
      Set(summaries.map(\.otherUID)).subtracting(participantsByUID.keys)
    )

    guard !missingUIDs.isEmpty else { return }

    for uid in missingUIDs {
      do {
        if let user = try await chatRepo.fetchPublicUser(uid: uid) {
          participantsByUID[uid] = user
        } else {
          participantsByUID[uid] = fallbackParticipant(uid: uid)
        }
      } catch {
        participantsByUID[uid] = fallbackParticipant(uid: uid)
      }
    }
  }

  private func fallbackParticipant(uid: String) -> ChatPublicUser {
    ChatPublicUser(
      uid: uid,
      displayName: truncatedUID(uid),
      photoURL: nil
    )
  }

  private func cancelConversationListener() {
    stopConversationListener?()
    stopConversationListener = nil
    isLoadingConversations = false
  }

  private func normalize(_ value: String?) -> String? {
    guard let value else { return nil }
    let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
    return trimmed.isEmpty ? nil : trimmed
  }

  private func truncatedUID(_ uid: String) -> String {
    if uid.count <= 14 { return uid }
    return "\(uid.prefix(10))..."
  }
}

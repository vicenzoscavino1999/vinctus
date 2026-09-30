import Foundation

/// What links the signed-in user with the person on a profile: follow requests between them and
/// the direct conversation opened from "Mensaje".
@MainActor
final class ProfileConnectionViewModel: ObservableObject {
  /// The person on this profile asked to follow the signed-in user.
  @Published private(set) var hasIncomingRequest = false
  /// Pending follow requests to the signed-in user, shown on their own profile.
  @Published private(set) var incomingRequestCount = 0
  @Published private(set) var isAnsweringRequest = false
  @Published private(set) var isOpeningConversation = false
  /// Set when the conversation is ready; the view navigates to it and clears it on the way back.
  @Published var openedConversationID: String?
  @Published private(set) var messageError: String?

  private let userID: String
  private let chatRepo: ChatRepo
  private let contentRepo: ProfileContentRepo

  init(userID: String, chatRepo: ChatRepo, contentRepo: ProfileContentRepo) {
    self.userID = userID
    self.chatRepo = chatRepo
    self.contentRepo = contentRepo
  }

  func loadRequests(isOwnProfile: Bool) async {
    if isOwnProfile {
      incomingRequestCount = (try? await contentRepo.fetchIncomingFollowRequests().count) ?? 0
    } else {
      hasIncomingRequest = (try? await contentRepo.hasPendingFollowRequest(from: userID)) ?? false
    }
  }

  func openConversation() async {
    guard !isOpeningConversation else { return }
    isOpeningConversation = true
    messageError = nil
    defer { isOpeningConversation = false }
    do {
      openedConversationID = try await chatRepo.openDirectConversation(with: userID)
    } catch {
      messageError = (error as? LocalizedError)?.errorDescription ?? "No se pudo abrir la conversación."
    }
  }

  func answerRequest(accept: Bool) async {
    guard !isAnsweringRequest else { return }
    isAnsweringRequest = true
    defer { isAnsweringRequest = false }
    do {
      try await contentRepo.answerFollowRequest(from: userID, accept: accept)
      hasIncomingRequest = false
    } catch {
      messageError = "No se pudo responder la solicitud."
    }
  }
}

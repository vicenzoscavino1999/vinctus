import SwiftUI
import UIKit

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

struct MessagesListView: View {
  let repo: ChatRepo
  let profileRepo: ProfileRepo

  @EnvironmentObject private var blockedUsers: BlockedUsersStore
  @StateObject private var vm: ConversationsViewModel

  init(repo: ChatRepo, profileRepo: ProfileRepo) {
    self.repo = repo
    self.profileRepo = profileRepo
    _vm = StateObject(wrappedValue: ConversationsViewModel(repo: repo))
  }

  private var visibleConversations: [ChatConversation] {
    vm.conversations.filter { !blockedUsers.isBlocked($0.otherUserID) }
  }

  var body: some View {
    List {
      if vm.isLoading, vm.conversations.isEmpty {
        HStack {
          Spacer()
          ProgressView()
          Spacer()
        }
        .listRowBackground(SwiftUI.Color.clear)
      } else if let error = vm.errorMessage, vm.conversations.isEmpty {
        emptyState(icon: "exclamationmark.bubble", title: error, message: "Desliza hacia abajo para reintentar.")
      } else if visibleConversations.isEmpty {
        emptyState(
          icon: "bubble.left.and.bubble.right",
          title: "Aún no tienes conversaciones",
          message: "Entra al perfil de alguien que sigues (o que te sigue) y toca Mensaje. Los chats de tus grupos también aparecen aquí."
        )
      } else {
        ForEach(visibleConversations) { conversation in
          NavigationLink {
            ConversationView(
              repo: repo,
              profileRepo: profileRepo,
              conversationID: conversation.id,
              title: conversation.title,
              otherUserID: conversation.otherUserID
            )
          } label: {
            ConversationRow(conversation: conversation)
          }
          .listRowBackground(SwiftUI.Color.clear)
        }
      }
    }
    .listStyle(.plain)
    .scrollContentBackground(.hidden)
    .background(VinctusTokens.Color.background)
    .navigationTitle("Mensajes")
    .onAppear { vm.start() }
    .refreshable {
      vm.stop()
      vm.start()
    }
  }

  private func emptyState(icon: String, title: String, message: String) -> some View {
    VStack(spacing: VinctusTokens.Spacing.md) {
      Image(systemName: icon)
        .font(.system(size: 40))
        .foregroundStyle(VinctusTokens.Color.accent)
      Text(title)
        .font(.headline)
        .multilineTextAlignment(.center)
      Text(message)
        .font(.subheadline)
        .foregroundStyle(VinctusTokens.Color.textMuted)
        .multilineTextAlignment(.center)
    }
    .frame(maxWidth: .infinity)
    .padding(.vertical, 60)
    .listRowBackground(SwiftUI.Color.clear)
    .listRowSeparator(.hidden)
  }
}

private struct ConversationRow: View {
  let conversation: ChatConversation

  var body: some View {
    HStack(spacing: VinctusTokens.Spacing.md) {
      ZStack(alignment: .bottomTrailing) {
        AvatarView(name: conversation.title, photoURLString: conversation.photoURL, size: 50)
        if conversation.isGroup {
          Image(systemName: "person.3.fill")
            .font(.system(size: 9, weight: .bold))
            .foregroundStyle(.black)
            .padding(4)
            .background(VinctusTokens.Color.accent)
            .clipShape(Circle())
        }
      }

      VStack(alignment: .leading, spacing: 3) {
        HStack {
          Text(conversation.title)
            .font(.headline)
            .foregroundStyle(VinctusTokens.Color.textPrimary)
            .lineLimit(1)
          Spacer()
          if conversation.updatedAt > .distantPast {
            Text(conversation.updatedAt, style: .relative)
              .font(.caption)
              .foregroundStyle(VinctusTokens.Color.textMuted)
          }
        }
        Text(conversation.lastMessageText?.isEmpty == false ? conversation.lastMessageText! : "Sin mensajes todavía")
          .font(.subheadline)
          .foregroundStyle(VinctusTokens.Color.textMuted)
          .lineLimit(1)
      }
    }
    .padding(.vertical, 4)
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

  func send() {
    guard canSend else { return }
    let text = draft
    draft = ""
    isSending = true
    errorMessage = nil
    Task {
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

struct ConversationView: View {
  let profileRepo: ProfileRepo
  let title: String
  let otherUserID: String?

  @EnvironmentObject private var authVM: AuthViewModel
  @EnvironmentObject private var blockedUsers: BlockedUsersStore
  @Environment(\.dismiss) private var dismiss
  @StateObject private var vm: ConversationViewModel
  @State private var reportTarget: ReportTarget?
  @State private var actionError: String?

  init(repo: ChatRepo, profileRepo: ProfileRepo, conversationID: String, title: String, otherUserID: String?) {
    self.profileRepo = profileRepo
    self.title = title
    self.otherUserID = otherUserID
    _vm = StateObject(wrappedValue: ConversationViewModel(repo: repo, conversationID: conversationID))
  }

  private var isGroup: Bool { vm.conversationID.hasPrefix("grp_") }

  private var visibleMessages: [ChatMessage] {
    vm.messages.filter { !blockedUsers.isBlocked($0.senderID) }
  }

  var body: some View {
    VStack(spacing: 0) {
      ScrollViewReader { proxy in
        ScrollView {
          LazyVStack(spacing: 8) {
            if vm.isLoading {
              ProgressView()
                .padding(.top, 40)
            } else if visibleMessages.isEmpty {
              Text("Todavía no hay mensajes. ¡Escribe el primero!")
                .font(.subheadline)
                .foregroundStyle(VinctusTokens.Color.textMuted)
                .padding(.top, 40)
            }

            ForEach(visibleMessages) { message in
              MessageBubble(
                message: message,
                isMine: message.senderID == authVM.currentUserID,
                showsSender: isGroup
              )
              .id(message.id)
              .contextMenu {
                if message.senderID != authVM.currentUserID {
                  Button {
                    reportTarget = .message(
                      conversationID: vm.conversationID,
                      messageID: message.id,
                      authorID: message.senderID,
                      excerpt: message.text
                    )
                  } label: {
                    Label("Denunciar mensaje", systemImage: "flag")
                  }
                  Button(role: .destructive) {
                    block(message.senderID)
                  } label: {
                    Label("Bloquear a \(message.senderName ?? "este usuario")", systemImage: "hand.raised")
                  }
                } else {
                  Button {
                    UIPasteboard.general.string = message.text
                  } label: {
                    Label("Copiar", systemImage: "doc.on.doc")
                  }
                }
              }
            }
          }
          .padding(.horizontal, VinctusTokens.Spacing.md)
          .padding(.vertical, VinctusTokens.Spacing.sm)
        }
        .onChange(of: visibleMessages.last?.id) { _, lastID in
          guard let lastID else { return }
          withAnimation { proxy.scrollTo(lastID, anchor: .bottom) }
        }
      }

      if let error = vm.errorMessage ?? actionError {
        Text(error)
          .font(.footnote)
          .foregroundStyle(.red)
          .padding(.horizontal, VinctusTokens.Spacing.lg)
          .padding(.top, 6)
      }

      composer
    }
    .background(VinctusTokens.Color.background)
    .navigationTitle(title)
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      if let otherUserID {
        ToolbarItem(placement: .topBarTrailing) {
          HStack(spacing: 4) {
            NavigationLink(destination: ProfileView(repo: profileRepo, userID: otherUserID)) {
              Image(systemName: "person.crop.circle")
            }
            .accessibilityLabel("Ver perfil")
            ModerationMenu(
              target: .user(userID: otherUserID),
              authorID: otherUserID,
              authorName: title,
              onBlocked: { dismiss() }
            )
          }
        }
      }
    }
    .sheet(item: $reportTarget) { target in
      ReportSheet(target: target, repo: blockedUsers.repo)
    }
    .onAppear { vm.start() }
    .onDisappear { vm.stop() }
  }

  private var composer: some View {
    HStack(alignment: .bottom, spacing: VinctusTokens.Spacing.sm) {
      TextField("Escribe un mensaje", text: $vm.draft, axis: .vertical)
        .lineLimit(1...5)
        .padding(10)
        .background(VinctusTokens.Color.surface2)
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))

      Button(action: vm.send) {
        Image(systemName: "arrow.up.circle.fill")
          .font(.system(size: 32))
          .foregroundStyle(vm.canSend ? VinctusTokens.Color.accent : VinctusTokens.Color.textMuted)
      }
      .disabled(!vm.canSend)
      .accessibilityLabel("Enviar")
    }
    .padding(VinctusTokens.Spacing.sm)
    .background(VinctusTokens.Color.surface)
  }

  private func block(_ userID: String) {
    Task {
      do {
        try await blockedUsers.block(userID)
        if userID == otherUserID { dismiss() }
      } catch {
        actionError = error.localizedDescription
      }
    }
  }
}

extension ReportTarget: Identifiable {
  var id: String {
    switch self {
    case let .post(postID, _):
      return "post_\(postID)"
    case let .comment(postID, commentID, _):
      return "comment_\(postID)_\(commentID)"
    case let .user(userID):
      return "user_\(userID)"
    case let .aiResponse(contextID, excerpt):
      return "ai_\(contextID)_\(excerpt.hashValue)"
    case let .message(conversationID, messageID, _, _):
      return "msg_\(conversationID)_\(messageID)"
    }
  }
}

private struct MessageBubble: View {
  let message: ChatMessage
  let isMine: Bool
  let showsSender: Bool

  var body: some View {
    HStack {
      if isMine { Spacer(minLength: 50) }
      VStack(alignment: isMine ? .trailing : .leading, spacing: 3) {
        if showsSender, !isMine {
          Text(message.senderName ?? "Usuario")
            .font(.caption.weight(.semibold))
            .foregroundStyle(VinctusTokens.Color.accent)
        }
        Text(bubbleText)
          .foregroundStyle(isMine ? SwiftUI.Color.black : VinctusTokens.Color.textPrimary)
          .italic(message.text.isEmpty)
          .padding(.horizontal, 12)
          .padding(.vertical, 8)
          .background(isMine ? VinctusTokens.Color.accent : VinctusTokens.Color.surface2)
          .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        Text(message.createdAt, style: .time)
          .font(.caption2)
          .foregroundStyle(VinctusTokens.Color.textMuted)
      }
      if !isMine { Spacer(minLength: 50) }
    }
  }

  private var bubbleText: String {
    if !message.text.isEmpty { return message.text }
    return message.hasAttachments ? "Archivo adjunto (ábrelo en la web)" : ""
  }
}

import SwiftUI

struct MessagesListView: View {
  let repo: ChatRepo
  let profileRepo: ProfileRepo

  @EnvironmentObject private var blockedUsers: BlockedUsersStore
  @StateObject private var vm: ConversationsViewModel
  /// Screenshot builds open a conversation with `-VinctusOpenChat <id>`.
  @State private var openedConversation: ChatConversation?

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
    .navigationDestination(item: $openedConversation) { conversation in
      ConversationView(
        repo: repo,
        profileRepo: profileRepo,
        conversationID: conversation.id,
        title: conversation.title,
        otherUserID: conversation.otherUserID
      )
    }
    .onAppear {
      vm.start()
      if let id = AppRepos.demoArgument("-VinctusOpenChat"), openedConversation == nil {
        openedConversation = vm.conversations.first { $0.id == id }
      }
    }
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

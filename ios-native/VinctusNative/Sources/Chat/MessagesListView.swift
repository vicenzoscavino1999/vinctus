import SwiftUI

/// Mensajes, like the web's inbox: every conversation newest first, a search and
/// Todos · Privados · Grupos; each row shows who, a short time and the last message.
struct MessagesListView: View {
  let repo: ChatRepo
  let profileRepo: ProfileRepo

  @EnvironmentObject private var authVM: AuthViewModel
  @EnvironmentObject private var blockedUsers: BlockedUsersStore
  @StateObject private var vm: ConversationsViewModel
  /// Screenshot builds open a conversation with `-VinctusOpenChat <id>`.
  @State private var openedConversation: ChatConversation?
  @State private var filter: InboxFilter = .all
  @State private var query = ""

  init(repo: ChatRepo, profileRepo: ProfileRepo) {
    self.repo = repo
    self.profileRepo = profileRepo
    _vm = StateObject(wrappedValue: ConversationsViewModel(repo: repo))
  }

  /// Every conversation except direct chats with people you blocked.
  private var allConversations: [ChatConversation] {
    vm.conversations.filter { !blockedUsers.isBlocked($0.otherUserID) }
  }

  private var visibleConversations: [ChatConversation] {
    allConversations.filter { filter.includes($0) && InboxFormat.matches($0.title, query: query) }
  }

  private var noResultsText: String {
    if !query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { return "No hay resultados." }
    switch filter {
    case .all: return "No hay resultados."
    case .direct: return "Aún no tienes mensajes privados."
    case .group: return "Aún no hay chats de grupo."
    }
  }

  var body: some View {
    List {
      if let error = vm.errorMessage, !vm.conversations.isEmpty {
        VStack(alignment: .leading, spacing: 6) {
          Text(error)
            .font(.footnote)
            .foregroundStyle(.red)
          Button("Reintentar") {
            vm.stop()
            vm.start()
          }
        }
        .listRowBackground(SwiftUI.Color.clear)
      }
      if vm.isLoading, vm.conversations.isEmpty {
        HStack {
          Spacer()
          ProgressView()
          Spacer()
        }
        .listRowBackground(SwiftUI.Color.clear)
      } else if let error = vm.errorMessage, vm.conversations.isEmpty {
        emptyState(icon: "exclamationmark.bubble", title: error, message: "Desliza hacia abajo para reintentar.")
      } else if allConversations.isEmpty {
        emptyState(
          icon: "bubble.left.and.bubble.right",
          title: "Aún no tienes conversaciones",
          message: "Entra al perfil de alguien que sigues (o que te sigue) y toca Mensaje. Los chats de tus grupos también aparecen aquí."
        )
      } else {
        filterChips

        if visibleConversations.isEmpty {
          Text(noResultsText)
            .font(.footnote)
            .foregroundStyle(VinctusTokens.Color.textMuted)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 28)
            .listRowBackground(SwiftUI.Color.clear)
            .listRowSeparator(.hidden)
        }

        // Rows open the chat without List's arrow, like the web.
        ForEach(visibleConversations) { conversation in
          Button {
            openedConversation = conversation
          } label: {
            ConversationRow(conversation: conversation, uid: authVM.currentUserID)
          }
          .buttonStyle(.plain)
          .listRowBackground(SwiftUI.Color.clear)
          .listRowSeparator(.hidden)
          .listRowInsets(EdgeInsets(top: 6, leading: 16, bottom: 6, trailing: 16))
        }
      }
    }
    .listStyle(.plain)
    .scrollContentBackground(.hidden)
    .background(VinctusTokens.Color.background)
    .navigationTitle("Mensajes")
    .searchable(text: $query, prompt: "Buscar conversaciones o grupos")
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

  private var filterChips: some View {
    HStack(spacing: 8) {
      ForEach(InboxFilter.allCases) { option in
        let isSelected = filter == option
        Button {
          filter = option
        } label: {
          Text(option.label)
            .font(.system(size: 13, weight: .medium))
            .padding(.horizontal, 14)
            .frame(height: 32)
            .foregroundStyle(isSelected ? SwiftUI.Color.black : VinctusTokens.Color.textSecondary)
            .background(isSelected ? SwiftUI.Color.white : VinctusTokens.Color.surface)
            .clipShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isSelected ? .isSelected : [])
      }
      Spacer(minLength: 0)
    }
    .listRowBackground(SwiftUI.Color.clear)
    .listRowSeparator(.hidden)
    .listRowInsets(EdgeInsets(top: 4, leading: 16, bottom: 8, trailing: 16))
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

/// One conversation: photo, initials or the group's icon; the name with a short time; the last
/// message in one line ("Tú: …" for yours).
private struct ConversationRow: View {
  let conversation: ChatConversation
  let uid: String?

  var body: some View {
    HStack(spacing: VinctusTokens.Spacing.md) {
      avatar

      VStack(alignment: .leading, spacing: 3) {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
          Text(conversation.title)
            .font(.body.weight(.semibold))
            .foregroundStyle(VinctusTokens.Color.textPrimary)
            .lineLimit(1)
          Spacer(minLength: 8)
          Text(InboxFormat.time(conversation.updatedAt))
            .font(.caption)
            .foregroundStyle(VinctusTokens.Color.textMuted)
        }
        HStack(spacing: 5) {
          if conversation.isGroup {
            Image(systemName: "person.2")
              .font(.caption2)
              .accessibilityLabel("Grupo")
          }
          Text(InboxFormat.preview(conversation, uid: uid))
            .lineLimit(1)
        }
        .font(.subheadline)
        .foregroundStyle(VinctusTokens.Color.textMuted)
      }
    }
    .padding(.vertical, 4)
    .contentShape(Rectangle())
  }

  @ViewBuilder
  private var avatar: some View {
    if conversation.isGroup, conversation.photoURL == nil {
      Image(systemName: "person.2")
        .font(.system(size: 18))
        .foregroundStyle(VinctusTokens.Color.textMuted)
        .frame(width: 48, height: 48)
        .background(VinctusTokens.Color.surface)
        .clipShape(Circle())
        .overlay(Circle().stroke(VinctusTokens.Color.border.opacity(0.6), lineWidth: 1))
    } else {
      AvatarView(name: conversation.title, photoURLString: conversation.photoURL, size: 48)
    }
  }
}

import SwiftUI
import UIKit

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

      Button { vm.send() } label: {
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

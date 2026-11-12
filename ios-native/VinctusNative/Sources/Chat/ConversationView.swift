import SwiftUI
import UIKit

struct ConversationView: View {
  let profileRepo: ProfileRepo
  let title: String
  let otherUserID: String?

  @EnvironmentObject private var authVM: AuthViewModel
  @EnvironmentObject private var blockedUsers: BlockedUsersStore
  @Environment(\.dismiss) private var dismiss
  @Environment(\.scenePhase) private var scenePhase
  @StateObject private var vm: ConversationViewModel
  @State private var reportTarget: ReportTarget?
  @State private var actionError: String?
  @State private var scrollPosition: String?
  @State private var bottomPosition: ChatBottomPosition?
  @State private var isAtBottom = true
  @State private var bottomWasVisibleForMessageID: String?
  @State private var didPositionInitialMessages = false
  @State private var hasNewMessages = false

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
      GeometryReader { viewport in
        ScrollViewReader { proxy in
          ScrollView {
            VStack(spacing: 0) {
              if vm.hasOlderMessages {
                Button {
                  Task { await vm.loadOlder() }
                } label: {
                  if vm.isLoadingOlder {
                    ProgressView()
                  } else {
                    Text("Cargar mensajes anteriores")
                  }
                }
                .disabled(vm.isLoadingOlder)
                .padding()
              }
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
                  messageRow(message)
                    .id(message.id)
                }
              }
              .scrollTargetLayout()
              .padding(.horizontal, VinctusTokens.Spacing.md)
              .padding(.vertical, VinctusTokens.Spacing.sm)

              Color.clear
                .frame(height: 1)
                .id("conversation-bottom")
                .background {
                  GeometryReader { geometry in
                    Color.clear.preference(
                      key: ChatBottomPositionKey.self,
                      value: ChatBottomPosition(
                        messageID: visibleMessages.last?.id,
                        bottomY: geometry.frame(in: .named("conversation-scroll")).maxY
                      )
                    )
                  }
                }
            }
          }
          .coordinateSpace(name: "conversation-scroll")
          .scrollPosition(id: $scrollPosition, anchor: .top)
          .onPreferenceChange(ChatBottomPositionKey.self) { position in
            bottomPosition = position
            isAtBottom = position.map { $0.bottomY >= 0 && $0.bottomY <= viewport.size.height + 1 } ?? false
            if isAtBottom {
              hasNewMessages = false
              bottomWasVisibleForMessageID = position?.messageID
            } else if position?.messageID == bottomWasVisibleForMessageID {
              bottomWasVisibleForMessageID = nil
            }
            updateReadingContext()
          }
          .onChange(of: visibleMessages.last?.id) { previousID, lastID in
            guard lastID != nil else { return }
            if !didPositionInitialMessages || isAtBottom ||
              (previousID != nil && bottomWasVisibleForMessageID == previousID) ||
              (visibleMessages.last?.senderID == authVM.currentUserID && vm.isSending) {
              didPositionInitialMessages = true
              withAnimation { proxy.scrollTo("conversation-bottom", anchor: .bottom) }
            } else {
              hasNewMessages = true
            }
          }
          .overlay(alignment: .bottomTrailing) {
            if hasNewMessages {
              Button {
                withAnimation { proxy.scrollTo("conversation-bottom", anchor: .bottom) }
              } label: {
                Label("Mensajes nuevos", systemImage: "arrow.down")
                  .font(.subheadline)
                  .padding(10)
                  .background(VinctusTokens.Color.surface2, in: Capsule())
              }
              .padding()
            }
          }
        }
      }

      if let error = vm.errorMessage ?? actionError {
        Text(error)
          .font(.footnote)
          .foregroundStyle(.red)
          .padding(.horizontal, VinctusTokens.Spacing.lg)
          .padding(.top, 6)
      }

      if vm.loadErrorMessage != nil {
        Button("Reintentar carga") { vm.retryLoading() }
          .padding(.vertical, 6)
      }

      ForEach(vm.failedMessages) { message in
        HStack {
          Text("No enviado: \(message.text)")
            .font(.footnote)
            .lineLimit(2)
          Spacer()
          Button("Reintentar") { vm.retry(message) }
            .disabled(vm.isSending)
        }
        .padding(.horizontal)
        .padding(.vertical, 6)
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
    .onAppear {
      vm.start()
      updateReadingContext()
    }
    .onDisappear { vm.stop() }
    .onChange(of: scenePhase) { _, _ in updateReadingContext() }
  }

  private func updateReadingContext() {
    vm.updateReadingContext(
      isActive: scenePhase == .active,
      visibleLastMessageID: isAtBottom ? bottomPosition?.messageID : nil
    )
  }

  private func messageRow(_ message: ChatMessage) -> some View {
    MessageBubble(
      message: message,
      isMine: message.senderID == authVM.currentUserID,
      showsSender: isGroup
    )
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

private struct ChatBottomPosition: Equatable {
  let messageID: String?
  let bottomY: CGFloat
}

private struct ChatBottomPositionKey: PreferenceKey {
  static let defaultValue: ChatBottomPosition? = nil

  static func reduce(value: inout ChatBottomPosition?, nextValue: () -> ChatBottomPosition?) {
    value = nextValue() ?? value
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

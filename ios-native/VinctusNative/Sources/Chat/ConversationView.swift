import SwiftUI
import UIKit
import PhotosUI

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
  @State private var scrollState = ChatScrollState()
  @State private var selectedPhotos: [PhotosPickerItem] = []
  @StateObject private var voice = ChatVoiceRecorder()

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
            scrollState.updateBottom(
              isVisible: position.map { $0.bottomY >= 0 && $0.bottomY <= viewport.size.height + 1 } ?? false,
              messageID: position?.messageID
            )
            updateReadingContext()
          }
          .onChange(of: visibleMessages.last?.id) { previousID, lastID in
            if scrollState.lastMessageChanged(
              previousID: previousID,
              lastID: lastID,
              isSendingOwnMessage: visibleMessages.last?.senderID == authVM.currentUserID && vm.isSending
            ) {
              withAnimation { proxy.scrollTo("conversation-bottom", anchor: .bottom) }
            }
          }
          .simultaneousGesture(
            DragGesture()
              .onChanged { _ in
                scrollState.userDidScroll()
                updateReadingContext()
              }
              .onEnded { _ in
                scrollState.updateBottom(
                  isVisible: bottomPosition.map { $0.bottomY >= 0 && $0.bottomY <= viewport.size.height + 1 } ?? false,
                  messageID: bottomPosition?.messageID
                )
                updateReadingContext()
              }
          )
          .overlay(alignment: .bottomTrailing) {
            if scrollState.hasNewMessages {
              Button {
                scrollState.scrollToLatest()
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
      if vm.readErrorMessage != nil {
        Button("Reintentar lectura") { updateReadingContext() }
      }

      if let error = voice.errorMessage {
        Text(error).font(.footnote).foregroundStyle(.red).padding(.horizontal)
      }

      if vm.isPreparingMedia {
        ProgressView("Preparando archivos…").padding(8)
      }
      if vm.isSending {
        ProgressView(value: vm.uploadProgress) {
          Text(vm.uploadProgress < 1 ? "Enviando… \(Int(vm.uploadProgress * 100)) %" : "Guardando mensaje…")
            .font(.caption)
        }
        .padding(.horizontal)
      }

      if !vm.attachments.isEmpty {
        ChatPendingFilesView(files: vm.attachments, remove: vm.removeAttachment)
          .disabled(voice.isRecording || voice.isRequestingPermission)
      }

      ForEach(vm.failedMessages) { message in
        HStack {
          Text("No enviado: \(message.text.isEmpty ? "Adjuntos (\(message.attachments.count))" : message.text)")
            .font(.footnote)
            .lineLimit(2)
          Spacer()
          Button("Reintentar") { vm.retry(message) }
            .disabled(vm.isSending)
        }
        .padding(.horizontal)
        .padding(.vertical, 6)
      }

      if voice.isRecording {
        HStack {
          Label("Grabando \(voice.seconds / 60):\(String(format: "%02d", voice.seconds % 60)) / 5:00", systemImage: "mic.fill")
            .foregroundStyle(.red)
          Spacer()
          Button("Cancelar") { voice.cancel() }
          Button("Terminar") { voice.finish() }
        }
        .font(.subheadline)
        .padding()
      } else { composer }
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
    .onDisappear { vm.stop(); voice.cancel() }
    .onChange(of: scenePhase) { _, phase in
      if phase != .active { voice.finish() }
      if phase == .background { voice.cancel() }
      updateReadingContext()
    }
    .task(id: selectedPhotos) {
      guard !selectedPhotos.isEmpty else { return }
      await vm.preparePhotos(selectedPhotos)
      selectedPhotos = []
    }
    .onChange(of: voice.finishedRecording?.id) { _, _ in
      guard let file = voice.takeRecording() else { return }
      do { try vm.addAttachment(file) }
      catch { vm.mediaErrorMessage = error.localizedDescription }
    }
  }

  private func updateReadingContext() {
    vm.updateReadingContext(
      isActive: scenePhase == .active,
      visibleLastMessageID: scrollState.isAtBottom ? bottomPosition?.messageID : nil
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
    .disabled(voice.isRecording || voice.isRequestingPermission)
  }

  private var composer: some View {
    HStack(alignment: .bottom, spacing: VinctusTokens.Spacing.sm) {
      PhotosPicker(selection: $selectedPhotos, maxSelectionCount: max(1, 10 - vm.attachments.count),
                   matching: .any(of: [.images, .videos]), preferredItemEncoding: .compatible) {
        Image(systemName: "plus.circle").font(.system(size: 26))
      }
      .accessibilityLabel("Adjuntar fotos o videos")
      .disabled(vm.isSending || vm.isPreparingMedia || voice.isRequestingPermission || vm.attachments.count >= 10)

      TextField("Escribe un mensaje", text: $vm.draft, axis: .vertical)
        .lineLimit(1...5)
        .padding(10)
        .background(VinctusTokens.Color.surface2)
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))

      Button { Task { await voice.start() } } label: {
        Image(systemName: "mic").font(.system(size: 23))
      }
      .accessibilityLabel("Grabar nota de voz")
      .disabled(vm.isSending || vm.isPreparingMedia || voice.isRequestingPermission || vm.attachments.count >= 10)

      Button { vm.send() } label: {
        Image(systemName: "arrow.up.circle.fill")
          .font(.system(size: 32))
          .foregroundStyle(vm.canSend ? VinctusTokens.Color.accent : VinctusTokens.Color.textMuted)
      }
      .disabled(!vm.canSend || voice.isRequestingPermission)
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
        ForEach(message.attachments) { attachment in
          ChatAttachmentView(attachment: attachment)
        }
        if !message.text.isEmpty || (message.hasAttachments && message.attachments.isEmpty) {
          Text(bubbleText)
          .foregroundStyle(isMine ? SwiftUI.Color.black : VinctusTokens.Color.textPrimary)
          .italic(message.text.isEmpty)
          .padding(.horizontal, 12)
          .padding(.vertical, 8)
          .background(isMine ? VinctusTokens.Color.accent : VinctusTokens.Color.surface2)
          .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        }
        Text(message.createdAt, style: .time)
          .font(.caption2)
          .foregroundStyle(VinctusTokens.Color.textMuted)
      }
      if !isMine { Spacer(minLength: 50) }
    }
  }

  private var bubbleText: String {
    if !message.text.isEmpty { return message.text }
    return message.hasAttachments ? "Adjunto no disponible" : ""
  }
}

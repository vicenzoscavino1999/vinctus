import SwiftUI
import UIKit
import PhotosUI

struct ConversationView: View {
  let repo: ChatRepo
  let profileRepo: ProfileRepo
  let title: String
  let otherUserID: String?
  /// The person's photo or the group's icon, for the header.
  let photoURL: String?

  @EnvironmentObject private var authVM: AuthViewModel
  @EnvironmentObject private var blockedUsers: BlockedUsersStore
  @Environment(\.dismiss) private var dismiss
  @Environment(\.scenePhase) private var scenePhase
  @Environment(\.setBottomNavigationHidden) private var setBottomNavigationHidden
  @StateObject private var vm: ConversationViewModel
  @State private var reportTarget: ReportTarget?
  @State private var actionError: String?
  @State private var scrollPosition: String?
  @State private var bottomPosition: ChatBottomPosition?
  @State private var scrollState = ChatScrollState()
  @State private var selectedPhotos: [PhotosPickerItem] = []
  @StateObject private var voice = ChatVoiceRecorder()
  /// The details (mute, files, search, report, group options) open from the header.
  @State private var showsDetails = false
  @State private var didOpenDemoDetails = false
  /// "Limpiar chat local": messages up to this moment are hidden on this device.
  @State private var clearedAt: Date?
  /// A search result in the details: scroll to it and highlight it when back in the chat.
  @State private var pendingJumpID: String?
  @State private var highlightedMessageID: String?

  init(repo: ChatRepo, profileRepo: ProfileRepo, conversationID: String, title: String, otherUserID: String?,
       photoURL: String? = nil) {
    self.repo = repo
    self.profileRepo = profileRepo
    self.title = title
    self.otherUserID = otherUserID
    self.photoURL = photoURL
    _vm = StateObject(wrappedValue: ConversationViewModel(repo: repo, conversationID: conversationID))
  }

  private var isGroup: Bool { vm.conversationID.hasPrefix("grp_") }

  private var visibleMessages: [ChatMessage] {
    vm.messages.filter { message in
      !blockedUsers.isBlocked(message.senderID) && clearedAt.map { message.createdAt > $0 } != false
    }
  }

  /// Who the details are about; nil for a direct chat whose other person is unknown.
  private var detailsKind: ChatDetailsViewModel.Kind? {
    if isGroup { return .group(groupID: String(vm.conversationID.dropFirst(4))) }
    return otherUserID.map { .direct(otherUserID: $0) }
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
              LazyVStack(spacing: 0) {
                if vm.isLoading {
                  ProgressView()
                    .padding(.top, 40)
                } else if visibleMessages.isEmpty, clearedAt != nil {
                  VStack(spacing: 10) {
                    Text("Chat limpiado localmente.")
                      .font(.subheadline)
                      .foregroundStyle(VinctusTokens.Color.textMuted)
                    Button("Mostrar mensajes") {
                      ChatClearedStore.restore(vm.conversationID)
                      clearedAt = nil
                    }
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(VinctusTokens.Color.accent)
                  }
                  .padding(.top, 60)
                } else if visibleMessages.isEmpty {
                  VStack(spacing: 6) {
                    Text("Empieza la conversación")
                      .font(VinctusTokens.Typography.serif(22))
                      .foregroundStyle(VinctusTokens.Color.textSecondary)
                    Text("Todavía no hay mensajes. ¡Escribe el primero!")
                      .font(.subheadline)
                      .foregroundStyle(VinctusTokens.Color.textMuted)
                  }
                  .padding(.top, 60)
                }

                let runs = ChatMessageRuns.describe(visibleMessages)
                ForEach(visibleMessages) { message in
                  let run = runs[message.id] ?? ChatMessageRun(showsDay: false, joinsPrevious: false, joinsNext: false)
                  VStack(spacing: 0) {
                    if run.showsDay {
                      ChatDaySeparator(date: message.createdAt)
                    }
                    messageRow(message, run: run)
                      .background(
                        RoundedRectangle(cornerRadius: 22, style: .continuous)
                          .fill(VinctusTokens.Color.accent.opacity(highlightedMessageID == message.id ? 0.18 : 0))
                          .padding(-4)
                      )
                  }
                  // Tight spacing inside a run, more between runs (like the web).
                  .padding(.top, run.joinsPrevious ? 2 : (run.showsDay ? 0 : 10))
                  .id(message.id)
                  .transition(.asymmetric(
                    insertion: .move(edge: .bottom).combined(with: .opacity),
                    removal: .opacity
                  ))
                }
              }
              .animation(.snappy(duration: 0.28), value: visibleMessages.last?.id)
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
          .overlay(alignment: .bottom) {
            if scrollState.hasNewMessages {
              Button {
                scrollState.scrollToLatest()
                withAnimation { proxy.scrollTo("conversation-bottom", anchor: .bottom) }
              } label: {
                Label("Mensajes nuevos", systemImage: "arrow.down")
                  .font(.subheadline.weight(.semibold))
                  .foregroundStyle(VinctusTokens.Color.textPrimary)
                  .padding(.horizontal, 16)
                  .padding(.vertical, 9)
                  .background(.ultraThinMaterial, in: Capsule())
                  .overlay(Capsule().stroke(VinctusTokens.Color.border, lineWidth: 1))
              }
              .buttonStyle(.plain)
              .padding(.bottom, 12)
              .transition(.move(edge: .bottom).combined(with: .opacity))
            }
          }
          .animation(.snappy(duration: 0.25), value: scrollState.hasNewMessages)
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
        recordingBar
      } else { composer }
    }
    .background(VinctusTokens.Color.background)
    .navigationTitle(title)
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      if detailsKind != nil {
        // The person or group opens the details, like the web's header.
        ToolbarItem(placement: .principal) {
          Button {
            showsDetails = true
          } label: {
            HStack(spacing: 9) {
              if isGroup {
                GroupSquareIcon(name: title, iconURL: photoURL, size: 30)
              } else {
                AvatarView(name: title, photoURLString: photoURL, size: 30)
              }
              VStack(alignment: .leading, spacing: 0) {
                Text(title)
                  .font(.subheadline.weight(.semibold))
                  .foregroundStyle(VinctusTokens.Color.textPrimary)
                  .lineLimit(1)
                Text(isGroup ? "Grupo · ver detalles" : "Ver detalles")
                  .font(.caption2)
                  .foregroundStyle(VinctusTokens.Color.textMuted)
              }
            }
          }
          .buttonStyle(.plain)
          .accessibilityLabel(isGroup ? "Opciones del grupo" : "Ver detalles del chat")
          .accessibilityIdentifier("chat-details-open")
        }
        ToolbarItem(placement: .topBarTrailing) {
          Button {
            showsDetails = true
          } label: {
            Image(systemName: "info.circle")
          }
          .accessibilityLabel("Detalles")
        }
      }
    }
    .navigationDestination(isPresented: $showsDetails) {
      if let detailsKind {
        ChatDetailsView(
          kind: detailsKind,
          conversationID: vm.conversationID,
          title: title,
          photoURL: photoURL,
          messages: visibleMessages,
          chatRepo: repo,
          profileRepo: profileRepo,
          onJumpToMessage: { messageID in
            pendingJumpID = messageID
            showsDetails = false
          },
          onCleared: {
            clearedAt = ChatClearedStore.clearedAt(vm.conversationID)
          },
          onLeftConversation: {
            showsDetails = false
            Task {
              // Let the details pop before closing the chat under them.
              try? await Task.sleep(for: .milliseconds(450))
              dismiss()
            }
          }
        )
      }
    }
    .onChange(of: showsDetails) { _, isShowing in
      guard !isShowing, let messageID = pendingJumpID else { return }
      pendingJumpID = nil
      scrollState.userDidScroll()
      Task {
        try? await Task.sleep(for: .milliseconds(350))
        withAnimation(.snappy) { scrollPosition = messageID }
        highlightedMessageID = messageID
        try? await Task.sleep(for: .seconds(2))
        withAnimation { highlightedMessageID = nil }
      }
    }
    .sheet(item: $reportTarget) { target in
      ReportSheet(target: target, repo: blockedUsers.repo)
    }
    .onAppear {
      setBottomNavigationHidden(true)
      clearedAt = ChatClearedStore.clearedAt(vm.conversationID)
      vm.start()
      updateReadingContext()
      if !didOpenDemoDetails, AppRepos.demoArgument("-VinctusOpenChatDetails") != nil {
        didOpenDemoDetails = true
        showsDetails = true
      }
    }
    .onDisappear {
      voice.cancel()
      // The details open over the chat: its messages stay live and the bar stays hidden.
      guard !showsDetails else { return }
      setBottomNavigationHidden(false)
      vm.stop()
    }
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

  private func messageRow(_ message: ChatMessage, run: ChatMessageRun) -> some View {
    MessageBubble(
      message: message,
      isMine: message.senderID == authVM.currentUserID,
      isGroup: isGroup,
      run: run
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

  /// Something to send: the mic turns into the send button, like the web's composer.
  private var hasContent: Bool {
    !vm.draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !vm.attachments.isEmpty
  }

  /// One row, like Instagram: attach, the growing text field, and the mic that turns into send.
  private var composer: some View {
    HStack(alignment: .bottom, spacing: VinctusTokens.Spacing.sm) {
      PhotosPicker(selection: $selectedPhotos, maxSelectionCount: max(1, 10 - vm.attachments.count),
                   matching: .any(of: [.images, .videos]), preferredItemEncoding: .compatible) {
        Image(systemName: "plus")
          .font(.system(size: 18, weight: .semibold))
          .foregroundStyle(VinctusTokens.Color.accent)
          .frame(width: 38, height: 38)
          .overlay(Circle().stroke(VinctusTokens.Color.accent.opacity(0.6), lineWidth: 1.2))
          .contentShape(Circle())
      }
      .accessibilityLabel("Adjuntar fotos o videos")
      .disabled(vm.isSending || vm.isPreparingMedia || voice.isRequestingPermission || vm.attachments.count >= 10)

      TextField("Escribe un mensaje", text: $vm.draft, axis: .vertical)
        .lineLimit(1...5)
        .padding(.horizontal, 14)
        .padding(.vertical, 9)
        .background(VinctusTokens.Color.surface2, in: RoundedRectangle(cornerRadius: 20, style: .continuous))

      if hasContent {
        Button { send() } label: {
          Image(systemName: "arrow.up")
            .font(.system(size: 17, weight: .bold))
            .foregroundStyle(.black)
            .frame(width: 38, height: 38)
            .background(vm.canSend ? VinctusTokens.Color.accent : VinctusTokens.Color.textMuted, in: Circle())
        }
        .buttonStyle(.plain)
        .disabled(!vm.canSend || voice.isRequestingPermission)
        .accessibilityLabel("Enviar")
        .transition(.scale.combined(with: .opacity))
      } else {
        Button { Task { await voice.start() } } label: {
          Image(systemName: "mic")
            .font(.system(size: 21))
            .foregroundStyle(VinctusTokens.Color.textPrimary)
            .frame(width: 38, height: 38)
            .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Grabar nota de voz")
        .disabled(vm.isSending || vm.isPreparingMedia || voice.isRequestingPermission || vm.attachments.count >= 10)
        .transition(.scale.combined(with: .opacity))
      }
    }
    .animation(.snappy(duration: 0.2), value: hasContent)
    .padding(.horizontal, VinctusTokens.Spacing.sm)
    .padding(.vertical, 8)
    .background(VinctusTokens.Color.background)
    .overlay(alignment: .top) {
      Rectangle()
        .fill(VinctusTokens.Color.border.opacity(0.5))
        .frame(height: 0.5)
    }
  }

  /// While recording, a pill with a pulsing dot, the timer, cancel and finish.
  private var recordingBar: some View {
    HStack(spacing: 12) {
      Image(systemName: "circle.fill")
        .font(.system(size: 10))
        .foregroundStyle(.red)
        .symbolEffect(.pulse)
        .accessibilityHidden(true)
      Text("Grabando \(voice.seconds / 60):\(String(format: "%02d", voice.seconds % 60)) / 5:00")
        .font(.subheadline.monospacedDigit())
        .foregroundStyle(VinctusTokens.Color.textPrimary)
      Spacer()
      Button { voice.cancel() } label: {
        Image(systemName: "xmark")
          .font(.system(size: 15, weight: .semibold))
          .foregroundStyle(VinctusTokens.Color.textSecondary)
          .frame(width: 34, height: 34)
          .contentShape(Circle())
      }
      .buttonStyle(.plain)
      .accessibilityLabel("Cancelar")
      Button { voice.finish() } label: {
        Image(systemName: "checkmark")
          .font(.system(size: 15, weight: .bold))
          .foregroundStyle(.black)
          .frame(width: 34, height: 34)
          .background(VinctusTokens.Color.accent, in: Circle())
      }
      .buttonStyle(.plain)
      .accessibilityLabel("Terminar")
    }
    .padding(.leading, 16)
    .padding(.trailing, 4)
    .padding(.vertical, 4)
    .background(VinctusTokens.Color.surface2, in: Capsule())
    .padding(.horizontal, VinctusTokens.Spacing.sm)
    .padding(.vertical, 8)
  }

  private func send() {
    UIImpactFeedbackGenerator(style: .light).impactOccurred()
    vm.send()
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

/// "Hoy", "Ayer" or the date between days of messages.
private struct ChatDaySeparator: View {
  let date: Date

  var body: some View {
    Text(ChatMessageRuns.dayLabel(date))
      .font(.caption.weight(.medium))
      .foregroundStyle(VinctusTokens.Color.textSecondary)
      .padding(.horizontal, 12)
      .padding(.vertical, 5)
      .background(VinctusTokens.Color.surface, in: Capsule())
      .frame(maxWidth: .infinity)
      .padding(.vertical, 14)
      .accessibilityAddTraits(.isHeader)
  }
}

/// Mine in the brand gold, others in dark gray. Inside a run the corners on the sender's side
/// tighten and only the last bubble shows the time; group chats name the sender at the start of
/// a run and show their avatar next to its last bubble (like the web's MessageThread).
private struct MessageBubble: View {
  let message: ChatMessage
  let isMine: Bool
  let isGroup: Bool
  let run: ChatMessageRun

  private var senderName: String { message.senderName ?? "Usuario" }

  var body: some View {
    HStack(alignment: .bottom, spacing: 8) {
      if isMine { Spacer(minLength: 56) }
      if isGroup, !isMine {
        Group {
          if run.joinsNext {
            SwiftUI.Color.clear
          } else {
            AvatarView(name: senderName, photoURLString: nil, size: 28)
          }
        }
        .frame(width: 28, height: 28)
        .padding(.bottom, run.joinsNext ? 0 : 18)
      }
      VStack(alignment: isMine ? .trailing : .leading, spacing: 3) {
        if isGroup, !isMine, !run.joinsPrevious {
          Text(senderName)
            .font(.caption.weight(.semibold))
            .foregroundStyle(VinctusTokens.Color.textSecondary)
            .padding(.leading, 12)
        }
        ForEach(message.attachments) { attachment in
          ChatAttachmentView(attachment: attachment)
        }
        if !message.text.isEmpty || (message.hasAttachments && message.attachments.isEmpty) {
          Text(bubbleText)
            .foregroundStyle(isMine ? SwiftUI.Color.black : VinctusTokens.Color.textPrimary)
            .italic(message.text.isEmpty)
            .padding(.horizontal, 14)
            .padding(.vertical, 9)
            .background(isMine ? VinctusTokens.Color.accent : VinctusTokens.Color.surface2, in: bubbleShape)
        }
        if !run.joinsNext {
          Text(message.createdAt, style: .time)
            .font(.caption2)
            .foregroundStyle(VinctusTokens.Color.textMuted)
            .padding(.horizontal, 6)
        }
      }
      if !isMine { Spacer(minLength: 56) }
    }
  }

  private var bubbleShape: UnevenRoundedRectangle {
    let round: CGFloat = 20
    let tight: CGFloat = 6
    return UnevenRoundedRectangle(
      topLeadingRadius: !isMine && run.joinsPrevious ? tight : round,
      bottomLeadingRadius: !isMine && run.joinsNext ? tight : round,
      bottomTrailingRadius: isMine && run.joinsNext ? tight : round,
      topTrailingRadius: isMine && run.joinsPrevious ? tight : round,
      style: .continuous
    )
  }

  private var bubbleText: String {
    if !message.text.isEmpty { return message.text }
    return message.hasAttachments ? "Adjunto no disponible" : ""
  }
}

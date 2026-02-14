import SwiftUI

struct FeedDirectThreadView: View {
  @Environment(\.dismiss) private var dismiss
  @StateObject private var vm: FeedDirectThreadViewModel

  let participant: ChatPublicUser

  init(
    chatRepo: any ChatRepo,
    route: FeedDirectThreadRoute,
    currentUserID: String,
    currentUserName: String
  ) {
    participant = route.participant
    _vm = StateObject(
      wrappedValue: FeedDirectThreadViewModel(
        chatRepo: chatRepo,
        conversationID: route.conversationID,
        currentUID: currentUserID,
        currentUserName: currentUserName
      )
    )
  }

  var body: some View {
    VStack(spacing: 0) {
      header

      Divider()
        .background(VinctusTokens.Color.border.opacity(0.45))

      if vm.isLoading, vm.messages.isEmpty {
        VStack(spacing: 12) {
          ProgressView()
            .tint(VinctusTokens.Color.accent)
          Text("Cargando mensajes...")
            .font(.footnote)
            .foregroundStyle(VinctusTokens.Color.textMuted)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
      } else {
        messagesList
      }
    }
    .safeAreaInset(edge: .bottom) {
      composer
    }
    .background(VinctusTokens.Color.background)
    .toolbar(.hidden, for: .navigationBar)
    .task {
      vm.startListening()
    }
    .onDisappear {
      vm.stopListening()
    }
  }

  private var header: some View {
    HStack(spacing: 12) {
      Button {
        dismiss()
      } label: {
        Circle()
          .fill(VinctusTokens.Color.surface2)
          .frame(width: 42, height: 42)
          .overlay(
            Image(systemName: "chevron.left")
              .font(.headline.weight(.semibold))
              .foregroundStyle(VinctusTokens.Color.textPrimary)
          )
      }
      .buttonStyle(.plain)

      VAvatarView(
        name: participant.displayName,
        photoURLString: participant.photoURL,
        size: 34,
        ringColor: VinctusTokens.Color.border.opacity(0.5)
      )

      VStack(alignment: .leading, spacing: 1) {
        Text(participant.displayName)
          .font(.headline)
          .foregroundStyle(VinctusTokens.Color.textPrimary)
          .lineLimit(1)
        Text("Chat privado")
          .font(.caption)
          .foregroundStyle(VinctusTokens.Color.textMuted)
      }

      Spacer(minLength: 0)
    }
    .padding(.horizontal, 16)
    .padding(.top, 8)
    .padding(.bottom, 10)
    .background(VinctusTokens.Color.background)
  }

  private var messagesList: some View {
    ScrollViewReader { proxy in
      ScrollView {
        LazyVStack(alignment: .leading, spacing: 10) {
          ForEach(vm.messages) { message in
            FeedDirectMessageBubble(
              message: message,
              isMine: vm.isMine(message)
            )
            .id(message.id)
          }
        }
        .padding(.horizontal, 14)
        .padding(.top, 12)
        .padding(.bottom, 20)
      }
      .scrollDismissesKeyboard(.interactively)
      .onAppear {
        scrollToBottom(with: proxy, animated: false)
      }
      .onChange(of: vm.messages.last?.id) { _, _ in
        scrollToBottom(with: proxy, animated: true)
      }
    }
  }

  private var composer: some View {
    VStack(spacing: 8) {
      if let errorMessage = vm.errorMessage {
        Text(errorMessage)
          .font(.caption)
          .foregroundStyle(VinctusTokens.Color.accent)
          .frame(maxWidth: .infinity, alignment: .leading)
      }

      HStack(alignment: .bottom, spacing: 10) {
        TextField("Escribe un mensaje...", text: $vm.draftMessage, axis: .vertical)
          .lineLimit(1...4)
          .textInputAutocapitalization(.sentences)
          .autocorrectionDisabled(false)
          .padding(.horizontal, 12)
          .padding(.vertical, 10)
          .background(VinctusTokens.Color.surface)
          .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
          .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
              .stroke(VinctusTokens.Color.border.opacity(0.45), lineWidth: 1)
          )

        Button {
          Task {
            await vm.sendMessage()
          }
        } label: {
          Image(systemName: vm.isSending ? "arrow.up.circle.fill" : "paperplane.fill")
            .font(.system(size: 17, weight: .semibold))
            .foregroundStyle(.black)
            .frame(width: 42, height: 42)
            .background(canSendMessage ? VinctusTokens.Color.accent : VinctusTokens.Color.surface2)
            .clipShape(Circle())
        }
        .buttonStyle(.plain)
        .disabled(!canSendMessage)
      }
    }
    .padding(.horizontal, 12)
    .padding(.top, 8)
    .padding(.bottom, 10)
    .background(VinctusTokens.Color.background.opacity(0.98))
  }

  private var canSendMessage: Bool {
    let trimmed = vm.draftMessage.trimmingCharacters(in: .whitespacesAndNewlines)
    return !trimmed.isEmpty && !vm.isSending
  }

  private func scrollToBottom(with proxy: ScrollViewProxy, animated: Bool) {
    guard let lastID = vm.messages.last?.id else { return }
    if animated {
      withAnimation(.easeOut(duration: 0.2)) {
        proxy.scrollTo(lastID, anchor: .bottom)
      }
    } else {
      proxy.scrollTo(lastID, anchor: .bottom)
    }
  }
}

struct FeedDirectConversationCard: View {
  let conversation: DirectConversationSummary
  let participant: ChatPublicUser
  let currentUID: String?

  var body: some View {
    VCard {
      HStack(spacing: 12) {
        VAvatarView(
          name: participant.displayName,
          photoURLString: participant.photoURL,
          size: 44,
          ringColor: VinctusTokens.Color.border.opacity(0.5)
        )

        VStack(alignment: .leading, spacing: 4) {
          Text(participant.displayName)
            .font(.headline)
            .foregroundStyle(VinctusTokens.Color.textPrimary)
            .lineLimit(1)

          Text(previewText)
            .font(.subheadline)
            .foregroundStyle(VinctusTokens.Color.textMuted)
            .lineLimit(1)
        }

        Spacer(minLength: 0)

        VStack(alignment: .trailing, spacing: 6) {
          Text(FeedDirectDateFormatter.relative(date: conversation.lastMessageCreatedAt ?? conversation.updatedAt))
            .font(.caption)
            .foregroundStyle(VinctusTokens.Color.textMuted)
            .lineLimit(1)

          Image(systemName: "chevron.right")
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(VinctusTokens.Color.textMuted.opacity(0.85))
        }
      }
    }
  }

  private var previewText: String {
    let base = conversation.lastMessageText.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !base.isEmpty else { return "Sin mensajes recientes" }

    if conversation.lastMessageSenderID == currentUID {
      return "Tu: \(base)"
    }
    return base
  }
}

struct FeedDirectPersonCard: View {
  let user: DiscoverUser
  let actionLabel: String

  var body: some View {
    VCard {
      HStack(spacing: 12) {
        VAvatarView(
          name: user.displayName,
          photoURLString: user.photoURL,
          size: 42,
          ringColor: VinctusTokens.Color.border.opacity(0.5)
        )

        VStack(alignment: .leading, spacing: 3) {
          Text(user.displayName)
            .font(.headline)
            .foregroundStyle(VinctusTokens.Color.textPrimary)
            .lineLimit(1)

          Text(user.accountVisibility == .private ? "Perfil privado" : "Perfil publico")
            .font(.caption)
            .foregroundStyle(VinctusTokens.Color.textMuted)
            .lineLimit(1)
        }

        Spacer(minLength: 0)

        Text(actionLabel)
          .font(.caption.weight(.semibold))
          .foregroundStyle(VinctusTokens.Color.accent)
          .padding(.horizontal, 10)
          .padding(.vertical, 6)
          .overlay(
            Capsule()
              .stroke(VinctusTokens.Color.border.opacity(0.6), lineWidth: 1)
          )
      }
    }
  }
}

private struct FeedDirectMessageBubble: View {
  let message: DirectMessage
  let isMine: Bool

  var body: some View {
    VStack(alignment: isMine ? .trailing : .leading, spacing: 4) {
      HStack {
        if isMine { Spacer(minLength: 34) }

        VStack(alignment: .leading, spacing: 4) {
          Text(message.text)
            .font(.subheadline)
            .foregroundStyle(isMine ? SwiftUI.Color.black : VinctusTokens.Color.textPrimary)
            .multilineTextAlignment(.leading)

          Text(FeedDirectDateFormatter.clock(date: message.createdAt))
            .font(.caption2)
            .foregroundStyle(isMine ? SwiftUI.Color.black.opacity(0.72) : VinctusTokens.Color.textMuted)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 9)
        .background(isMine ? VinctusTokens.Color.accent : VinctusTokens.Color.surface)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(
          RoundedRectangle(cornerRadius: 14, style: .continuous)
            .stroke(VinctusTokens.Color.border.opacity(isMine ? 0.0 : 0.52), lineWidth: 1)
        )

        if !isMine { Spacer(minLength: 34) }
      }
    }
  }
}

private enum FeedDirectDateFormatter {
  private static let relativeFormatter: RelativeDateTimeFormatter = {
    let formatter = RelativeDateTimeFormatter()
    formatter.unitsStyle = .short
    return formatter
  }()

  private static let timeFormatter: DateFormatter = {
    let formatter = DateFormatter()
    formatter.locale = Locale.current
    formatter.timeStyle = .short
    formatter.dateStyle = .none
    return formatter
  }()

  static func relative(date: Date) -> String {
    let text = relativeFormatter.localizedString(for: date, relativeTo: Date())
    return text.capitalized
  }

  static func clock(date: Date) -> String {
    timeFormatter.string(from: date)
  }
}

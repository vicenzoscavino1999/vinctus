import SwiftUI
import UIKit

// MARK: - Chat

@MainActor
final class AIChatViewModel: ObservableObject {
  @Published private(set) var messages: [AIChatMessage] = []
  @Published var draft = ""
  @Published private(set) var isSending = false
  @Published var errorMessage: String?

  private let repo: AIRepo
  private var sessionGeneration = 0

  init(repo: AIRepo) {
    self.repo = repo
  }

  var trimmedDraftLength: Int {
    draft.trimmingCharacters(in: .whitespacesAndNewlines).count
  }

  var isDraftTooLong: Bool {
    trimmedDraftLength > FirebaseAIRepo.maxMessageLength
  }

  var canSend: Bool {
    !isSending && trimmedDraftLength > 0 && !isDraftTooLong
  }

  func reset() {
    sessionGeneration += 1
    messages = []
    draft = ""
    errorMessage = nil
    isSending = false
  }

  func send() {
    guard canSend else { return }
    Task { await sendNow() }
  }

  func sendNow() async {
    let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
    guard canSend else { return }
    let generation = sessionGeneration
    let previous = messages
    messages.append(AIChatMessage(role: "user", parts: [.init(text: text)]))
    draft = ""
    errorMessage = nil
    isSending = true

    do {
      let updated = try await repo.sendChatMessage(text, history: previous)
      guard generation == sessionGeneration else { return }
      messages = updated
    } catch {
      guard generation == sessionGeneration else { return }
      messages = previous
      if draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
        draft = text
      }
      errorMessage = error.localizedDescription
    }
    if generation == sessionGeneration {
      isSending = false
    }
  }
}

/// Chat con IA, like the web's: an empty conversation with suggestions, the person's messages as
/// gold bubbles, the assistant's replies as text with Copiar and Denunciar, and one rounded
/// composer at the bottom.
struct AIChatView: View {
  @EnvironmentObject private var authVM: AuthViewModel
  @StateObject private var vm: AIChatViewModel
  @State private var didRunDemo = false

  /// Starting points for an empty conversation; they fill the field, they don't send.
  static let suggestions = [
    "Explícame un tema difícil en palabras simples",
    "Ideas para un proyecto de fin de semana",
    "Crea un grupo sobre astronomía",
    "Recomiéndame libros de ciencia ficción",
  ]

  init(repo: AIRepo) {
    _vm = StateObject(wrappedValue: AIChatViewModel(repo: repo))
  }

  var body: some View {
    AIConsentGate(source: .aiChat) {
      chat
    }
    .background(VinctusTokens.Color.background)
    .navigationTitle("Chat con IA")
    .navigationBarTitleDisplayMode(.inline)
    .toolbar { resetToolbar }
    .onChange(of: authVM.currentUserID) { _, _ in
      vm.reset()
    }
  }

  @ToolbarContentBuilder
  private var resetToolbar: some ToolbarContent {
    if !vm.messages.isEmpty {
      ToolbarItem(placement: .topBarTrailing) {
        Button {
          vm.reset()
        } label: {
          Label("Nueva conversación", systemImage: "arrow.counterclockwise")
        }
        .disabled(vm.isSending)
      }
    }
  }

  private var chat: some View {
    VStack(spacing: 0) {
      conversation
      statusLines
      composer
    }
    .onAppear(perform: runDemoQuestion)
  }

  // MARK: Conversation

  private var conversation: some View {
    ScrollViewReader { proxy in
      ScrollView {
        LazyVStack(alignment: .leading, spacing: 22) {
          if vm.messages.isEmpty {
            emptyState
          }
          ForEach(vm.messages) { message in
            AIChatRow(message: message)
              .id(message.id)
          }
          if vm.isSending {
            thinking
              .id("typing")
          }
        }
        .padding(VinctusTokens.Spacing.lg)
      }
      .scrollDismissesKeyboard(.interactively)
      .onChange(of: vm.messages.count) { _, _ in
        withAnimation {
          if vm.isSending {
            proxy.scrollTo("typing")
          } else if let lastID = vm.messages.last?.id {
            proxy.scrollTo(lastID)
          }
        }
      }
    }
  }

  private var emptyState: some View {
    VStack(spacing: 10) {
      AIAssistantAvatar(size: 56)
      Text("¿En qué te ayudo hoy?")
        .font(VinctusTokens.Typography.serif(26))
        .foregroundStyle(VinctusTokens.Color.textPrimary)
        .padding(.top, 6)
      Text("Pregúntale lo que quieras al asistente de Vinctus. También puede crear un grupo por ti.")
        .font(.subheadline)
        .foregroundStyle(VinctusTokens.Color.textMuted)
        .multilineTextAlignment(.center)
      VStack(spacing: 8) {
        ForEach(Self.suggestions, id: \.self) { suggestion in
          AISuggestionChip(text: suggestion) {
            vm.draft = suggestion
          }
        }
      }
      .padding(.top, 14)
    }
    .frame(maxWidth: .infinity)
    .padding(.top, 24)
  }

  private var thinking: some View {
    HStack(spacing: 10) {
      AIAssistantAvatar()
      ProgressView()
        .controlSize(.small)
      Text("Pensando...")
        .font(.subheadline)
        .foregroundStyle(VinctusTokens.Color.textMuted)
    }
  }

  // MARK: Composer

  @ViewBuilder
  private var statusLines: some View {
    if let error = vm.errorMessage {
      Text(error)
        .font(.footnote)
        .foregroundStyle(.red)
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, VinctusTokens.Spacing.lg)
        .padding(.top, VinctusTokens.Spacing.xs)
    }
    if vm.trimmedDraftLength > FirebaseAIRepo.maxMessageLength - 200 {
      Text("\(vm.trimmedDraftLength)/\(FirebaseAIRepo.maxMessageLength)")
        .font(.caption2)
        .foregroundStyle(vm.isDraftTooLong ? .red : VinctusTokens.Color.textMuted)
        .frame(maxWidth: .infinity, alignment: .trailing)
        .padding(.horizontal, VinctusTokens.Spacing.lg)
        .padding(.top, VinctusTokens.Spacing.xs)
    }
  }

  private var composer: some View {
    HStack(alignment: .bottom, spacing: VinctusTokens.Spacing.sm) {
      TextField("Escribe un mensaje", text: $vm.draft, axis: .vertical)
        .lineLimit(1...5)
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(VinctusTokens.Color.surface2, in: RoundedRectangle(cornerRadius: 22, style: .continuous))

      Button {
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        vm.send()
      } label: {
        Image(systemName: "arrow.up")
          .font(.system(size: 17, weight: .bold))
          .foregroundStyle(.black)
          .frame(width: 40, height: 40)
          .background(vm.canSend ? VinctusTokens.Color.accent : VinctusTokens.Color.textMuted, in: Circle())
      }
      .buttonStyle(.plain)
      .disabled(!vm.canSend)
      .accessibilityLabel("Enviar")
    }
    .padding(.horizontal, VinctusTokens.Spacing.md)
    .padding(.vertical, 10)
    .background(VinctusTokens.Color.background)
    .overlay(alignment: .top) {
      Rectangle()
        .fill(VinctusTokens.Color.border.opacity(0.5))
        .frame(height: 0.5)
    }
  }

  /// Screenshot builds ask a sample question with `-VinctusAIAsk "<pregunta>"`.
  private func runDemoQuestion() {
    guard !didRunDemo, let question = AppRepos.demoArgument("-VinctusAIAsk") else { return }
    didRunDemo = true
    vm.draft = question
    vm.send()
  }
}

/// One message: the person's in a gold bubble at the right, the assistant's as text with its
/// actions (Ver grupo, Copiar, Denunciar).
private struct AIChatRow: View {
  let message: AIChatMessage

  var body: some View {
    if message.isUser {
      userBubble
    } else {
      assistantReply
    }
  }

  private var userBubble: some View {
    HStack {
      Spacer(minLength: 48)
      Text(message.text)
        .textSelection(.enabled)
        .foregroundStyle(.black)
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(
          VinctusTokens.Color.accent,
          in: UnevenRoundedRectangle(
            topLeadingRadius: 20, bottomLeadingRadius: 20, bottomTrailingRadius: 6, topTrailingRadius: 20,
            style: .continuous
          )
        )
    }
  }

  private var assistantReply: some View {
    HStack(alignment: .top, spacing: 10) {
      AIAssistantAvatar()
      VStack(alignment: .leading, spacing: 10) {
        Text(message.text)
          .textSelection(.enabled)
          .foregroundStyle(VinctusTokens.Color.textPrimary)
          .lineSpacing(3)
          .frame(maxWidth: .infinity, alignment: .leading)
        if let groupID = message.groupID {
          NavigationLink {
            GroupView(repo: AppRepos.groups(), groupID: groupID)
          } label: {
            Label("Ver grupo", systemImage: "person.3")
              .font(.caption.weight(.semibold))
              .foregroundStyle(VinctusTokens.Color.accent)
              .padding(.horizontal, 12)
              .padding(.vertical, 7)
              .background(VinctusTokens.Color.accent.opacity(0.15), in: Capsule())
          }
          .buttonStyle(.plain)
        }
        actions
      }
      .padding(.top, 4)
    }
  }

  private var actions: some View {
    HStack(spacing: 18) {
      Button {
        UIPasteboard.general.string = message.text
      } label: {
        Image(systemName: "doc.on.doc")
      }
      .accessibilityLabel("Copiar respuesta")
      AIReportButton(target: .aiResponse(contextID: "chat", excerpt: message.text))
    }
    .font(.subheadline)
    .foregroundStyle(VinctusTokens.Color.textMuted)
    .buttonStyle(.borderless)
  }
}

/// Lets people flag an offensive or harmful AI reply; it reaches the moderation queue like any
/// other report.
struct AIReportButton: View {
  let target: ReportTarget
  /// Shows "Denunciar" next to the flag (the Arena's result); icon only in the chat.
  var showsTitle = false

  @EnvironmentObject private var blockedUsers: BlockedUsersStore
  @State private var isShowingReport = false

  var body: some View {
    Button {
      isShowingReport = true
    } label: {
      if showsTitle {
        Label("Denunciar", systemImage: "flag")
      } else {
        Image(systemName: "flag")
      }
    }
    .buttonStyle(.borderless)
    .accessibilityLabel("Denunciar respuesta")
    .sheet(isPresented: $isShowingReport) {
      ReportSheet(target: target, repo: blockedUsers.repo)
    }
  }
}

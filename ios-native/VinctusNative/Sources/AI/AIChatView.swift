import SwiftUI

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

struct AIChatView: View {
  @EnvironmentObject private var authVM: AuthViewModel
  @StateObject private var vm: AIChatViewModel

  init(repo: AIRepo) {
    _vm = StateObject(wrappedValue: AIChatViewModel(repo: repo))
  }

  var body: some View {
    AIConsentGate(source: .aiChat) {
      VStack(spacing: 0) {
        ScrollViewReader { proxy in
          ScrollView {
            LazyVStack(alignment: .leading, spacing: VinctusTokens.Spacing.sm) {
              if vm.messages.isEmpty {
                Text("Escribe una pregunta para empezar. Las respuestas las genera una IA y pueden contener errores.")
                  .font(.footnote)
                  .foregroundStyle(VinctusTokens.Color.textMuted)
                  .padding(.top, VinctusTokens.Spacing.lg)
              }

              ForEach(vm.messages) { message in
                AIChatBubble(message: message)
                  .id(message.id)
              }

              if vm.isSending {
                HStack(spacing: 8) {
                  ProgressView()
                  Text("Pensando...")
                    .font(.footnote)
                    .foregroundStyle(VinctusTokens.Color.textMuted)
                }
                .id("typing")
              }
            }
            .padding(VinctusTokens.Spacing.lg)
          }
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

        if let error = vm.errorMessage {
          Text(error)
            .font(.footnote)
            .foregroundStyle(.red)
            .padding(.horizontal, VinctusTokens.Spacing.lg)
            .padding(.top, VinctusTokens.Spacing.xs)
        }

        if vm.trimmedDraftLength > FirebaseAIRepo.maxMessageLength - 200 {
          HStack {
            Spacer()
            Text("\(vm.trimmedDraftLength)/\(FirebaseAIRepo.maxMessageLength)")
              .font(.caption2)
              .foregroundStyle(vm.isDraftTooLong ? .red : VinctusTokens.Color.textMuted)
          }
          .padding(.horizontal, VinctusTokens.Spacing.lg)
          .padding(.top, VinctusTokens.Spacing.xs)
        }

        HStack(alignment: .bottom, spacing: VinctusTokens.Spacing.sm) {
          TextField("Escribe un mensaje", text: $vm.draft, axis: .vertical)
            .lineLimit(1...5)
            .padding(10)
            .background(VinctusTokens.Color.surface2)
            .clipShape(RoundedRectangle(cornerRadius: VinctusTokens.Radius.sm, style: .continuous))

          Button {
            vm.send()
          } label: {
            Image(systemName: "arrow.up.circle.fill")
              .font(.title)
          }
          .disabled(!vm.canSend)
          .accessibilityLabel("Enviar")
        }
        .padding(VinctusTokens.Spacing.md)
        .background(VinctusTokens.Color.surface)
      }
    }
    .navigationTitle("Chat con IA")
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
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
    .onChange(of: authVM.currentUserID) { _, _ in
      vm.reset()
    }
  }
}

private struct AIChatBubble: View {
  let message: AIChatMessage

  var body: some View {
    HStack {
      if message.isUser { Spacer(minLength: 40) }
      VStack(alignment: .leading, spacing: 4) {
        Text(message.text)
          .textSelection(.enabled)
          .padding(12)
          .background(message.isUser ? VinctusTokens.Color.accent.opacity(0.22) : VinctusTokens.Color.surface2)
          .clipShape(RoundedRectangle(cornerRadius: VinctusTokens.Radius.md, style: .continuous))

        if !message.isUser {
          HStack(spacing: VinctusTokens.Spacing.md) {
            if let groupID = message.groupID {
              NavigationLink {
                GroupView(repo: AppRepos.groups(), groupID: groupID)
              } label: {
                Label("Ver grupo", systemImage: "person.3")
                  .font(.caption.weight(.semibold))
                  .foregroundStyle(VinctusTokens.Color.accent)
              }
            }
            AIReportButton(target: .aiResponse(contextID: "chat", excerpt: message.text))
          }
        }
      }
      if !message.isUser { Spacer(minLength: 40) }
    }
  }
}

/// Lets people flag an offensive or harmful AI reply; it reaches the moderation queue like any
/// other report.
struct AIReportButton: View {
  let target: ReportTarget

  @EnvironmentObject private var blockedUsers: BlockedUsersStore
  @State private var isShowingReport = false

  var body: some View {
    Button {
      isShowingReport = true
    } label: {
      Label("Denunciar respuesta", systemImage: "flag")
        .font(.caption)
        .foregroundStyle(VinctusTokens.Color.textMuted)
    }
    .buttonStyle(.borderless)
    .sheet(isPresented: $isShowingReport) {
      ReportSheet(target: target, repo: blockedUsers.repo)
    }
  }
}

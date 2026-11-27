import SwiftUI

// MARK: - Hub

/// "IA Vinctus": Chat con IA and Arena IA as two large cards, like the web's Chat · Arena.
struct AIHubView: View {
  let repo: AIRepo

  /// "chat" or "arena" when opened straight into a mode (screenshot builds).
  @State private var openedMode: String?

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 14) {
        header
        NavigationLink {
          AIChatView(repo: repo)
        } label: {
          AIModeCard(
            systemImage: "bubble.left.and.text.bubble.right",
            title: "Chat con IA",
            subtitle: "Pregúntale lo que quieras al asistente de Vinctus. También puede crear un grupo por ti."
          )
        }
        .buttonStyle(.plain)

        NavigationLink {
          ArenaView(repo: repo)
        } label: {
          AIModeCard(
            systemImage: "person.2.wave.2",
            title: "Arena IA",
            subtitle: "Dos personalidades de IA debaten un tema y un juez da el veredicto."
          )
        }
        .buttonStyle(.plain)

        Text("Las respuestas las genera una IA y pueden contener errores.")
          .font(.footnote)
          .foregroundStyle(VinctusTokens.Color.textMuted)
          .padding(.top, 6)
      }
      .padding(VinctusTokens.Spacing.lg)
    }
    .background(VinctusTokens.Color.background)
    .navigationTitle("IA")
    .navigationBarTitleDisplayMode(.inline)
    .navigationDestination(item: $openedMode) { (mode: String) in
      if mode == "arena" {
        ArenaView(repo: repo)
      } else {
        AIChatView(repo: repo)
      }
    }
    .onAppear {
      if openedMode == nil, let mode = AppRepos.demoArgument("-VinctusOpenAI"), mode == "chat" || mode == "arena" {
        openedMode = mode
      }
    }
  }

  private var header: some View {
    VStack(alignment: .leading, spacing: 6) {
      AIAssistantAvatar(size: 44)
      Text("IA Vinctus")
        .font(VinctusTokens.Typography.serif(32))
        .foregroundStyle(VinctusTokens.Color.textPrimary)
        .padding(.top, 6)
      Text("Pregunta, aprende y crea.")
        .font(.subheadline)
        .foregroundStyle(VinctusTokens.Color.textMuted)
    }
    .padding(.bottom, 10)
  }
}

private struct AIModeCard: View {
  let systemImage: String
  let title: String
  let subtitle: String

  var body: some View {
    HStack(alignment: .top, spacing: 14) {
      Image(systemName: systemImage)
        .font(.system(size: 19, weight: .medium))
        .foregroundStyle(VinctusTokens.Color.accent)
        .frame(width: 46, height: 46)
        .background(VinctusTokens.Color.accent.opacity(0.12), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
      VStack(alignment: .leading, spacing: 4) {
        Text(title)
          .font(.headline)
          .foregroundStyle(VinctusTokens.Color.textPrimary)
        Text(subtitle)
          .font(.subheadline)
          .foregroundStyle(VinctusTokens.Color.textMuted)
          .fixedSize(horizontal: false, vertical: true)
      }
      Spacer(minLength: 0)
      Image(systemName: "chevron.right")
        .font(.system(size: 13, weight: .semibold))
        .foregroundStyle(VinctusTokens.Color.textMuted)
        .padding(.top, 4)
    }
    .padding(16)
    .background(VinctusTokens.Color.surface, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    .overlay(
      RoundedRectangle(cornerRadius: 20, style: .continuous)
        .stroke(VinctusTokens.Color.border.opacity(0.7), lineWidth: 0.5)
    )
    .contentShape(Rectangle())
  }
}

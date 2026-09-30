import SwiftUI

// MARK: - Hub

struct AIHubView: View {
  let repo: AIRepo

  var body: some View {
    List {
      Section {
        NavigationLink(destination: AIChatView(repo: repo)) {
          Label {
            VStack(alignment: .leading, spacing: 2) {
              Text("Chat con IA")
              Text("Pregúntale lo que quieras al asistente de Vinctus.")
                .font(.footnote)
                .foregroundStyle(VinctusTokens.Color.textMuted)
            }
          } icon: {
            Image(systemName: "bubble.left.and.text.bubble.right")
          }
        }

        NavigationLink(destination: ArenaView(repo: repo)) {
          Label {
            VStack(alignment: .leading, spacing: 2) {
              Text("Arena IA")
              Text("Dos personalidades de IA debaten un tema y un juez da el veredicto.")
                .font(.footnote)
                .foregroundStyle(VinctusTokens.Color.textMuted)
            }
          } icon: {
            Image(systemName: "person.2.wave.2")
          }
        }
      } footer: {
        Text("Las respuestas las genera una IA y pueden contener errores.")
      }
    }
    .navigationTitle("IA")
  }
}

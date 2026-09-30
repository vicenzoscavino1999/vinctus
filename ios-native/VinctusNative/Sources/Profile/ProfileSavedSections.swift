import SwiftUI

// MARK: - Followed categories

struct ProfileCategoriesSection: View {
  @StateObject private var vm: FollowedCategoriesViewModel

  init(repo: ProfileContentRepo) {
    _vm = StateObject(wrappedValue: FollowedCategoriesViewModel(repo: repo))
  }

  var body: some View {
    ProfileSectionCard(title: "Categorías seguidas", icon: "square.grid.2x2") {
      Menu {
        ForEach(vm.notFollowed) { category in
          Button {
            Task { await vm.setFollowed(true, categoryID: category.id) }
          } label: {
            Label(category.title, systemImage: category.icon)
          }
        }
      } label: {
        Image(systemName: "plus.circle.fill")
          .foregroundStyle(VinctusTokens.Color.accent)
      }
      .disabled(vm.followsEverything)
      .accessibilityLabel("Seguir una categoría")
    } content: {
      if vm.isLoading {
        ProgressView()
      } else if let errorMessage = vm.errorMessage {
        ProfileSectionMessage(text: errorMessage, isError: true)
      } else if vm.followed.isEmpty {
        ProfileSectionMessage(text: "Aún no sigues categorías. Toca + para elegir las que te interesan.")
      } else {
        ForEach(vm.followed, id: \.self) { id in
          let category = InterestCategory.all.first { $0.id == id }
          HStack {
            Label(category?.title ?? id, systemImage: category?.icon ?? "tag")
              .font(.subheadline)
              .foregroundStyle(VinctusTokens.Color.textPrimary)
            Spacer()
            Button("Dejar") {
              Task { await vm.setFollowed(false, categoryID: id) }
            }
            .font(.caption.weight(.semibold))
            .foregroundStyle(VinctusTokens.Color.textMuted)
          }
          .padding(.vertical, 4)
        }
      }
    }
    .task { await vm.load() }
  }
}

// MARK: - Saved Arena debates

struct ProfileSavedDebatesSection: View {
  @StateObject private var vm: SavedDebatesViewModel

  init(repo: ProfileContentRepo) {
    _vm = StateObject(wrappedValue: SavedDebatesViewModel(repo: repo))
  }

  var body: some View {
    ProfileSectionCard(title: "Debates guardados", icon: "bookmark") {
      if vm.isLoading {
        ProgressView()
      } else if let errorMessage = vm.errorMessage {
        ProfileSectionMessage(text: errorMessage, isError: true)
      } else if vm.debates.isEmpty {
        ProfileSectionMessage(text: "Aún no tienes debates guardados. Desde Arena IA puedes guardarlos.")
      } else {
        ForEach(vm.debates) { debate in
          VStack(alignment: .leading, spacing: 6) {
            Text(debate.topic)
              .font(.subheadline.weight(.semibold))
              .foregroundStyle(VinctusTokens.Color.textPrimary)
            Text(subtitle(debate))
              .font(.caption)
              .foregroundStyle(VinctusTokens.Color.textMuted)
            if let summary = debate.summary {
              Text(summary)
                .font(.footnote)
                .foregroundStyle(VinctusTokens.Color.textMuted)
                .lineLimit(3)
            }
            HStack(spacing: VinctusTokens.Spacing.md) {
              NavigationLink("Ver debate") {
                SavedDebateView(debate: debate)
              }
              Button("Quitar", role: .destructive) {
                Task { await vm.remove(debate) }
              }
            }
            .font(.caption.weight(.semibold))
          }
          .padding(.vertical, 6)
          if debate.id != vm.debates.last?.id {
            Divider()
          }
        }
      }
    }
    .task { await vm.load() }
  }

  private func subtitle(_ debate: SavedDebate) -> String {
    let names = "\(SavedDebate.personaName(debate.personaA)) vs \(SavedDebate.personaName(debate.personaB))"
    guard let date = debate.createdAt else { return names }
    return "\(names) · \(date.formatted(date: .abbreviated, time: .omitted))"
  }
}

/// A saved debate with its turns, read from `arenaDebates/{id}/turns`.
private struct SavedDebateView: View {
  let debate: SavedDebate

  @StateObject private var vm: DebateTurnsViewModel

  init(debate: SavedDebate, aiRepo: AIRepo = AppRepos.ai()) {
    self.debate = debate
    _vm = StateObject(wrappedValue: DebateTurnsViewModel(debateID: debate.id, repo: aiRepo))
  }

  var body: some View {
    List {
      Section {
        Text(debate.topic)
          .font(.headline)
        Text("\(SavedDebate.personaName(debate.personaA)) vs \(SavedDebate.personaName(debate.personaB))")
          .foregroundStyle(VinctusTokens.Color.textMuted)
      }
      Section("Debate") {
        if vm.isLoading {
          ProgressView()
        } else if let errorMessage = vm.errorMessage {
          Text(errorMessage)
            .foregroundStyle(.red)
        } else {
          ForEach(vm.turns) { turn in
            VStack(alignment: .leading, spacing: 4) {
              Text(SavedDebate.personaName(turn.speaker == "A" ? debate.personaA : debate.personaB))
                .font(.caption.weight(.semibold))
                .foregroundStyle(turn.speaker == "A" ? VinctusTokens.Color.accent : VinctusTokens.Color.accentAlt)
              Text(turn.text)
                .textSelection(.enabled)
            }
            .padding(.vertical, 4)
          }
        }
      }
      if debate.summary != nil || debate.winner != nil {
        Section("Veredicto") {
          if let summary = debate.summary {
            Text(summary)
          }
          if let winner = debate.winner {
            Text("Ganador: \(winnerName(winner))")
              .font(.headline)
          }
        }
      }
    }
    .navigationTitle("Debate")
    .navigationBarTitleDisplayMode(.inline)
    .task { await vm.load() }
  }

  private func winnerName(_ winner: String) -> String {
    switch winner {
    case "A": return SavedDebate.personaName(debate.personaA)
    case "B": return SavedDebate.personaName(debate.personaB)
    default: return "Empate"
    }
  }
}

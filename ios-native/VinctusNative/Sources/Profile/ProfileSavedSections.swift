import SwiftUI

// MARK: - Followed categories

struct ProfileCategoriesSection: View {
  let repo: ProfileContentRepo

  @State private var followed: [String] = []
  @State private var isLoading = true
  @State private var errorMessage: String?

  var body: some View {
    ProfileSectionCard(title: "Categorías seguidas", icon: "square.grid.2x2") {
      Menu {
        ForEach(InterestCategory.all.filter { !followed.contains($0.id) }) { category in
          Button {
            set(true, category.id)
          } label: {
            Label(category.title, systemImage: category.icon)
          }
        }
      } label: {
        Image(systemName: "plus.circle.fill")
          .foregroundStyle(VinctusTokens.Color.accent)
      }
      .disabled(followed.count == InterestCategory.all.count)
      .accessibilityLabel("Seguir una categoría")
    } content: {
      if isLoading {
        ProgressView()
      } else if let errorMessage {
        ProfileSectionMessage(text: errorMessage, isError: true)
      } else if followed.isEmpty {
        ProfileSectionMessage(text: "Aún no sigues categorías. Toca + para elegir las que te interesan.")
      } else {
        ForEach(followed, id: \.self) { id in
          let category = InterestCategory.all.first { $0.id == id }
          HStack {
            Label(category?.title ?? id, systemImage: category?.icon ?? "tag")
              .font(.subheadline)
              .foregroundStyle(VinctusTokens.Color.textPrimary)
            Spacer()
            Button("Dejar") { set(false, id) }
              .font(.caption.weight(.semibold))
              .foregroundStyle(VinctusTokens.Color.textMuted)
          }
          .padding(.vertical, 4)
        }
      }
    }
    .task {
      do {
        followed = try await repo.fetchFollowedCategories()
      } catch {
        errorMessage = "No se pudieron cargar tus categorías."
      }
      isLoading = false
    }
  }

  private func set(_ follow: Bool, _ id: String) {
    let previous = followed
    followed = follow ? followed + [id] : followed.filter { $0 != id }
    Task {
      do {
        try await repo.setCategoryFollowed(follow, categoryID: id)
      } catch {
        followed = previous
        errorMessage = "No se pudo actualizar la categoría."
      }
    }
  }
}

// MARK: - Saved Arena debates

struct ProfileSavedDebatesSection: View {
  let repo: ProfileContentRepo

  @State private var debates: [SavedDebate] = []
  @State private var isLoading = true
  @State private var errorMessage: String?

  var body: some View {
    ProfileSectionCard(title: "Debates guardados", icon: "bookmark") {
      if isLoading {
        ProgressView()
      } else if let errorMessage {
        ProfileSectionMessage(text: errorMessage, isError: true)
      } else if debates.isEmpty {
        ProfileSectionMessage(text: "Aún no tienes debates guardados. Desde Arena IA puedes guardarlos.")
      } else {
        ForEach(debates) { debate in
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
              Button("Quitar", role: .destructive) { remove(debate) }
            }
            .font(.caption.weight(.semibold))
          }
          .padding(.vertical, 6)
          if debate.id != debates.last?.id {
            Divider()
          }
        }
      }
    }
    .task {
      do {
        debates = try await repo.fetchSavedDebates()
      } catch {
        errorMessage = "No se pudieron cargar tus debates guardados."
      }
      isLoading = false
    }
  }

  private func subtitle(_ debate: SavedDebate) -> String {
    let names = "\(SavedDebate.personaName(debate.personaA)) vs \(SavedDebate.personaName(debate.personaB))"
    guard let date = debate.createdAt else { return names }
    return "\(names) · \(date.formatted(date: .abbreviated, time: .omitted))"
  }

  private func remove(_ debate: SavedDebate) {
    let previous = debates
    debates.removeAll { $0.id == debate.id }
    Task {
      do {
        try await repo.removeSavedDebate(id: debate.id)
      } catch {
        debates = previous
        errorMessage = "No se pudo quitar el debate."
      }
    }
  }
}

/// A saved debate with its turns, read from `arenaDebates/{id}/turns`.
private struct SavedDebateView: View {
  let debate: SavedDebate
  var aiRepo: AIRepo = AppRepos.ai()

  @State private var turns: [ArenaTurn] = []
  @State private var isLoading = true
  @State private var errorMessage: String?

  var body: some View {
    List {
      Section {
        Text(debate.topic)
          .font(.headline)
        Text("\(SavedDebate.personaName(debate.personaA)) vs \(SavedDebate.personaName(debate.personaB))")
          .foregroundStyle(VinctusTokens.Color.textMuted)
      }
      Section("Debate") {
        if isLoading {
          ProgressView()
        } else if let errorMessage {
          Text(errorMessage)
            .foregroundStyle(.red)
        } else {
          ForEach(turns) { turn in
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
    .task {
      do {
        turns = try await aiRepo.fetchDebateTurns(debateID: debate.id)
      } catch {
        errorMessage = "No se pudo cargar el debate."
      }
      isLoading = false
    }
  }

  private func winnerName(_ winner: String) -> String {
    switch winner {
    case "A": return SavedDebate.personaName(debate.personaA)
    case "B": return SavedDebate.personaName(debate.personaB)
    default: return "Empate"
    }
  }
}

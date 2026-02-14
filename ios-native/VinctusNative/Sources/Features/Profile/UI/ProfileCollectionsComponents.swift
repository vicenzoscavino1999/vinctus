import SwiftUI

struct ProfileCollectionsContent: View {
  let profile: UserProfile

  @State private var categories: [FollowedCategory] = []
  @State private var savedDebates: [ProfileSavedDebate] = []
  @State private var selectedDebateTitle: String?

  var body: some View {
    VStack(alignment: .leading, spacing: 18) {
      VStack(alignment: .leading, spacing: 8) {
        Text("REPUTACION")
          .font(.caption2.weight(.semibold))
          .tracking(2.8)
          .foregroundStyle(VinctusTokens.Color.textMuted)

        HStack(spacing: 12) {
          ZStack(alignment: .leading) {
            Capsule()
              .fill(VinctusTokens.Color.surface2)
              .frame(height: 4)

            GeometryReader { proxy in
              Capsule()
                .fill(VinctusTokens.Color.accent)
                .frame(
                  width: proxy.size.width * min(max(Double(profile.reputation) / 100, 0), 1),
                  height: 4
                )
            }
          }
          .frame(height: 4)

          Text("\(profile.reputation)")
            .font(.title3.weight(.semibold))
            .foregroundStyle(VinctusTokens.Color.textMuted)
        }

        Text("Contribuye para aumentar tu reputacion")
          .font(.body)
          .foregroundStyle(VinctusTokens.Color.textMuted)
      }

      VStack(alignment: .leading, spacing: 8) {
        Text("CATEGORIAS SEGUIDAS")
          .font(.caption2.weight(.semibold))
          .tracking(2.8)
          .foregroundStyle(VinctusTokens.Color.textMuted)

        if categories.isEmpty {
          VCard {
            Text("Aun no sigues categorias.")
              .font(.footnote)
              .foregroundStyle(VinctusTokens.Color.textMuted)
          }
        } else {
          ForEach(categories) { category in
            HStack(spacing: 9) {
              Image(systemName: category.icon)
                .font(.footnote.weight(.semibold))
                .foregroundStyle(VinctusTokens.Color.accent)
              Text(category.title)
                .font(.title3)
                .foregroundStyle(VinctusTokens.Color.textPrimary)
                .lineLimit(1)

              Spacer()

              Button("DEJAR") {
                leaveCategory(category.id)
              }
              .buttonStyle(.plain)
              .font(.caption.weight(.semibold))
              .foregroundStyle(VinctusTokens.Color.textMuted)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 9)
            .background(VinctusTokens.Color.surface)
            .clipShape(Capsule())
            .overlay(
              Capsule()
                .stroke(VinctusTokens.Color.border.opacity(0.5), lineWidth: 1)
            )
          }
        }
      }

      VStack(alignment: .leading, spacing: 8) {
        Text("CONTACTO")
          .font(.caption2.weight(.semibold))
          .tracking(2.8)
          .foregroundStyle(VinctusTokens.Color.textMuted)

        HStack(spacing: 10) {
          Image(systemName: "envelope")
            .foregroundStyle(VinctusTokens.Color.textMuted)
          Text(profile.email ?? "Sin email")
            .font(.title3)
            .foregroundStyle(VinctusTokens.Color.textPrimary)
            .lineLimit(1)
        }
      }

      VStack(alignment: .leading, spacing: 8) {
        Text("DEBATES GUARDADOS")
          .font(.caption2.weight(.semibold))
          .tracking(2.7)
          .foregroundStyle(VinctusTokens.Color.textMuted)

        if savedDebates.isEmpty {
          VCard {
            Text("Aun no hay debates guardados.")
              .font(.footnote)
              .foregroundStyle(VinctusTokens.Color.textMuted)
          }
        } else {
          ForEach(savedDebates) { debate in
            VCard {
              VStack(alignment: .leading, spacing: 8) {
                Text(debate.title)
                  .font(VinctusTokens.Typography.sectionTitle(size: 26))
                  .foregroundStyle(VinctusTokens.Color.textPrimary)
                  .lineLimit(2)

                Text(debate.matchupLabel)
                  .font(.footnote)
                  .foregroundStyle(VinctusTokens.Color.textMuted)

                Text(debate.summary)
                  .font(.body)
                  .foregroundStyle(VinctusTokens.Color.textMuted)
                  .lineLimit(3)

                HStack(spacing: 10) {
                  Button("VER DEBATE") {
                    selectedDebateTitle = debate.title
                  }
                  .buttonStyle(.plain)
                  .font(.callout.weight(.semibold))
                  .foregroundStyle(VinctusTokens.Color.textPrimary)
                  .padding(.horizontal, 12)
                  .padding(.vertical, 7)
                  .overlay(
                    Capsule()
                      .stroke(VinctusTokens.Color.border.opacity(0.62), lineWidth: 1)
                  )

                  Button("QUITAR") {
                    removeSavedDebate(debate.id)
                  }
                  .buttonStyle(.plain)
                  .font(.callout.weight(.semibold))
                  .foregroundStyle(VinctusTokens.Color.textMuted)
                  .padding(.horizontal, 12)
                  .padding(.vertical, 7)
                  .overlay(
                    Capsule()
                      .stroke(VinctusTokens.Color.border.opacity(0.5), lineWidth: 1)
                  )
                }
              }
            }
          }
        }
      }
    }
    .task(id: profile.id) {
      loadCollections()
    }
    .alert("Debate", isPresented: isDebateAlertPresented) {
      Button("OK", role: .cancel) {}
    } message: {
      Text(selectedDebateTitle ?? "No disponible")
    }
  }

  private var isDebateAlertPresented: Binding<Bool> {
    Binding(
      get: { selectedDebateTitle != nil },
      set: { isPresented in
        if !isPresented {
          selectedDebateTitle = nil
        }
      }
    )
  }

  private func leaveCategory(_ categoryID: String) {
    categories.removeAll { $0.id == categoryID }
  }

  private func removeSavedDebate(_ debateID: String) {
    savedDebates.removeAll { $0.id == debateID }
  }

  private func loadCollections() {
    categories = seededCategories(from: profile)
    savedDebates = seededDebates(from: profile)
  }

  private func seededCategories(from profile: UserProfile) -> [FollowedCategory] {
    var result: [FollowedCategory] = []
    var seen = Set<String>()

    if let role = normalizedValue(profile.role) {
      let id = "role_\(role.lowercased())"
      if seen.insert(id).inserted {
        result.append(.init(id: id, icon: "briefcase", title: role.capitalized))
      }
    }

    if let location = normalizedValue(profile.location) {
      let city = location.split(separator: ",").first.map(String.init) ?? location
      let id = "location_\(city.lowercased())"
      if seen.insert(id).inserted {
        result.append(.init(id: id, icon: "location", title: city.capitalized))
      }
    }

    if let bio = normalizedValue(profile.bio) {
      let topic = inferredBioTopic(from: bio)
      let id = "bio_\(topic.title.lowercased())"
      if seen.insert(id).inserted {
        result.append(.init(id: id, icon: topic.icon, title: topic.title))
      }
    }

    return result
  }

  private func seededDebates(from profile: UserProfile) -> [ProfileSavedDebate] {
    guard let bio = normalizedValue(profile.bio), bio.count > 24 else { return [] }

    let title = bio.count > 56 ? "\(bio.prefix(56))..." : bio
    let summary = bio.count > 220 ? "\(bio.prefix(220))..." : bio
    let dateLabel = profile.updatedAt.formatted(date: .abbreviated, time: .omitted)

    return [
      ProfileSavedDebate(
        id: "bio_debate_\(profile.id)",
        title: title,
        matchupLabel: "\(profile.displayName) · \(dateLabel)",
        summary: summary
      )
    ]
  }

  private func normalizedValue(_ value: String?) -> String? {
    guard let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines), !trimmed.isEmpty else {
      return nil
    }
    return trimmed
  }

  private func inferredBioTopic(from bio: String) -> (icon: String, title: String) {
    let lower = bio.lowercased()
    if lower.contains("ciencia") || lower.contains("quant") || lower.contains("tech") {
      return ("atom", "Ciencia & Tecnologia")
    }
    if lower.contains("musica") || lower.contains("arte") {
      return ("music.note", "Arte & Cultura")
    }
    return ("sparkles", "Comunidad")
  }
}

private struct ProfileSavedDebate: Identifiable, Hashable {
  let id: String
  let title: String
  let matchupLabel: String
  let summary: String
}

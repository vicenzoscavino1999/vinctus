import SwiftUI

/// Discover's "Debates IA": the best sourced finished public debates of Arena.
@MainActor
final class DiscoverDebatesViewModel: ObservableObject {
  @Published private(set) var debates: [PublicDebate] = []
  @Published private(set) var errorMessage: String?

  static let maxAge: TimeInterval = 5 * 60

  private let repo: PublicDebatesRepo
  private var loadedAt: Date?

  init(repo: PublicDebatesRepo) {
    self.repo = repo
  }

  func refresh(force: Bool = false) async {
    if !force, let loadedAt, Date().timeIntervalSince(loadedAt) < Self.maxAge { return }
    do {
      debates = PublicDebate.curated(try await repo.fetchPublicDebates(limit: 80))
      errorMessage = nil
      loadedAt = Date()
    } catch {
      // Keep what is already shown; only an empty section offers a retry.
      if debates.isEmpty { errorMessage = "No se pudieron cargar los debates." }
    }
  }

  func reset() {
    debates = []
    errorMessage = nil
    loadedAt = nil
  }
}

/// "Debates IA": hidden while there are none, like on the web.
struct DiscoverDebatesSection: View {
  @ObservedObject var vm: DiscoverDebatesViewModel
  let onOpenArena: () -> Void
  let onOpen: (PublicDebate) -> Void

  var body: some View {
    if !vm.debates.isEmpty || vm.errorMessage != nil {
      VStack(alignment: .leading, spacing: VinctusTokens.Spacing.md) {
        HStack(alignment: .firstTextBaseline) {
          VStack(alignment: .leading, spacing: 2) {
            DiscoverSectionHeader(title: "Debates IA")
            Text("Dos perspectivas, con fuentes.")
              .font(.footnote)
              .foregroundStyle(VinctusTokens.Color.textMuted)
          }
          Spacer()
          Button(action: onOpenArena) {
            Text("Ir a Arena")
              .font(.subheadline.weight(.semibold))
              .foregroundStyle(VinctusTokens.Color.accent)
          }
          .buttonStyle(.borderless)
        }

        if let errorMessage = vm.errorMessage, vm.debates.isEmpty {
          VCard {
            VStack(alignment: .leading, spacing: 10) {
              Text(errorMessage)
                .font(.footnote)
                .foregroundStyle(VinctusTokens.Color.textMuted)
              VButton("Reintentar", variant: .secondary) {
                Task { await vm.refresh(force: true) }
              }
            }
          }
        } else {
          VStack(spacing: VinctusTokens.Spacing.md) {
            ForEach(vm.debates) { debate in
              Button {
                onOpen(debate)
              } label: {
                DiscoverDebateCard(debate: debate)
              }
              .buttonStyle(.plain)
            }
          }
        }
      }
    }
  }
}

struct DiscoverDebateCard: View {
  let debate: PublicDebate

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      (
        Text(SavedDebate.personaName(debate.personaA)).foregroundStyle(VinctusTokens.Color.accent)
          + Text("  vs  ").foregroundStyle(VinctusTokens.Color.textMuted)
          + Text(SavedDebate.personaName(debate.personaB)).foregroundStyle(VinctusTokens.Color.accent)
          + Text(dateLabel.map { "  ·  \($0)" } ?? "").foregroundStyle(VinctusTokens.Color.textMuted)
      )
      .font(.caption)
      .lineLimit(1)

      Text(debate.topic)
        .font(VinctusTokens.Typography.sectionTitle(size: 19))
        .foregroundStyle(VinctusTokens.Color.textPrimary)
        .lineLimit(2)
        .multilineTextAlignment(.leading)

      if let summary = debate.summary {
        Text(summary)
          .font(.footnote)
          .foregroundStyle(VinctusTokens.Color.textSecondary)
          .lineLimit(3)
          .multilineTextAlignment(.leading)
      }

      HStack(spacing: 6) {
        Text(Self.count(debate.sourceCount, "fuente", "fuentes"))
        Text("·")
        Text(Self.count(debate.likesCount, "me gusta", "me gusta"))
        ForEach(debate.sourceHosts, id: \.self) { host in
          Text(host)
            .font(.caption2)
            .padding(.horizontal, 7)
            .padding(.vertical, 3)
            .background(Capsule().fill(VinctusTokens.Color.surface2))
            .lineLimit(1)
        }
      }
      .font(.caption)
      .foregroundStyle(VinctusTokens.Color.textMuted)
      .padding(.top, 4)
    }
    .padding(16)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(VinctusTokens.Color.surface)
    .clipShape(RoundedRectangle(cornerRadius: VinctusTokens.Radius.lg, style: .continuous))
    .overlay(
      RoundedRectangle(cornerRadius: VinctusTokens.Radius.lg, style: .continuous)
        .stroke(VinctusTokens.Color.border.opacity(0.55), lineWidth: 1)
    )
    .accessibilityElement(children: .combine)
  }

  private var dateLabel: String? {
    debate.createdAt?.formatted(.dateTime.day().month(.abbreviated).locale(Locale(identifier: "es_ES")))
  }

  static func count(_ value: Int, _ singular: String, _ plural: String) -> String {
    "\(value) \(value == 1 ? singular : plural)"
  }
}

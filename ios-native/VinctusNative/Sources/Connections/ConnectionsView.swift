import SwiftUI

/// The Conexiones tab, like the web's ProjectsPage (`src/features/projects/pages/ProjectsPage.tsx`):
/// a header with "Publicar proyecto", the open collaborations and the upcoming encounters.
struct ConnectionsView: View {
  @EnvironmentObject private var authVM: AuthViewModel
  @EnvironmentObject private var blockedUsers: BlockedUsersStore
  @StateObject private var vm: ConnectionsViewModel
  private let repo: ConnectionsRepo

  @State private var isCreatingCollaboration = false
  @State private var isCreatingEncounter = false
  @State private var openedCollaboration: Collaboration?
  @State private var openedEncounter: Encounter?

  init(repo: ConnectionsRepo = AppRepos.connections()) {
    self.repo = repo
    _vm = StateObject(wrappedValue: ConnectionsViewModel(repo: repo))
  }

  private var uid: String? { authVM.currentUserID }

  private var visibleCollaborations: [Collaboration] {
    vm.collaborations.filter { !blockedUsers.isBlocked($0.authorID) }
  }

  private var visibleEncounters: [Encounter] {
    vm.encounters.filter { !blockedUsers.isBlocked($0.createdBy) }
  }

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: VinctusTokens.Spacing.xl) {
        header

        if let notice = vm.notice {
          Text(notice)
            .font(.footnote)
            .foregroundStyle(VinctusTokens.Color.textSecondary)
            .frame(maxWidth: .infinity, alignment: .leading)
            .transition(.opacity)
        }

        collaborationsSection
        encountersSection
      }
      .padding(.horizontal, 20)
      .padding(.vertical, VinctusTokens.Spacing.lg)
    }
    .background(VinctusTokens.Color.background)
    .vinctusTopBar()
    .task(id: uid) {
      await vm.load(uid: uid)
    }
    .refreshOnTabReturn {
      await vm.load(uid: uid)
    }
    .refreshable {
      await vm.load(uid: uid)
    }
    .sheet(isPresented: $isCreatingCollaboration) {
      CreateCollaborationSheet(isSubmitting: vm.isSubmitting) { draft in
        await vm.publish(draft, uid: uid)
      }
    }
    .sheet(isPresented: $isCreatingEncounter) {
      CreateEncounterSheet(isSubmitting: vm.isSubmitting) { draft in
        await vm.publish(draft, uid: uid)
      }
    }
    .sheet(item: $openedCollaboration) { collaboration in
      CollaborationDetailSheet(
        collaboration: collaboration,
        relation: vm.relation(of: collaboration, uid: uid),
        isSubmitting: vm.isSubmitting,
        onRequest: { message in await vm.sendRequest(to: collaboration, message: message, uid: uid) },
        onDelete: { await vm.delete(collaboration, uid: uid) }
      )
    }
    .sheet(item: $openedEncounter) { encounter in
      EncounterDetailSheet(encounter: encounter, repo: repo, uid: uid) {
        vm.removeEncounter(id: encounter.id)
      }
    }
  }

  // MARK: Header

  private var header: some View {
    VStack(alignment: .leading, spacing: VinctusTokens.Spacing.sm) {
      Text("Conexiones")
        .font(VinctusTokens.Typography.serif(36))
        .foregroundStyle(VinctusTokens.Color.textPrimary)
      Text("Conecta. Colabora. Encuentra.")
        .font(.subheadline)
        .foregroundStyle(VinctusTokens.Color.textSecondary)

      ConnectionsPublishButton(title: "Publicar proyecto") {
        isCreatingCollaboration = true
      }
      .padding(.top, VinctusTokens.Spacing.sm)
    }
  }

  // MARK: Collaborations

  private var collaborationsSection: some View {
    VStack(alignment: .leading, spacing: VinctusTokens.Spacing.md) {
      DiscoverSectionHeader(title: "Colaboraciones")

      if vm.isLoadingCollaborations, vm.collaborations.isEmpty {
        ForEach(0..<2, id: \.self) { _ in ConnectionsSkeletonCard(height: 132) }
      } else if let error = vm.collaborationsError, vm.collaborations.isEmpty {
        ConnectionsMessageCard(text: error, actionTitle: "Reintentar") {
          Task { await vm.loadCollaborations(uid: uid) }
        }
      } else if visibleCollaborations.isEmpty {
        ConnectionsMessageCard(text: "Aún no hay proyectos abiertos. Publica el primero.")
      } else {
        ForEach(visibleCollaborations) { collaboration in
          Button {
            openedCollaboration = collaboration
          } label: {
            CollaborationCard(collaboration: collaboration, relation: vm.relation(of: collaboration, uid: uid))
          }
          .buttonStyle(.plain)
        }
      }
    }
  }

  // MARK: Encounters

  private var encountersSection: some View {
    VStack(alignment: .leading, spacing: VinctusTokens.Spacing.md) {
      DiscoverSectionHeader(title: "Encuentros")

      ConnectionsPublishButton(title: "Publicar encuentro") {
        isCreatingEncounter = true
      }

      if vm.isLoadingEncounters, vm.encounters.isEmpty {
        HStack(spacing: VinctusTokens.Spacing.md) {
          ConnectionsSkeletonCard(height: 168)
          ConnectionsSkeletonCard(height: 168)
        }
      } else if let error = vm.encountersError, vm.encounters.isEmpty {
        ConnectionsMessageCard(text: error, actionTitle: "Reintentar") {
          Task { await vm.loadEncounters() }
        }
      } else if visibleEncounters.isEmpty {
        ConnectionsMessageCard(text: "No hay encuentros próximos. Organiza uno.")
      } else {
        ScrollView(.horizontal, showsIndicators: false) {
          HStack(spacing: VinctusTokens.Spacing.md) {
            ForEach(visibleEncounters) { encounter in
              Button {
                openedEncounter = encounter
              } label: {
                EncounterCard(encounter: encounter)
              }
              .buttonStyle(.plain)
            }
          }
          .padding(.vertical, 2)
        }
      }
    }
  }
}

// MARK: - Components

/// The web's gold, full width "+ PUBLICAR …" button.
struct ConnectionsPublishButton: View {
  let title: String
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      Label(title, systemImage: "plus")
        .font(.subheadline.weight(.semibold))
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, 13)
        .padding(.horizontal, VinctusTokens.Spacing.lg)
        .foregroundStyle(.black)
        .background(VinctusTokens.Color.accent)
        .clipShape(RoundedRectangle(cornerRadius: VinctusTokens.Radius.sm, style: .continuous))
    }
    .buttonStyle(.plain)
  }
}

struct CollaborationCard: View {
  let collaboration: Collaboration
  let relation: CollaborationRelation

  var body: some View {
    VCard {
      VStack(alignment: .leading, spacing: VinctusTokens.Spacing.sm) {
        HStack(alignment: .firstTextBaseline) {
          ConnectionsChip(text: collaboration.topic ?? "Proyecto", isOutlined: true)
          Spacer()
          Text(ConnectionsFormat.relativeAge(collaboration.createdAt))
            .font(.caption)
            .foregroundStyle(VinctusTokens.Color.textMuted)
        }

        Text(collaboration.seekingRole.isEmpty ? collaboration.title : collaboration.seekingRole)
          .font(VinctusTokens.Typography.serif(22))
          .foregroundStyle(VinctusTokens.Color.textPrimary)
          .multilineTextAlignment(.leading)

        (Text("Por ").foregroundStyle(VinctusTokens.Color.textSecondary)
          + Text(collaboration.authorName).foregroundStyle(VinctusTokens.Color.accent))
          .font(.subheadline)

        HStack(spacing: VinctusTokens.Spacing.sm) {
          if let location = collaboration.location {
            ConnectionsChip(text: location)
          } else {
            ConnectionsChip(text: collaboration.mode.label)
          }
          Spacer()
          if let badge = relation.badge {
            ConnectionsChip(text: badge, isOutlined: true)
          }
          Image(systemName: "arrow.right")
            .font(.footnote)
            .foregroundStyle(VinctusTokens.Color.textMuted)
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    }
    .accessibilityElement(children: .combine)
    .accessibilityHint("Abre el proyecto")
  }
}

struct EncounterCard: View {
  let encounter: Encounter

  var body: some View {
    VCard {
      VStack(alignment: .leading, spacing: VinctusTokens.Spacing.xs) {
        HStack(alignment: .top) {
          VStack(alignment: .leading, spacing: 2) {
            Text(ConnectionsFormat.day(encounter.startAt))
              .font(VinctusTokens.Typography.serif(34))
              .foregroundStyle(VinctusTokens.Color.textPrimary)
            Text(ConnectionsFormat.month(encounter.startAt))
              .font(.caption.weight(.medium))
              .tracking(1.2)
              .foregroundStyle(VinctusTokens.Color.textMuted)
          }
          Spacer()
          Image(systemName: "arrow.right")
            .font(.footnote)
            .foregroundStyle(VinctusTokens.Color.textSecondary)
            .frame(width: 34, height: 34)
            .overlay(Circle().stroke(VinctusTokens.Color.border, lineWidth: 1))
        }

        Spacer(minLength: VinctusTokens.Spacing.sm)

        Text(encounter.title)
          .font(VinctusTokens.Typography.serif(18))
          .foregroundStyle(VinctusTokens.Color.textPrimary)
          .lineLimit(2)

        if let place = ConnectionsFormat.place(city: encounter.city, venue: encounter.venue) {
          Label(place, systemImage: "mappin.and.ellipse")
            .font(.caption)
            .foregroundStyle(VinctusTokens.Color.textMuted)
            .lineLimit(1)
        }
      }
      .frame(width: 168, height: 150, alignment: .topLeading)
    }
    .accessibilityElement(children: .combine)
  }
}

struct ConnectionsChip: View {
  let text: String
  var isOutlined = false

  var body: some View {
    Text(text)
      .font(.caption.weight(.medium))
      .lineLimit(1)
      .padding(.horizontal, 10)
      .padding(.vertical, 5)
      .foregroundStyle(VinctusTokens.Color.textSecondary)
      .background(isOutlined ? SwiftUI.Color.clear : VinctusTokens.Color.surface2)
      .overlay(
        RoundedRectangle(cornerRadius: 7, style: .continuous)
          .stroke(isOutlined ? VinctusTokens.Color.border : SwiftUI.Color.clear, lineWidth: 1)
      )
      .clipShape(RoundedRectangle(cornerRadius: 7, style: .continuous))
  }
}

struct ConnectionsMessageCard: View {
  let text: String
  var actionTitle: String? = nil
  var action: (() -> Void)? = nil

  var body: some View {
    VCard {
      VStack(alignment: .leading, spacing: VinctusTokens.Spacing.sm) {
        Text(text)
          .font(.footnote)
          .foregroundStyle(VinctusTokens.Color.textSecondary)
        if let actionTitle, let action {
          VButton(actionTitle, variant: .secondary, action: action)
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    }
  }
}

struct ConnectionsSkeletonCard: View {
  let height: CGFloat

  var body: some View {
    RoundedRectangle(cornerRadius: VinctusTokens.Radius.md, style: .continuous)
      .fill(VinctusTokens.Color.surface)
      .frame(maxWidth: .infinity)
      .frame(height: height)
      .redacted(reason: .placeholder)
  }
}

/// Dates and places the way the web shows them ("Hace 3 d", "16 ENE").
enum ConnectionsFormat {
  private static let spanish = Locale(identifier: "es_ES")

  static func relativeAge(_ date: Date, now: Date = Date()) -> String {
    let seconds = max(0, now.timeIntervalSince(date))
    let minutes = Int(seconds / 60)
    if minutes < 1 { return "Ahora" }
    if minutes < 60 { return "Hace \(minutes) min" }
    let hours = minutes / 60
    if hours < 24 { return "Hace \(hours) h" }
    return "Hace \(hours / 24) d"
  }

  static func day(_ date: Date?) -> String {
    guard let date else { return "—" }
    return String(Calendar(identifier: .gregorian).component(.day, from: date))
  }

  static func month(_ date: Date?) -> String {
    guard let date else { return "" }
    let formatter = DateFormatter()
    formatter.locale = spanish
    formatter.dateFormat = "MMM"
    return formatter.string(from: date).replacingOccurrences(of: ".", with: "").uppercased()
  }

  static func fullDate(_ date: Date?) -> String {
    guard let date else { return "Fecha por confirmar" }
    let formatter = DateFormatter()
    formatter.locale = spanish
    formatter.dateFormat = "EEEE d 'de' MMMM, HH:mm"
    return formatter.string(from: date).capitalized(with: spanish)
  }

  static func place(city: String?, venue: String?) -> String? {
    let parts = [city, venue].compactMap { $0 }.filter { !$0.isEmpty }
    return parts.isEmpty ? nil : parts.joined(separator: ", ")
  }
}

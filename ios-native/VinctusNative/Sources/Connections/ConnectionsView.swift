import SwiftUI

/// The Conexiones tab, like the web's ProjectsPage (`src/features/projects/pages/ProjectsPage.tsx`):
/// open projects looking for people, then upcoming encounters, each section with its own
/// "+ Publicar …".
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
    }
  }

  // MARK: Collaborations

  private var collaborationsSection: some View {
    VStack(alignment: .leading, spacing: VinctusTokens.Spacing.md) {
      ConnectionsSectionHeader(
        title: "Colaboraciones",
        subtitle: "Proyectos abiertos que buscan a alguien",
        actionTitle: "Publicar proyecto"
      ) {
        isCreatingCollaboration = true
      }

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
      ConnectionsSectionHeader(
        title: "Encuentros",
        subtitle: "Próximas reuniones de la comunidad",
        actionTitle: "Publicar encuentro"
      ) {
        isCreatingEncounter = true
      }

      if vm.isLoadingEncounters, vm.encounters.isEmpty {
        HStack(spacing: VinctusTokens.Spacing.md) {
          ConnectionsSkeletonCard(height: 184)
          ConnectionsSkeletonCard(height: 184)
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

/// A section heading like the web's: the serif title with a small gold "+ Publicar …", then a
/// short line.
struct ConnectionsSectionHeader: View {
  let title: String
  let subtitle: String
  let actionTitle: String
  let action: () -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      HStack(alignment: .center, spacing: VinctusTokens.Spacing.md) {
        DiscoverSectionHeader(title: title)
        Spacer(minLength: 8)
        ConnectionsPublishButton(title: actionTitle, action: action)
      }
      Text(subtitle)
        .font(.footnote)
        .foregroundStyle(VinctusTokens.Color.textMuted)
    }
  }
}

/// The web's small gold "+ PUBLICAR …" of a section.
struct ConnectionsPublishButton: View {
  let title: String
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      Label(title, systemImage: "plus")
        .font(.caption.weight(.semibold))
        .lineLimit(1)
        .padding(.horizontal, 12)
        .padding(.vertical, 7)
        .foregroundStyle(.black)
        .background(VinctusTokens.Color.accent)
        .clipShape(RoundedRectangle(cornerRadius: VinctusTokens.Radius.sm, style: .continuous))
    }
    .buttonStyle(.plain)
  }
}

/// One open project, like the web's card: its field and age, its name, who it looks for, who
/// leads it, its tags and whether you can still ask to join. Tapping opens it.
struct CollaborationCard: View {
  let collaboration: Collaboration
  let relation: CollaborationRelation

  var body: some View {
    VCard {
      VStack(alignment: .leading, spacing: 0) {
        HStack(alignment: .firstTextBaseline, spacing: VinctusTokens.Spacing.sm) {
          Text(collaboration.context.uppercased())
            .font(.caption2.weight(.medium))
            .tracking(1.4)
            .foregroundStyle(VinctusTokens.Color.textMuted)
            .lineLimit(1)
          Spacer(minLength: 8)
          Text(ConnectionsFormat.relativeAge(collaboration.createdAt))
            .font(.caption)
            .foregroundStyle(VinctusTokens.Color.textMuted)
        }

        Text(collaboration.title)
          .font(VinctusTokens.Typography.serif(22))
          .foregroundStyle(VinctusTokens.Color.textPrimary)
          .multilineTextAlignment(.leading)
          .padding(.top, 10)

        if !collaboration.seekingRole.isEmpty {
          (Text("Busca ").foregroundStyle(VinctusTokens.Color.textSecondary)
            + Text(collaboration.seekingRole).foregroundStyle(VinctusTokens.Color.textPrimary))
            .font(.subheadline)
            .padding(.top, 4)
        }

        HStack(alignment: .bottom, spacing: VinctusTokens.Spacing.md) {
          VStack(alignment: .leading, spacing: 3) {
            (Text("Por ").foregroundStyle(VinctusTokens.Color.textSecondary)
              + Text(collaboration.authorName).foregroundStyle(VinctusTokens.Color.accent))
              .font(.subheadline)
              .lineLimit(1)
            let tags = ConnectionsFormat.tags(for: collaboration)
            if !tags.isEmpty {
              Text(tags.joined(separator: " · "))
                .font(.caption)
                .foregroundStyle(VinctusTokens.Color.textMuted)
                .lineLimit(1)
            }
          }
          Spacer(minLength: 8)
          ConnectionsRelationBadge(relation: relation)
        }
        .padding(.top, VinctusTokens.Spacing.lg)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    }
    .accessibilityElement(children: .combine)
    .accessibilityHint("Abre el proyecto")
  }
}

/// "Solicitar" in a small gold outline; "Solicitud enviada" and "Tu proyecto" neutral. The
/// request itself is written in the project's sheet, as on the web.
struct ConnectionsRelationBadge: View {
  let relation: CollaborationRelation

  var body: some View {
    HStack(spacing: 4) {
      if relation == .requested {
        Image(systemName: "checkmark")
          .font(.caption2.weight(.semibold))
      }
      Text(relation.badge ?? "Solicitar")
    }
    .font(.caption.weight(.medium))
    .lineLimit(1)
    .padding(.horizontal, 12)
    .padding(.vertical, 6)
    .foregroundStyle(relation == .available ? VinctusTokens.Color.accent : VinctusTokens.Color.textSecondary)
    .overlay(
      Capsule().stroke(
        relation == .available ? VinctusTokens.Color.accent.opacity(0.45) : VinctusTokens.Color.border,
        lineWidth: 1
      )
    )
  }
}

/// An upcoming encounter: the day with its gold month, weekday and time, the name, the place and
/// who is going ("Completo · 12/12" when it is full).
struct EncounterCard: View {
  let encounter: Encounter

  var body: some View {
    let attendance = ConnectionsFormat.attendance(count: encounter.attendeesCount ?? 0, capacity: encounter.capacity)
    VCard {
      VStack(alignment: .leading, spacing: 0) {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
          Text(ConnectionsFormat.day(encounter.startAt))
            .font(VinctusTokens.Typography.serif(34))
            .foregroundStyle(VinctusTokens.Color.textPrimary)
          Text(ConnectionsFormat.month(encounter.startAt))
            .font(.caption.weight(.semibold))
            .tracking(1.4)
            .foregroundStyle(VinctusTokens.Color.accent.opacity(0.85))
        }
        Text(ConnectionsFormat.weekdayTime(encounter.startAt))
          .font(.caption)
          .foregroundStyle(VinctusTokens.Color.textMuted)
          .padding(.top, 2)

        Text(encounter.title)
          .font(VinctusTokens.Typography.serif(18))
          .foregroundStyle(VinctusTokens.Color.textPrimary)
          .lineLimit(2)
          .multilineTextAlignment(.leading)
          .padding(.top, VinctusTokens.Spacing.md)

        Spacer(minLength: VinctusTokens.Spacing.sm)

        VStack(alignment: .leading, spacing: 4) {
          if let place = ConnectionsFormat.place(city: encounter.city, venue: encounter.venue) {
            Label(place, systemImage: "mappin.and.ellipse")
              .lineLimit(1)
              .foregroundStyle(VinctusTokens.Color.textMuted)
          }
          Label(attendance.text, systemImage: "person.2")
            .lineLimit(1)
            .foregroundStyle(attendance.isFull ? VinctusTokens.Color.accent.opacity(0.85) : VinctusTokens.Color.textMuted)
        }
        .font(.caption)
      }
      .frame(width: 184, height: 166, alignment: .topLeading)
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

  /// "Sáb · 20:00", like the web.
  static func weekdayTime(_ date: Date?) -> String {
    guard let date else { return "Fecha por confirmar" }
    let formatter = DateFormatter()
    formatter.locale = spanish
    formatter.dateFormat = "EEE"
    let weekday = formatter.string(from: date).replacingOccurrences(of: ".", with: "")
    formatter.dateFormat = "HH:mm"
    return "\(weekday.prefix(1).uppercased())\(weekday.dropFirst()) · \(formatter.string(from: date))"
  }

  /// Up to three short labels, like the web: the project's own tags or, without them, place,
  /// mode and level.
  static func tags(for collaboration: Collaboration) -> [String] {
    let own = collaboration.tags
      .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
      .filter { !$0.isEmpty }
    if !own.isEmpty { return Array(own.prefix(3)) }
    var tags: [String] = []
    if let location = collaboration.location, !location.isEmpty { tags.append(location) }
    tags.append(collaboration.mode.label)
    tags.append("Nivel \(collaboration.level.label)")
    return Array(tags.prefix(3))
  }

  /// Who is going, and whether places are left when the encounter has a capacity.
  static func attendance(count: Int, capacity: Int?) -> (text: String, isFull: Bool) {
    if let capacity, capacity > 0 {
      if count >= capacity { return ("Completo · \(count)/\(capacity)", true) }
      return ("\(count) de \(capacity) asistentes", false)
    }
    if count <= 0 { return ("Aún sin asistentes", false) }
    return (count == 1 ? "1 asistente" : "\(count) asistentes", false)
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

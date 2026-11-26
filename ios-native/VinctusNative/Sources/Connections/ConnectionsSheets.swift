import SwiftUI

// The web's modals for Conexiones: CreateCollaborationModal, CollaborationDetailModal,
// CreateEventModal and EventDetailModal (`src/features/collaborations|events/components/`).

struct CreateCollaborationSheet: View {
  @Environment(\.dismiss) private var dismiss
  @State private var draft = CollaborationDraft()
  let isSubmitting: Bool
  let onPublish: (CollaborationDraft) async -> Bool

  var body: some View {
    NavigationStack {
      Form {
        Section("Proyecto") {
          TextField("Título del proyecto", text: $draft.title)
          TextField("Contexto (en una línea)", text: $draft.context)
          TextField("Rol que buscas (ej. Bajista)", text: $draft.seekingRole)
        }
        Section("Detalles") {
          Picker("Modalidad", selection: $draft.mode) {
            ForEach(CollaborationMode.allCases) { Text($0.label).tag($0) }
          }
          if draft.mode == .presencial {
            TextField("Ubicación", text: $draft.location)
          }
          Picker("Nivel", selection: $draft.level) {
            ForEach(CollaborationLevel.allCases) { Text($0.label).tag($0) }
          }
          TextField("Tema (opcional)", text: $draft.topic)
          TextField("Etiquetas separadas por comas", text: $draft.tagsText)
            .textInputAutocapitalization(.never)
        }
        Section {
          Text("Máximo \(CollaborationDraft.maxTags) etiquetas de \(CollaborationDraft.tagLimit) caracteres.")
            .font(.footnote)
            .foregroundStyle(VinctusTokens.Color.textMuted)
        }
      }
      .scrollContentBackground(.hidden)
      .background(VinctusTokens.Color.background)
      .navigationTitle("Publicar proyecto")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("Cancelar") { dismiss() }
        }
        ToolbarItem(placement: .confirmationAction) {
          Button("Publicar") {
            Task {
              if await onPublish(draft) { dismiss() }
            }
          }
          .disabled(isSubmitting || draft.validated() == nil)
        }
      }
    }
    .presentationDetents([.large])
  }
}

struct CreateEncounterSheet: View {
  @Environment(\.dismiss) private var dismiss
  @State private var draft = EncounterDraft()
  let isSubmitting: Bool
  let onPublish: (EncounterDraft) async -> Bool

  var body: some View {
    NavigationStack {
      Form {
        Section("Encuentro") {
          TextField("Título", text: $draft.title)
          DatePicker("Fecha y hora", selection: $draft.startAt, in: Date()..., displayedComponents: [.date, .hourAndMinute])
        }
        Section("Lugar") {
          TextField("Ciudad", text: $draft.city)
          TextField("Lugar o dirección", text: $draft.venue)
        }
        Section("Más información") {
          TextField("Aforo (opcional)", text: $draft.capacityText)
            .keyboardType(.numberPad)
          TextField("Descripción (opcional)", text: $draft.description, axis: .vertical)
            .lineLimit(3...8)
        }
      }
      .scrollContentBackground(.hidden)
      .background(VinctusTokens.Color.background)
      .navigationTitle("Publicar encuentro")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("Cancelar") { dismiss() }
        }
        ToolbarItem(placement: .confirmationAction) {
          Button("Publicar") {
            Task {
              if await onPublish(draft) { dismiss() }
            }
          }
          .disabled(isSubmitting || draft.validated() == nil)
        }
      }
    }
    .presentationDetents([.large])
  }
}

struct CollaborationDetailSheet: View {
  @Environment(\.dismiss) private var dismiss
  @State private var message = ""
  @State private var isConfirmingDelete = false

  let collaboration: Collaboration
  let relation: CollaborationRelation
  let isSubmitting: Bool
  let onRequest: (String) async -> Bool
  let onDelete: () async -> Bool

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: VinctusTokens.Spacing.lg) {
          VStack(alignment: .leading, spacing: VinctusTokens.Spacing.sm) {
            ConnectionsChip(text: collaboration.topic ?? "Proyecto", isOutlined: true)
            Text(collaboration.title)
              .font(VinctusTokens.Typography.serif(28))
              .foregroundStyle(VinctusTokens.Color.textPrimary)
            Text(collaboration.context)
              .font(.body)
              .foregroundStyle(VinctusTokens.Color.textSecondary)
          }

          HStack(spacing: VinctusTokens.Spacing.sm) {
            AvatarView(name: collaboration.authorName, photoURLString: collaboration.authorPhotoURL, size: 36)
            VStack(alignment: .leading, spacing: 2) {
              Text(collaboration.authorName)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(VinctusTokens.Color.textPrimary)
              Text(ConnectionsFormat.relativeAge(collaboration.createdAt))
                .font(.caption)
                .foregroundStyle(VinctusTokens.Color.textMuted)
            }
          }

          VCard {
            VStack(alignment: .leading, spacing: VinctusTokens.Spacing.sm) {
              detailRow("Busca", collaboration.seekingRole)
              detailRow("Modalidad", collaboration.mode.label)
              if let location = collaboration.location { detailRow("Ubicación", location) }
              detailRow("Nivel", collaboration.level.label)
            }
          }

          if !collaboration.tags.isEmpty {
            ScrollView(.horizontal, showsIndicators: false) {
              HStack(spacing: 6) {
                ForEach(collaboration.tags, id: \.self) { ConnectionsChip(text: $0) }
              }
            }
          }

          actions
        }
        .padding(20)
      }
      .background(VinctusTokens.Color.background)
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("Cerrar") { dismiss() }
        }
      }
      .confirmationDialog("¿Eliminar este proyecto?", isPresented: $isConfirmingDelete, titleVisibility: .visible) {
        Button("Eliminar", role: .destructive) {
          Task {
            if await onDelete() { dismiss() }
          }
        }
      } message: {
        Text("Las solicitudes pendientes se marcarán como rechazadas.")
      }
    }
  }

  @ViewBuilder
  private var actions: some View {
    switch relation {
    case .own:
      VButton("Eliminar proyecto", variant: .destructive) { isConfirmingDelete = true }
        .disabled(isSubmitting)
    case .requested:
      VButton("Solicitud enviada", variant: .secondary) {}
        .disabled(true)
    case .available:
      VStack(alignment: .leading, spacing: VinctusTokens.Spacing.sm) {
        TextField("Mensaje para el autor (opcional)", text: $message, axis: .vertical)
          .lineLimit(2...5)
          .padding(VinctusTokens.Spacing.md)
          .background(VinctusTokens.Color.surface2)
          .clipShape(RoundedRectangle(cornerRadius: VinctusTokens.Radius.sm, style: .continuous))
        VButton(isSubmitting ? "Enviando…" : "Quiero colaborar") {
          Task {
            if await onRequest(message) { dismiss() }
          }
        }
        .disabled(isSubmitting)
      }
    }
  }

  private func detailRow(_ title: String, _ value: String) -> some View {
    HStack(alignment: .firstTextBaseline) {
      Text(title)
        .font(.subheadline)
        .foregroundStyle(VinctusTokens.Color.textMuted)
      Spacer()
      Text(value)
        .font(.subheadline)
        .foregroundStyle(VinctusTokens.Color.textPrimary)
        .multilineTextAlignment(.trailing)
    }
  }
}

struct EncounterDetailSheet: View {
  @Environment(\.dismiss) private var dismiss
  @StateObject private var vm: EncounterDetailViewModel
  @State private var isConfirmingDelete = false
  let uid: String?
  let onDeleted: () -> Void

  init(encounter: Encounter, repo: ConnectionsRepo, uid: String?, onDeleted: @escaping () -> Void) {
    _vm = StateObject(wrappedValue: EncounterDetailViewModel(encounter: encounter, repo: repo))
    self.uid = uid
    self.onDeleted = onDeleted
  }

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: VinctusTokens.Spacing.lg) {
          VStack(alignment: .leading, spacing: VinctusTokens.Spacing.sm) {
            Text(ConnectionsFormat.fullDate(vm.encounter.startAt))
              .font(.subheadline.weight(.medium))
              .foregroundStyle(VinctusTokens.Color.accent)
            Text(vm.encounter.title)
              .font(VinctusTokens.Typography.serif(28))
              .foregroundStyle(VinctusTokens.Color.textPrimary)
            if let place = ConnectionsFormat.place(city: vm.encounter.city, venue: vm.encounter.venue) {
              Label(place, systemImage: "mappin.and.ellipse")
                .font(.subheadline)
                .foregroundStyle(VinctusTokens.Color.textSecondary)
            }
          }

          if let description = vm.encounter.description {
            Text(description)
              .font(.body)
              .foregroundStyle(VinctusTokens.Color.textSecondary)
          }

          VCard {
            HStack {
              Label(attendanceText, systemImage: "person.2")
                .font(.subheadline)
                .foregroundStyle(VinctusTokens.Color.textPrimary)
              Spacer()
              if vm.isAttending {
                ConnectionsChip(text: "Asistirás", isOutlined: true)
              }
            }
          }

          if let error = vm.errorMessage {
            Text(error)
              .font(.footnote)
              .foregroundStyle(.red)
          }

          actions
        }
        .padding(20)
      }
      .background(VinctusTokens.Color.background)
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("Cerrar") { dismiss() }
        }
      }
      .confirmationDialog("¿Eliminar este encuentro?", isPresented: $isConfirmingDelete, titleVisibility: .visible) {
        Button("Eliminar", role: .destructive) {
          Task {
            if await vm.delete(uid: uid) {
              onDeleted()
              dismiss()
            }
          }
        }
      }
      .task(id: uid) {
        await vm.load(uid: uid)
      }
    }
  }

  private var attendanceText: String {
    let count = vm.attendeesCount ?? 0
    let people = count == 1 ? "1 asistente" : "\(count) asistentes"
    if let capacity = vm.encounter.capacity, capacity > 0 {
      return "\(people) de \(capacity)"
    }
    return people
  }

  @ViewBuilder
  private var actions: some View {
    if vm.isOwner(uid: uid) {
      VButton("Eliminar encuentro", variant: .destructive) { isConfirmingDelete = true }
        .disabled(vm.isBusy)
    } else if vm.isAttending {
      VButton(vm.isBusy ? "Actualizando…" : "Ya no asistiré", variant: .secondary) {
        Task { await vm.toggleAttendance(uid: uid) }
      }
      .disabled(vm.isBusy)
    } else if vm.isFull {
      VButton("Aforo completo", variant: .secondary) {}
        .disabled(true)
    } else {
      VButton(vm.isBusy ? "Actualizando…" : "Asistiré") {
        Task { await vm.toggleAttendance(uid: uid) }
      }
      .disabled(vm.isBusy)
    }
  }
}

import SwiftUI

/// "Detalles del chat" and "Detalles del grupo", like the web's ConversationDetailsPage and
/// GroupConversationDetailsPage: the person or the group, three shortcuts (Perfil or Grupo,
/// Silenciar, Buscar), the options, and the destructive actions apart in red.
struct ChatDetailsView: View {
  let title: String
  let photoURL: String?
  /// The chat's loaded messages, for Fotos y archivos and Buscar.
  let messages: [ChatMessage]
  let chatRepo: ChatRepo
  let profileRepo: ProfileRepo
  let groupsRepo: any GroupsRepo
  /// A search result: back to the chat at that message.
  let onJumpToMessage: (String) -> Void
  /// "Limpiar chat local" was confirmed.
  let onCleared: () -> Void
  /// Blocked the person or left the group: the chat closes too.
  let onLeftConversation: () -> Void

  @EnvironmentObject private var authVM: AuthViewModel
  @EnvironmentObject private var blockedUsers: BlockedUsersStore
  @StateObject private var vm: ChatDetailsViewModel
  @State private var sheet: DetailsSheet?
  @State private var confirmation: DetailsConfirmation?
  @State private var isChoosingMute = false
  @State private var createdGroupID: String?
  @State private var actionError: String?

  init(
    kind: ChatDetailsViewModel.Kind,
    conversationID: String,
    title: String,
    photoURL: String?,
    messages: [ChatMessage],
    chatRepo: ChatRepo,
    profileRepo: ProfileRepo,
    groupsRepo: any GroupsRepo = AppRepos.groups(),
    onJumpToMessage: @escaping (String) -> Void,
    onCleared: @escaping () -> Void,
    onLeftConversation: @escaping () -> Void
  ) {
    self.title = title
    self.photoURL = photoURL
    self.messages = messages
    self.chatRepo = chatRepo
    self.profileRepo = profileRepo
    self.groupsRepo = groupsRepo
    self.onJumpToMessage = onJumpToMessage
    self.onCleared = onCleared
    self.onLeftConversation = onLeftConversation
    _vm = StateObject(wrappedValue: ChatDetailsViewModel(
      kind: kind, conversationID: conversationID,
      chatRepo: chatRepo, profileRepo: profileRepo, groupsRepo: groupsRepo
    ))
  }

  private var files: [ChatDetailsContent.File] { ChatDetailsContent.files(in: messages) }

  private var name: String {
    switch vm.kind {
    case .direct: return vm.profile?.displayName ?? title
    case .group: return vm.group?.name ?? title
    }
  }

  // The body is split in steps so the type checker handles it in reasonable time.
  var body: some View {
    withNavigation(withSheets(withDialogs(page)))
  }

  private var page: some View {
    ScrollView {
      VStack(spacing: 0) {
        hero
        quickActions
          .padding(.bottom, 28)
        options
        if let error = vm.errorMessage ?? actionError {
          Text(error)
            .font(.footnote)
            .foregroundStyle(.red)
            .padding(.top, 8)
        }
      }
      .padding(.horizontal, VinctusTokens.Spacing.lg)
      .padding(.bottom, 32)
    }
    .background(VinctusTokens.Color.background)
    .navigationTitle(vm.kind.isGroup ? "Detalles del grupo" : "Detalles del chat")
    .navigationBarTitleDisplayMode(.inline)
    .task { await vm.load() }
  }

  @ViewBuilder
  private var options: some View {
    switch vm.kind {
    case let .direct(otherUserID):
      directOptions(otherUserID: otherUserID)
    case let .group(groupID):
      groupOptions(groupID: groupID)
    }
  }

  private var isConfirming: Binding<Bool> {
    Binding(get: { confirmation != nil }, set: { if !$0 { confirmation = nil } })
  }

  private var confirmationTitle: String {
    confirmation?.title(name: name) ?? ""
  }

  private func withDialogs<V: View>(_ view: V) -> some View {
    view
      .confirmationDialog("Silenciar conversación", isPresented: $isChoosingMute, titleVisibility: .visible) {
        ForEach(ChatMuteFormat.options) { option in
          Button(option.label) {
            Task { await vm.mute(hours: option.hours) }
          }
        }
      } message: {
        Text("No recibirás notificaciones de este chat.")
      }
      .confirmationDialog(
        confirmationTitle,
        isPresented: isConfirming,
        titleVisibility: .visible,
        presenting: confirmation
      ) { (pending: DetailsConfirmation) in
        Button(pending.actionLabel, role: pending.role) {
          confirm(pending)
        }
      } message: { (pending: DetailsConfirmation) in
        Text(pending.message(name: name))
      }
  }

  private func withSheets<V: View>(_ view: V) -> some View {
    view
      .sheet(item: $sheet) { (shown: DetailsSheet) in
        sheetContent(shown)
      }
      .onChange(of: sheet) { previous, current in
        // An edited group shows its new name and icon.
        if case .editGroup? = previous, current == nil { Task { await vm.load() } }
      }
  }

  private func withNavigation<V: View>(_ view: V) -> some View {
    view.navigationDestination(item: $createdGroupID) { (groupID: String) in
      GroupView(repo: groupsRepo, groupID: groupID, chatRepo: chatRepo, profileRepo: profileRepo)
    }
  }

  @ViewBuilder
  private func sheetContent(_ shown: DetailsSheet) -> some View {
    switch shown {
    case .files:
      ChatFilesSheet(files: files)
    case .search:
      ChatSearchSheet(messages: messages, currentUserID: authVM.currentUserID) { messageID in
        sheet = nil
        onJumpToMessage(messageID)
      }
    case let .report(target):
      ReportSheet(target: target, repo: blockedUsers.repo)
    case let .createGroup(person):
      CreateGroupSheet(
        repo: groupsRepo,
        contentRepo: AppRepos.profileContent(),
        preselected: [person]
      ) { groupID, warning in
        sheet = nil
        actionError = warning
        createdGroupID = groupID
      }
    case let .editGroup(detail):
      EditGroupSheet(detail: detail, repo: groupsRepo)
    }
  }

  // MARK: Hero

  private var hero: some View {
    VStack(spacing: 6) {
      Group {
        switch vm.kind {
        case .direct:
          AvatarView(name: name, photoURLString: vm.profile?.photoURL ?? photoURL, size: 88)
        case .group:
          GroupSquareIcon(name: name, iconURL: vm.group?.iconURL ?? photoURL, size: 88)
        }
      }
      .padding(.bottom, 8)

      Text(name)
        .font(VinctusTokens.Typography.serif(26))
        .foregroundStyle(VinctusTokens.Color.textPrimary)
        .multilineTextAlignment(.center)

      if let subtitle {
        Text(subtitle)
          .font(.subheadline)
          .foregroundStyle(VinctusTokens.Color.textMuted)
      }
      if let status = vm.muteStatusText {
        Text(status)
          .font(.caption.weight(.medium))
          .foregroundStyle(VinctusTokens.Color.accentBright.opacity(0.9))
          .padding(.top, 2)
      }
    }
    .frame(maxWidth: .infinity)
    .padding(.top, 20)
    .padding(.bottom, 24)
  }

  private var subtitle: String? {
    switch vm.kind {
    case .direct:
      return vm.profile?.username.map { "@\($0)" }
    case .group:
      guard let count = vm.group?.memberCount, count > 0 else { return "Grupo" }
      return "Grupo · \(count.formatted()) \(count == 1 ? "miembro" : "miembros")"
    }
  }

  // MARK: Shortcuts

  private var quickActions: some View {
    HStack(spacing: 18) {
      switch vm.kind {
      case let .direct(otherUserID):
        NavigationLink {
          ProfileView(repo: profileRepo, userID: otherUserID)
        } label: {
          QuickActionLabel(systemImage: "person", title: "Perfil")
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Ver perfil")
      case let .group(groupID):
        NavigationLink {
          GroupView(repo: groupsRepo, groupID: groupID, chatRepo: chatRepo, profileRepo: profileRepo)
        } label: {
          QuickActionLabel(systemImage: "person.3", title: "Grupo")
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Ver grupo")
      }

      Button {
        if vm.isMuted {
          Task { await vm.unmute() }
        } else {
          isChoosingMute = true
        }
      } label: {
        QuickActionLabel(
          systemImage: vm.isMuted ? "bell.slash" : "bell",
          title: vm.isMuted ? "Silenciado" : "Silenciar",
          isActive: vm.isMuted
        )
      }
      .buttonStyle(.plain)
      .disabled(vm.isUpdatingMute)
      .accessibilityLabel(vm.isMuted ? "Quitar silencio" : "Silenciar")
      .accessibilityIdentifier("chat-details-mute")

      Button {
        sheet = .search
      } label: {
        QuickActionLabel(systemImage: "magnifyingglass", title: "Buscar")
      }
      .buttonStyle(.plain)
      .accessibilityLabel("Buscar en la conversación")
    }
  }

  // MARK: Options

  @ViewBuilder
  private func directOptions(otherUserID: String) -> some View {
    let isBlocked = blockedUsers.isBlocked(otherUserID)
    DetailsRowGroup {
      DetailsRow(systemImage: "photo.on.rectangle", title: "Fotos y archivos",
                 value: files.isEmpty ? nil : "\(files.count)", showsChevron: true) {
        sheet = .files
      }
      RowDivider()
      DetailsRow(systemImage: "person.2", title: "Crear grupo con esta persona", showsChevron: true) {
        sheet = .createGroup(ProfileUserSummary(
          id: otherUserID, name: name, photoURL: vm.profile?.photoURL ?? photoURL, username: vm.profile?.username
        ))
      }
      RowDivider()
      DetailsRow(systemImage: "eraser", title: "Limpiar chat local", detail: "No borra mensajes del servidor") {
        confirmation = .clear
      }
    }
    DetailsRowGroup {
      DetailsRow(
        systemImage: isBlocked ? "hand.raised.slash" : "hand.raised",
        title: isBlocked ? "Desbloquear a \(name)" : "Bloquear a \(name)",
        tone: isBlocked ? .normal : .danger
      ) {
        confirmation = isBlocked ? DetailsConfirmation.unblock(otherUserID) : DetailsConfirmation.block(otherUserID)
      }
      RowDivider()
      DetailsRow(systemImage: "exclamationmark.circle", title: "Reportar a \(name)", tone: .danger) {
        sheet = .report(.user(userID: otherUserID))
      }
    }
  }

  @ViewBuilder
  private func groupOptions(groupID: String) -> some View {
    let isOwner = vm.isOwner(uid: authVM.currentUserID)
    DetailsRowGroup {
      DetailsRow(systemImage: "photo.on.rectangle", title: "Fotos y archivos",
                 value: files.isEmpty ? nil : "\(files.count)", showsChevron: true) {
        sheet = .files
      }
      RowDivider()
      ShareLink(item: URL(string: "\(PostLinks.webBase)/group/\(groupID)") ?? URL(string: PostLinks.webBase)!) {
        DetailsRowLabel(systemImage: "square.and.arrow.up", title: "Compartir enlace")
      }
      .buttonStyle(.plain)
      .accessibilityLabel("Compartir enlace")
      if isOwner, let detail = vm.group {
        RowDivider()
        DetailsRow(systemImage: "pencil", title: "Editar grupo", showsChevron: true) {
          sheet = .editGroup(detail)
        }
      }
      RowDivider()
      DetailsRow(systemImage: "eraser", title: "Limpiar chat local", detail: "No borra mensajes del servidor") {
        confirmation = .clear
      }
    }
    DetailsRowGroup {
      DetailsRow(systemImage: "flag", title: "Reportar grupo", tone: .danger) {
        sheet = .report(.group(groupID: groupID))
      }
      if vm.group != nil, !isOwner {
        RowDivider()
        DetailsRow(systemImage: "rectangle.portrait.and.arrow.right", title: "Salir del grupo", tone: .danger) {
          confirmation = .leave
        }
      }
    }
    if isOwner {
      Text("Eres el propietario: puedes editar el grupo, pero no salir de él.")
        .font(.caption)
        .foregroundStyle(VinctusTokens.Color.textMuted)
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 4)
    }
  }

  // MARK: Actions

  private func confirm(_ pending: DetailsConfirmation) {
    switch pending {
    case .clear:
      ChatClearedStore.clear(vm.conversationID)
      onCleared()
    case let .block(userID):
      Task {
        do {
          try await blockedUsers.block(userID)
          onLeftConversation()
        } catch {
          actionError = "No se pudo completar la acción."
        }
      }
    case let .unblock(userID):
      Task {
        do {
          try await blockedUsers.unblock(userID)
        } catch {
          actionError = "No se pudo completar la acción."
        }
      }
    case .leave:
      Task {
        if await vm.leaveGroup(uid: authVM.currentUserID) { onLeftConversation() }
      }
    }
  }
}

// MARK: - Sheets and confirmations

private enum DetailsSheet: Identifiable, Equatable {
  case files
  case search
  case report(ReportTarget)
  case createGroup(ProfileUserSummary)
  case editGroup(GroupDetail)

  var id: String {
    switch self {
    case .files: return "files"
    case .search: return "search"
    case let .report(target): return "report_\(target.id)"
    case let .createGroup(person): return "create_\(person.id)"
    case let .editGroup(detail): return "edit_\(detail.id)"
    }
  }
}

private enum DetailsConfirmation: Identifiable {
  case clear
  case block(String)
  case unblock(String)
  case leave

  var id: String {
    switch self {
    case .clear: return "clear"
    case let .block(userID): return "block_\(userID)"
    case let .unblock(userID): return "unblock_\(userID)"
    case .leave: return "leave"
    }
  }

  var isDestructive: Bool {
    switch self {
    case .block, .leave: return true
    case .clear, .unblock: return false
    }
  }

  var role: ButtonRole? {
    isDestructive ? .destructive : nil
  }

  func title(name: String) -> String {
    switch self {
    case .clear: return "Limpiar chat local"
    case .block: return "Bloquear a \(name)"
    case .unblock: return "Desbloquear a \(name)"
    case .leave: return "Salir del grupo"
    }
  }

  var actionLabel: String {
    switch self {
    case .clear: return "Limpiar"
    case .block: return "Bloquear"
    case .unblock: return "Desbloquear"
    case .leave: return "Salir"
    }
  }

  func message(name: String) -> String {
    switch self {
    case .clear:
      return "Los mensajes se ocultan solo en este dispositivo. Siguen en el servidor y puedes volver a mostrarlos desde el chat."
    case .block:
      return "No podrán enviarse mensajes. Dejarán de seguirse y no verás sus publicaciones."
    case .unblock:
      return "Podrán volver a enviarse mensajes y seguirse."
    case .leave:
      return "Dejarás de ser miembro de \(name) y de ver su chat."
    }
  }
}

// MARK: - Pieces

/// A round shortcut under the hero, like Instagram's.
private struct QuickActionLabel: View {
  let systemImage: String
  let title: String
  var isActive = false

  var body: some View {
    VStack(spacing: 6) {
      Image(systemName: systemImage)
        .font(.system(size: 19, weight: .medium))
        .foregroundStyle(isActive ? VinctusTokens.Color.accent : VinctusTokens.Color.textPrimary)
        .frame(width: 52, height: 52)
        .background(
          isActive ? VinctusTokens.Color.accent.opacity(0.15) : VinctusTokens.Color.surface2,
          in: Circle()
        )
      Text(title)
        .font(.caption)
        .foregroundStyle(isActive ? VinctusTokens.Color.accent : VinctusTokens.Color.textSecondary)
    }
    .frame(width: 76)
    .contentShape(Rectangle())
  }
}

/// Rows grouped in one rounded block, like iOS settings; `RowDivider` goes between rows.
private struct DetailsRowGroup<Content: View>: View {
  @ViewBuilder let content: Content

  var body: some View {
    VStack(spacing: 0) {
      content
    }
    .background(VinctusTokens.Color.surface, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    .overlay(
      RoundedRectangle(cornerRadius: 16, style: .continuous)
        .stroke(VinctusTokens.Color.border.opacity(0.6), lineWidth: 0.5)
    )
    .padding(.bottom, 16)
  }
}

/// The hairline between two rows, starting after the icon.
private struct RowDivider: View {
  var body: some View {
    Rectangle()
      .fill(VinctusTokens.Color.border.opacity(0.6))
      .frame(height: 0.5)
      .padding(.leading, 50)
  }
}

private enum DetailsRowTone { case normal, danger }

private struct DetailsRowLabel: View {
  let systemImage: String
  let title: String
  var detail: String?
  var value: String?
  var tone: DetailsRowTone = .normal
  var showsChevron = false

  var body: some View {
    HStack(spacing: 14) {
      Image(systemName: systemImage)
        .font(.system(size: 17))
        .foregroundStyle(tone == .danger ? SwiftUI.Color.red : VinctusTokens.Color.textSecondary)
        .frame(width: 22)
        .accessibilityHidden(true)
      VStack(alignment: .leading, spacing: 2) {
        Text(title)
          .font(.body)
          .foregroundStyle(tone == .danger ? SwiftUI.Color.red : VinctusTokens.Color.textPrimary)
          .lineLimit(1)
        if let detail {
          Text(detail)
            .font(.caption)
            .foregroundStyle(VinctusTokens.Color.textMuted)
        }
      }
      Spacer(minLength: 8)
      if let value {
        Text(value)
          .font(.subheadline)
          .foregroundStyle(VinctusTokens.Color.textMuted)
      }
      if showsChevron {
        Image(systemName: "chevron.right")
          .font(.system(size: 13, weight: .semibold))
          .foregroundStyle(VinctusTokens.Color.textMuted)
          .accessibilityHidden(true)
      }
    }
    .padding(.horizontal, 14)
    .padding(.vertical, 13)
    .contentShape(Rectangle())
  }
}

private struct DetailsRow: View {
  let systemImage: String
  let title: String
  var detail: String?
  var value: String?
  var tone: DetailsRowTone = .normal
  var showsChevron = false
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      DetailsRowLabel(
        systemImage: systemImage, title: title, detail: detail, value: value,
        tone: tone, showsChevron: showsChevron
      )
    }
    .buttonStyle(.plain)
    .accessibilityLabel(title)
    .accessibilityValue(value ?? "")
    .accessibilityHint(detail ?? "")
  }
}

/// Photos and videos in a grid, then audio and documents in a list.
private struct ChatFilesSheet: View {
  let files: [ChatDetailsContent.File]
  @Environment(\.dismiss) private var dismiss
  @State private var preview: ChatDetailsContent.File?

  private var visual: [ChatDetailsContent.File] { files.filter(\.isVisual) }
  private var documents: [ChatDetailsContent.File] { files.filter { !$0.isVisual } }

  var body: some View {
    NavigationStack {
      ScrollView {
        if files.isEmpty {
          Text("Aún no hay fotos ni archivos en este chat.")
            .font(.subheadline)
            .foregroundStyle(VinctusTokens.Color.textMuted)
            .padding(.top, 60)
        } else {
          VStack(spacing: 20) {
            if !visual.isEmpty {
              LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 4), count: 3), spacing: 4) {
                ForEach(visual) { file in
                  Button { preview = file } label: { FileTile(file: file) }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Abrir \(file.attachment.fileName)")
                }
              }
            }
            if !documents.isEmpty {
              VStack(spacing: 0) {
                ForEach(documents) { file in
                  if let url = file.attachment.remoteURL {
                    Link(destination: url) { DocumentRow(file: file) }
                  } else {
                    DocumentRow(file: file)
                  }
                }
              }
              .background(VinctusTokens.Color.surface, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            }
            Text("De los mensajes más recientes.")
              .font(.caption)
              .foregroundStyle(VinctusTokens.Color.textMuted)
          }
          .padding(16)
        }
      }
      .background(VinctusTokens.Color.background)
      .navigationTitle("Fotos y archivos")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("Cerrar") { dismiss() }
        }
      }
      .sheet(item: $preview) { file in
        if let url = file.attachment.remoteURL {
          ChatMediaPreview(url: url, kind: file.attachment.mediaKind, title: file.attachment.label)
        }
      }
    }
  }
}

private struct FileTile: View {
  let file: ChatDetailsContent.File

  var body: some View {
    SwiftUI.Color.clear
      .aspectRatio(1, contentMode: .fit)
      .overlay {
        if file.attachment.mediaKind == .image, let url = file.attachment.remoteURL {
          AsyncImage(url: url) { phase in
            if case let .success(image) = phase {
              image.resizable().scaledToFill()
            } else {
              VinctusTokens.Color.surface2
            }
          }
        } else {
          ZStack {
            VinctusTokens.Color.surface2
            Image(systemName: "play.fill")
              .font(.title3)
              .foregroundStyle(.white)
          }
        }
      }
      .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
  }
}

private struct DocumentRow: View {
  let file: ChatDetailsContent.File

  var body: some View {
    HStack(spacing: 12) {
      Image(systemName: file.attachment.mediaKind == .audio ? "waveform" : "doc")
        .frame(width: 40, height: 40)
        .background(VinctusTokens.Color.surface2, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        .foregroundStyle(VinctusTokens.Color.textSecondary)
      VStack(alignment: .leading, spacing: 2) {
        Text(file.attachment.fileName)
          .font(.subheadline)
          .foregroundStyle(VinctusTokens.Color.textPrimary)
          .lineLimit(1)
        Text("\(ByteCountFormatter.string(fromByteCount: Int64(file.attachment.size), countStyle: .file)) · \(ChatMessageRuns.dayLabel(file.createdAt))")
          .font(.caption)
          .foregroundStyle(VinctusTokens.Color.textMuted)
      }
      Spacer()
    }
    .padding(.horizontal, 14)
    .padding(.vertical, 10)
  }
}

/// Searches the loaded messages; a result goes back to the chat at that message.
private struct ChatSearchSheet: View {
  let messages: [ChatMessage]
  let currentUserID: String?
  let onSelect: (String) -> Void
  @Environment(\.dismiss) private var dismiss
  @State private var query = ""

  var body: some View {
    let results = ChatDetailsContent.search(messages, query: query)
    NavigationStack {
      List {
        if query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
          Text("Escribe para buscar en los mensajes recientes.")
            .foregroundStyle(VinctusTokens.Color.textMuted)
            .listRowBackground(SwiftUI.Color.clear)
        } else if results.isEmpty {
          Text("Sin resultados para “\(query.trimmingCharacters(in: .whitespacesAndNewlines))”.")
            .foregroundStyle(VinctusTokens.Color.textMuted)
            .listRowBackground(SwiftUI.Color.clear)
        } else {
          ForEach(results) { message in
            Button {
              onSelect(message.id)
            } label: {
              VStack(alignment: .leading, spacing: 3) {
                HStack {
                  Text(message.senderID == currentUserID ? "Tú" : (message.senderName ?? "Miembro"))
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(VinctusTokens.Color.textSecondary)
                  Spacer()
                  Text("\(ChatMessageRuns.dayLabel(message.createdAt)) · \(message.createdAt.formatted(date: .omitted, time: .shortened))")
                    .font(.caption2)
                    .foregroundStyle(VinctusTokens.Color.textMuted)
                }
                Text(message.text)
                  .font(.subheadline)
                  .foregroundStyle(VinctusTokens.Color.textPrimary)
                  .lineLimit(2)
              }
            }
            .listRowBackground(SwiftUI.Color.clear)
          }
        }
      }
      .listStyle(.plain)
      .scrollContentBackground(.hidden)
      .background(VinctusTokens.Color.background)
      .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always), prompt: "Buscar mensajes")
      .navigationTitle("Buscar en la conversación")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("Cerrar") { dismiss() }
        }
      }
    }
  }
}

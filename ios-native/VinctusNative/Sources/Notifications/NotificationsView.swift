import SwiftUI

/// Notifications, like the web's page: "Actividad" (grouped by period, repeated follows once,
/// likes on one post together) and "Solicitudes" (follow, group and collaboration requests in
/// one list). Swipe a row to mark it read or delete it; tap it to open the profile or the post.
struct NotificationsView: View {
  enum Tab: Hashable { case activity, requests }

  @EnvironmentObject private var blockedUsers: BlockedUsersStore
  @StateObject private var vm: NotificationsViewModel
  @State private var tab: Tab = .activity
  @State private var requestFilter: IncomingRequest.Kind?
  @State private var openedUserID: String?
  @State private var openedPost: FeedItem?
  @State private var openingPostID: String?

  init(repo: NotificationsRepo = AppRepos.notifications()) {
    _vm = StateObject(wrappedValue: NotificationsViewModel(repo: repo))
  }

  var body: some View {
    List {
      Section {
        tabPicker
      }
      .listRowSeparator(.hidden)
      .listRowBackground(SwiftUI.Color.clear)

      if tab == .activity {
        activityContent
      } else {
        requestsContent
      }
    }
    .listStyle(.plain)
    .scrollContentBackground(.hidden)
    .background(VinctusTokens.Color.background)
    .navigationTitle("Notificaciones")
    .navigationBarTitleDisplayMode(.large)
    .toolbar {
      if tab == .activity, vm.unreadRows > 0 {
        ToolbarItem(placement: .topBarTrailing) {
          Button {
            Task { await vm.markAllRead() }
          } label: {
            Image(systemName: "checkmark.circle")
          }
          .tint(VinctusTokens.Color.accent)
          .disabled(vm.isMarkingAll)
          .accessibilityLabel("Marcar todo como leído")
        }
      }
    }
    .safeAreaInset(edge: .bottom) {
      if let message = vm.message {
        Text(message)
          .font(.footnote.weight(.medium))
          .foregroundStyle(VinctusTokens.Color.textPrimary)
          .padding(.horizontal, 16)
          .padding(.vertical, 12)
          .background(Capsule().fill(VinctusTokens.Color.surface2))
          .padding(.bottom, 12)
          .transition(.move(edge: .bottom).combined(with: .opacity))
          .task(id: message) {
            try? await Task.sleep(nanoseconds: 3_000_000_000)
            vm.message = nil
          }
      }
    }
    .animation(.easeOut(duration: 0.2), value: vm.message)
    .navigationDestination(item: $openedUserID) { userID in
      ProfileView(repo: AppRepos.profile(), userID: userID)
    }
    .navigationDestination(item: $openedPost) { item in
      PostDetailView(item: item, profileRepo: AppRepos.profile(), commentsRepo: AppRepos.postComments())
    }
    .task {
      vm.blocked = blockedUsers.blockedUserIDs
      await vm.refresh()
    }
    .refreshable {
      vm.blocked = blockedUsers.blockedUserIDs
      await vm.refresh()
    }
    .onAppear {
      // Screenshot builds open the requests with `-VinctusNotificationsTab requests`.
      if AppRepos.demoArgument("-VinctusNotificationsTab") == "requests" { tab = .requests }
    }
  }

  // MARK: Tabs

  private var tabPicker: some View {
    HStack(spacing: 4) {
      tabButton("Actividad", count: vm.unreadRows, tab: .activity)
      tabButton("Solicitudes", count: vm.requests.count, tab: .requests)
    }
    .padding(4)
    .background(Capsule().fill(VinctusTokens.Color.surface))
    .overlay(Capsule().stroke(VinctusTokens.Color.border.opacity(0.6), lineWidth: 1))
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  private func tabButton(_ title: String, count: Int, tab value: Tab) -> some View {
    let selected = tab == value
    return Button {
      withAnimation(.easeOut(duration: 0.15)) { tab = value }
    } label: {
      HStack(spacing: 6) {
        Text(title)
          .font(.subheadline.weight(.semibold))
          .foregroundStyle(selected ? VinctusTokens.Color.textPrimary : VinctusTokens.Color.textSecondary)
        if count > 0 {
          Text(count > 99 ? "99+" : "\(count)")
            .font(.caption2.weight(.bold))
            .foregroundStyle(.black)
            .padding(.horizontal, 6)
            .frame(minWidth: 20, minHeight: 20)
            .background(Capsule().fill(VinctusTokens.Color.accent))
        }
      }
      .padding(.horizontal, 14)
      .frame(height: 36)
      .background(Capsule().fill(selected ? VinctusTokens.Color.surface2 : .clear))
    }
    .buttonStyle(.plain)
    .accessibilityAddTraits(selected ? [.isButton, .isSelected] : .isButton)
  }

  // MARK: Activity

  private var activityFilterOptions: [(ActivityFilter, String, Int?)] {
    ActivityFilter.allCases.map { filter -> (ActivityFilter, String, Int?) in (filter, filter.title, nil) }
  }

  private var requestFilterOptions: [(IncomingRequest.Kind?, String, Int?)] {
    var options: [(IncomingRequest.Kind?, String, Int?)] = [(nil, "Todas", vm.requests.count)]
    for kind in IncomingRequest.Kind.allCases {
      options.append((kind, kind.title, vm.count(kind)))
    }
    return options
  }

  @ViewBuilder
  private var activityContent: some View {
    if !vm.requests.isEmpty {
      Section {
        Button {
          withAnimation(.easeOut(duration: 0.15)) { tab = .requests }
        } label: {
          RequestsSummaryRow(requests: vm.requests)
        }
        .buttonStyle(.plain)
      }
      .listRowSeparator(.hidden)
      .listRowBackground(SwiftUI.Color.clear)
    }

    Section {
      FilterChips(options: activityFilterOptions, selection: vm.filter) { vm.filter = $0 }
    }
    .listRowSeparator(.hidden)
    .listRowBackground(SwiftUI.Color.clear)

    if vm.activityState == .loading, vm.activity.isEmpty {
      Section {
        ForEach(0..<4, id: \.self) { _ in NotificationRowPlaceholder() }
      }
      .listRowSeparator(.hidden)
      .listRowBackground(SwiftUI.Color.clear)
    } else if vm.activityState == .failed, vm.activity.isEmpty {
      Section {
        EmptyNotice(icon: "exclamationmark.triangle", text: "No se pudieron cargar las notificaciones.") {
          Button("Reintentar") { Task { await vm.loadActivity() } }
            .buttonStyle(.bordered)
            .tint(VinctusTokens.Color.accent)
        }
      }
      .listRowSeparator(.hidden)
      .listRowBackground(SwiftUI.Color.clear)
    } else if vm.sections.isEmpty {
      Section {
        EmptyNotice(
          icon: "bell",
          text: vm.filter == .all ? "No hay actividad todavía." : "No hay actividad que coincida con tu filtro."
        ) { EmptyView() }
      }
      .listRowSeparator(.hidden)
      .listRowBackground(SwiftUI.Color.clear)
    } else {
      ForEach(vm.sections) { section in
        Section {
          ForEach(section.groups) { group in
            activityRow(group)
          }
        } header: {
          Text(section.title)
            .font(VinctusTokens.Typography.sectionTitle(size: 17))
            .foregroundStyle(VinctusTokens.Color.textPrimary)
            .textCase(nil)
        }
      }

      if vm.hasMoreActivity {
        Section {
          Button {
            Task { await vm.loadMore() }
          } label: {
            Text(vm.isLoadingMore ? "Cargando…" : "Cargar más")
              .font(.subheadline.weight(.semibold))
              .frame(maxWidth: .infinity)
          }
          .buttonStyle(.bordered)
          .tint(VinctusTokens.Color.textSecondary)
          .disabled(vm.isLoadingMore)
        }
        .listRowSeparator(.hidden)
        .listRowBackground(SwiftUI.Color.clear)
      }
    }
  }

  private func activityRow(_ group: ActivityGroup) -> some View {
    Button {
      open(group)
    } label: {
      ActivityRowView(group: group, isOpening: openingPostID == group.latest.postID && openingPostID != nil)
    }
    .buttonStyle(.plain)
    .listRowSeparator(.hidden)
    .listRowInsets(EdgeInsets(top: 4, leading: 12, bottom: 4, trailing: 12))
    .listRowBackground(
      RoundedRectangle(cornerRadius: VinctusTokens.Radius.lg, style: .continuous)
        .fill(group.isRead ? SwiftUI.Color.clear : VinctusTokens.Color.accent.opacity(0.07))
        .padding(.horizontal, 8)
        .padding(.vertical, 2)
    )
    .swipeActions(edge: .trailing, allowsFullSwipe: true) {
      Button(role: .destructive) {
        Task { await vm.delete(group) }
      } label: {
        Label("Eliminar", systemImage: "trash")
      }
    }
    .swipeActions(edge: .leading, allowsFullSwipe: true) {
      if !group.isRead {
        Button {
          Task { await vm.markRead(group) }
        } label: {
          Label("Leída", systemImage: "checkmark")
        }
        .tint(VinctusTokens.Color.accent)
      }
    }
    .contextMenu {
      if !group.isRead {
        Button {
          Task { await vm.markRead(group) }
        } label: {
          Label("Marcar como leída", systemImage: "checkmark")
        }
      }
      Button(role: .destructive) {
        Task { await vm.delete(group) }
      } label: {
        Label("Eliminar notificación", systemImage: "trash")
      }
    }
  }

  private func open(_ group: ActivityGroup) {
    if !group.isRead { Task { await vm.markRead(group) } }
    let latest = group.latest
    if group.kind == .follow {
      openedUserID = latest.fromUID
      return
    }
    guard let postID = latest.postID, openingPostID == nil else { return }
    openingPostID = postID
    Task {
      let item = await vm.post(id: postID)
      openingPostID = nil
      if let item {
        openedPost = item
      } else {
        vm.message = "Esta publicación ya no está disponible."
      }
    }
  }

  // MARK: Requests

  @ViewBuilder
  private var requestsContent: some View {
    Section {
      FilterChips(options: requestFilterOptions, selection: requestFilter) { requestFilter = $0 }
    }
    .listRowSeparator(.hidden)
    .listRowBackground(SwiftUI.Color.clear)

    if !vm.failedKinds.isEmpty {
      Section {
        HStack {
          Text("No se pudieron cargar algunas solicitudes.")
            .font(.footnote)
            .foregroundStyle(VinctusTokens.Color.textSecondary)
          Spacer()
          Button("Reintentar") { Task { await vm.retryFailedRequests() } }
            .font(.footnote.weight(.semibold))
            .buttonStyle(.borderless)
            .tint(VinctusTokens.Color.accent)
        }
      }
      .listRowSeparator(.hidden)
      .listRowBackground(SwiftUI.Color.clear)
    }

    let visible = vm.requests.filter { requestFilter == nil || $0.kind == requestFilter }
    if !visible.isEmpty {
      Section {
        ForEach(visible) { request in
          RequestRowView(
            request: request,
            isBusy: vm.busyIDs.contains(request.id),
            onOpenProfile: { openedUserID = request.fromUID },
            onAccept: { Task { await vm.accept(request) } },
            onReject: { Task { await vm.reject(request) } }
          )
          .listRowSeparator(.hidden)
          .listRowInsets(EdgeInsets(top: 6, leading: 16, bottom: 6, trailing: 16))
          .listRowBackground(SwiftUI.Color.clear)
        }
      }
    } else if vm.isLoadingRequests {
      Section {
        ForEach(0..<2, id: \.self) { _ in NotificationRowPlaceholder() }
      }
      .listRowSeparator(.hidden)
      .listRowBackground(SwiftUI.Color.clear)
    } else if vm.failedKinds.isEmpty {
      Section {
        EmptyNotice(
          icon: "tray",
          text: requestFilter == nil ? "No tienes solicitudes pendientes." : "No hay solicitudes de este tipo."
        ) { EmptyView() }
      }
      .listRowSeparator(.hidden)
      .listRowBackground(SwiftUI.Color.clear)
    }
  }
}

// MARK: - Rows

/// Up to two people, overlapped, with a small badge that says what happened.
private struct ActorAvatars: View {
  let actors: [ActivityActor]
  let badgeIcon: String
  let badgeColor: SwiftUI.Color
  let badgeForeground: SwiftUI.Color

  var body: some View {
    ZStack(alignment: .bottomTrailing) {
      if actors.count >= 2 {
        ZStack(alignment: .topLeading) {
          DiscoverAvatarView(name: actors[1].name, photoURLString: actors[1].photoURL, size: 32)
            .offset(x: 12, y: 0)
          DiscoverAvatarView(name: actors[0].name, photoURLString: actors[0].photoURL, size: 32)
            .overlay(Circle().stroke(VinctusTokens.Color.background, lineWidth: 2))
            .offset(x: 0, y: 12)
        }
        .frame(width: 44, height: 44, alignment: .topLeading)
      } else {
        DiscoverAvatarView(name: actors.first?.name ?? "Usuario", photoURLString: actors.first?.photoURL, size: 44)
      }
      Image(systemName: badgeIcon)
        .font(.system(size: 9, weight: .bold))
        .foregroundStyle(badgeForeground)
        .frame(width: 18, height: 18)
        .background(Circle().fill(badgeColor))
        .overlay(Circle().stroke(VinctusTokens.Color.background, lineWidth: 2))
        .offset(x: 3, y: 3)
    }
    .frame(width: 44, height: 44)
    .accessibilityHidden(true)
  }
}

private struct ActivityRowView: View {
  let group: ActivityGroup
  let isOpening: Bool

  private var badge: (icon: String, color: SwiftUI.Color, foreground: SwiftUI.Color) {
    switch group.kind {
    case .like: return ("heart.fill", SwiftUI.Color(red: 0.96, green: 0.25, blue: 0.37), .white)
    case .comment: return ("bubble.left.fill", SwiftUI.Color(red: 0.05, green: 0.65, blue: 0.91), .white)
    case .follow: return ("person.fill.badge.plus", VinctusTokens.Color.accent, .black)
    }
  }

  private var sentence: Text {
    let (names, others, action) = NotificationsFeed.parts(group)
    var text = Text(names[0]).fontWeight(.semibold).foregroundStyle(VinctusTokens.Color.textPrimary)
    if names.count > 1 {
      text = text + Text(" y ") + Text(names[1]).fontWeight(.semibold).foregroundStyle(VinctusTokens.Color.textPrimary)
    }
    if others > 0 {
      text = text + Text(" y \(others) \(others == 1 ? "persona más" : "personas más")")
    }
    return text + Text(" \(action) ")
      + Text(NotificationsFeed.timeLabel(group.latest.createdAt)).foregroundStyle(VinctusTokens.Color.textMuted)
  }

  private var detail: String? {
    switch group.kind {
    case .comment: return group.latest.commentText.map { "“\($0)”" }
    case .like: return group.latest.postSnippet
    case .follow: return nil
    }
  }

  var body: some View {
    HStack(alignment: .top, spacing: 12) {
      Circle()
        .fill(group.isRead ? SwiftUI.Color.clear : VinctusTokens.Color.accent)
        .frame(width: 6, height: 6)
        .padding(.top, 19)
        .accessibilityHidden(true)
      ActorAvatars(actors: group.actors, badgeIcon: badge.icon, badgeColor: badge.color, badgeForeground: badge.foreground)
      VStack(alignment: .leading, spacing: 4) {
        sentence
          .font(.subheadline)
          .foregroundStyle(VinctusTokens.Color.textSecondary)
          .fixedSize(horizontal: false, vertical: true)
        if let detail {
          Text(detail)
            .font(.footnote)
            .foregroundStyle(VinctusTokens.Color.textMuted)
            .lineLimit(2)
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(.top, 2)
      if isOpening {
        ProgressView().controlSize(.small).padding(.top, 12)
      }
    }
    .padding(.vertical, 8)
    .contentShape(Rectangle())
    .accessibilityElement(children: .combine)
    .accessibilityLabel(NotificationsFeed.sentence(group))
    .accessibilityValue(group.isRead ? "" : "No leída")
  }
}

private struct RequestRowView: View {
  let request: IncomingRequest
  let isBusy: Bool
  let onOpenProfile: () -> Void
  let onAccept: () -> Void
  let onReject: () -> Void

  private var badge: (icon: String, color: SwiftUI.Color, foreground: SwiftUI.Color) {
    switch request.kind {
    case .followers: return ("person.fill.badge.plus", VinctusTokens.Color.accent, .black)
    case .groups: return ("person.3.fill", SwiftUI.Color(red: 0.55, green: 0.36, blue: 0.96), .white)
    case .collaboration: return ("briefcase.fill", SwiftUI.Color(red: 0.06, green: 0.73, blue: 0.51), .black)
    }
  }

  private var sentence: Text {
    let verb: String
    switch request.kind {
    case .followers: verb = " quiere seguirte"
    case .groups: verb = " quiere unirse a "
    case .collaboration: verb = " quiere colaborar en "
    }
    var text = Text(request.name).fontWeight(.semibold).foregroundStyle(VinctusTokens.Color.textPrimary) + Text(verb)
    if let target = request.target {
      text = text + Text(target).fontWeight(.medium).foregroundStyle(VinctusTokens.Color.textPrimary)
    }
    return text + Text(" " + NotificationsFeed.timeLabel(request.createdAt)).foregroundStyle(VinctusTokens.Color.textMuted)
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      HStack(alignment: .top, spacing: 12) {
        Button(action: onOpenProfile) {
          ActorAvatars(
            actors: [ActivityActor(uid: request.fromUID, name: request.name, photoURL: request.photoURL)],
            badgeIcon: badge.icon,
            badgeColor: badge.color,
            badgeForeground: badge.foreground
          )
        }
        .buttonStyle(.borderless)
        .accessibilityLabel("Ver perfil de \(request.name)")

        VStack(alignment: .leading, spacing: 4) {
          sentence
            .font(.subheadline)
            .foregroundStyle(VinctusTokens.Color.textSecondary)
            .fixedSize(horizontal: false, vertical: true)
          if let username = request.username {
            Text("@\(username)")
              .font(.footnote)
              .foregroundStyle(VinctusTokens.Color.textMuted)
          }
          if let message = request.message {
            Text("“\(message)”")
              .font(.footnote)
              .foregroundStyle(VinctusTokens.Color.textSecondary)
              .padding(.horizontal, 10)
              .padding(.vertical, 8)
              .frame(maxWidth: .infinity, alignment: .leading)
              .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(VinctusTokens.Color.surface2))
              .padding(.top, 4)
          }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
      }

      HStack(spacing: 8) {
        Button(action: onAccept) {
          Text("Aceptar")
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(.black)
            .frame(maxWidth: .infinity, minHeight: 36)
            .background(Capsule().fill(VinctusTokens.Color.accent))
        }
        .buttonStyle(.borderless)
        Button(action: onReject) {
          Text("Rechazar")
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(VinctusTokens.Color.textPrimary)
            .frame(maxWidth: .infinity, minHeight: 36)
            .background(Capsule().fill(VinctusTokens.Color.surface2))
        }
        .buttonStyle(.borderless)
      }
      .padding(.leading, 56)
      .disabled(isBusy)
      .opacity(isBusy ? 0.6 : 1)
    }
    .padding(14)
    .background(
      RoundedRectangle(cornerRadius: VinctusTokens.Radius.lg, style: .continuous)
        .fill(VinctusTokens.Color.surface)
    )
    .overlay(
      RoundedRectangle(cornerRadius: VinctusTokens.Radius.lg, style: .continuous)
        .stroke(VinctusTokens.Color.border.opacity(0.55), lineWidth: 1)
    )
    .accessibilityElement(children: .contain)
    .accessibilityLabel("Solicitud de \(request.name)")
  }
}

/// "Solicitudes pendientes": who is waiting for an answer.
private struct RequestsSummaryRow: View {
  let requests: [IncomingRequest]

  var body: some View {
    HStack(spacing: 12) {
      ActorAvatars(
        actors: requests.prefix(2).map { ActivityActor(uid: $0.fromUID, name: $0.name, photoURL: $0.photoURL) },
        badgeIcon: "tray.full.fill",
        badgeColor: VinctusTokens.Color.accent,
        badgeForeground: .black
      )
      VStack(alignment: .leading, spacing: 2) {
        Text("Solicitudes pendientes")
          .font(.subheadline.weight(.semibold))
          .foregroundStyle(VinctusTokens.Color.textPrimary)
        Text(summary)
          .font(.footnote)
          .foregroundStyle(VinctusTokens.Color.textSecondary)
          .lineLimit(1)
      }
      Spacer(minLength: 8)
      Text("\(requests.count)")
        .font(.caption.weight(.bold))
        .foregroundStyle(.black)
        .padding(.horizontal, 8)
        .frame(minHeight: 22)
        .background(Capsule().fill(VinctusTokens.Color.accent))
      Image(systemName: "chevron.right")
        .font(.footnote.weight(.semibold))
        .foregroundStyle(VinctusTokens.Color.textMuted)
    }
    .padding(14)
    .background(
      RoundedRectangle(cornerRadius: VinctusTokens.Radius.lg, style: .continuous)
        .fill(VinctusTokens.Color.surface)
    )
    .overlay(
      RoundedRectangle(cornerRadius: VinctusTokens.Radius.lg, style: .continuous)
        .stroke(VinctusTokens.Color.border.opacity(0.55), lineWidth: 1)
    )
    .contentShape(Rectangle())
  }

  private var summary: String {
    guard let first = requests.first else { return "" }
    let others = requests.count - 1
    let who = others > 0 ? "\(first.name) y \(others) más" : first.name
    return "\(who) \(requests.count == 1 ? "espera" : "esperan") tu respuesta"
  }
}

/// Horizontal chips for filters, with an optional count.
private struct FilterChips<Value: Hashable>: View {
  let options: [(Value, String, Int?)]
  let selection: Value
  let onSelect: (Value) -> Void

  var body: some View {
    ScrollView(.horizontal, showsIndicators: false) {
      HStack(spacing: 8) {
        ForEach(Array(options.enumerated()), id: \.offset) { _, option in
          let selected = option.0 == selection
          Button {
            onSelect(option.0)
          } label: {
            HStack(spacing: 5) {
              Text(option.1)
              if let count = option.2, count > 0 {
                Text("\(count)").foregroundStyle(selected ? SwiftUI.Color.black.opacity(0.55) : VinctusTokens.Color.textMuted)
              }
            }
            .font(.footnote.weight(.medium))
            .foregroundStyle(selected ? SwiftUI.Color.black : VinctusTokens.Color.textSecondary)
            .padding(.horizontal, 14)
            .frame(height: 32)
            .background(Capsule().fill(selected ? SwiftUI.Color.white : VinctusTokens.Color.surface2))
          }
          .buttonStyle(.borderless)
        }
      }
      .padding(.vertical, 2)
    }
  }
}

private struct NotificationRowPlaceholder: View {
  var body: some View {
    HStack(spacing: 12) {
      Circle().fill(VinctusTokens.Color.surface2).frame(width: 44, height: 44)
      VStack(alignment: .leading, spacing: 8) {
        RoundedRectangle(cornerRadius: 4).fill(VinctusTokens.Color.surface2).frame(height: 11)
        RoundedRectangle(cornerRadius: 4).fill(VinctusTokens.Color.surface2).frame(width: 110, height: 11)
      }
    }
    .padding(.vertical, 8)
    .redacted(reason: .placeholder)
    .accessibilityHidden(true)
  }
}

private struct EmptyNotice<Action: View>: View {
  let icon: String
  let text: String
  @ViewBuilder let action: () -> Action

  var body: some View {
    VStack(spacing: 12) {
      Image(systemName: icon)
        .font(.system(size: 22, weight: .light))
        .foregroundStyle(VinctusTokens.Color.textMuted)
        .frame(width: 56, height: 56)
        .overlay(Circle().stroke(VinctusTokens.Color.border, lineWidth: 1))
      Text(text)
        .font(.subheadline)
        .foregroundStyle(VinctusTokens.Color.textSecondary)
        .multilineTextAlignment(.center)
      action()
    }
    .frame(maxWidth: .infinity)
    .padding(.vertical, 40)
  }
}

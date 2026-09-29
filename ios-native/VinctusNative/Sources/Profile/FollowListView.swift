import SwiftUI

// MARK: - Followers / following

/// Followers and following lists, plus pending follow requests on your own profile, like the
/// web's FollowListPage.
struct FollowListView: View {
  let repo: ProfileContentRepo
  let profileRepo: ProfileRepo
  let userID: String
  let showsRequests: Bool

  @EnvironmentObject private var blockedUsers: BlockedUsersStore
  @State private var kind: FollowListKind
  @State private var users: [ProfileUserSummary] = []
  @State private var nextPage: ProfileListCursor?
  @State private var isLoadingMore = false
  @State private var requests: [IncomingFollowRequest] = []
  @State private var isLoading = true
  @State private var errorMessage: String?

  init(repo: ProfileContentRepo, profileRepo: ProfileRepo, userID: String, initialKind: FollowListKind, showsRequests: Bool) {
    self.repo = repo
    self.profileRepo = profileRepo
    self.userID = userID
    self.showsRequests = showsRequests
    _kind = State(initialValue: initialKind)
  }

  var body: some View {
    List {
      Section {
        Picker("Lista", selection: $kind) {
          ForEach(FollowListKind.allCases) { kind in
            Text(kind.title).tag(kind)
          }
        }
        .pickerStyle(.segmented)
        .listRowBackground(SwiftUI.Color.clear)
      }

      if showsRequests && !requests.isEmpty {
        Section("Solicitudes de seguimiento") {
          ForEach(requests) { request in
            HStack {
              userRow(request.from)
              Spacer()
              Button {
                answer(request, accept: true)
              } label: {
                Image(systemName: "checkmark.circle.fill")
                  .font(.title2)
                  .foregroundStyle(VinctusTokens.Color.accent)
              }
              .buttonStyle(.plain)
              .accessibilityLabel("Aceptar")
              Button {
                answer(request, accept: false)
              } label: {
                Image(systemName: "xmark.circle.fill")
                  .font(.title2)
                  .foregroundStyle(VinctusTokens.Color.textMuted)
              }
              .buttonStyle(.plain)
              .accessibilityLabel("Rechazar")
            }
          }
        }
      }

      Section {
        if isLoading {
          ProgressView()
        } else if let errorMessage {
          Text(errorMessage)
            .foregroundStyle(.red)
        } else if visibleUsers.isEmpty {
          Text(kind == .followers ? "Todavía no hay seguidores." : "Todavía no sigue a nadie.")
            .foregroundStyle(VinctusTokens.Color.textMuted)
        } else {
          ForEach(visibleUsers) { user in
            NavigationLink {
              ProfileView(repo: profileRepo, userID: user.id)
            } label: {
              userRow(user)
            }
          }
          if nextPage != nil {
            LoadMoreButton(isLoading: isLoadingMore) {
              Task { await loadMore() }
            }
          }
        }
      }
    }
    .navigationTitle(kind.title)
    .navigationBarTitleDisplayMode(.inline)
    .task(id: kind) { await load() }
    .task {
      if showsRequests {
        requests = (try? await repo.fetchIncomingFollowRequests()) ?? []
      }
    }
    .refreshable { await load() }
  }

  private var visibleUsers: [ProfileUserSummary] {
    users.filter { !blockedUsers.isBlocked($0.id) }
  }

  private func userRow(_ user: ProfileUserSummary) -> some View {
    HStack(spacing: VinctusTokens.Spacing.sm) {
      AvatarView(name: user.name, photoURLString: user.photoURL, size: 40)
      VStack(alignment: .leading, spacing: 2) {
        Text(user.name)
          .font(.subheadline.weight(.semibold))
        if let username = user.username {
          Text("@\(username)")
            .font(.caption)
            .foregroundStyle(VinctusTokens.Color.textMuted)
        }
      }
    }
  }

  private static let pageSize = 30

  private func load() async {
    isLoading = true
    do {
      let page = try await repo.fetchFollowList(uid: userID, kind: kind, limit: Self.pageSize, after: nil)
      users = page.items
      nextPage = page.next
      errorMessage = nil
    } catch {
      errorMessage = "No se pudo cargar la lista."
    }
    isLoading = false
  }

  private func loadMore() async {
    guard let cursor = nextPage, !isLoadingMore else { return }
    let listKind = kind
    isLoadingMore = true
    defer { isLoadingMore = false }
    do {
      let page = try await repo.fetchFollowList(uid: userID, kind: listKind, limit: Self.pageSize, after: cursor)
      // The user may have switched lists while this page was loading.
      guard listKind == kind else { return }
      let known = Set(users.map(\.id))
      users += page.items.filter { !known.contains($0.id) }
      nextPage = page.next
    } catch {
      errorMessage = "No se pudo cargar más."
    }
  }

  private func answer(_ request: IncomingFollowRequest, accept: Bool) {
    requests.removeAll { $0.id == request.id }
    Task {
      try? await repo.answerFollowRequest(from: request.from.id, accept: accept)
      if accept, kind == .followers {
        await load()
      }
    }
  }
}

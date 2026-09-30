import SwiftUI

// MARK: - Followers / following

/// Followers and following lists, plus pending follow requests on your own profile, like the
/// web's FollowListPage.
struct FollowListView: View {
  let profileRepo: ProfileRepo

  @EnvironmentObject private var blockedUsers: BlockedUsersStore
  @StateObject private var vm: FollowListViewModel

  init(repo: ProfileContentRepo, profileRepo: ProfileRepo, userID: String, initialKind: FollowListKind, showsRequests: Bool) {
    self.profileRepo = profileRepo
    _vm = StateObject(wrappedValue: FollowListViewModel(
      repo: repo,
      userID: userID,
      initialKind: initialKind,
      showsRequests: showsRequests
    ))
  }

  var body: some View {
    List {
      Section {
        Picker("Lista", selection: $vm.kind) {
          ForEach(FollowListKind.allCases) { kind in
            Text(kind.title).tag(kind)
          }
        }
        .pickerStyle(.segmented)
        .listRowBackground(SwiftUI.Color.clear)
      }

      if vm.showsRequests && !vm.requests.isEmpty {
        Section("Solicitudes de seguimiento") {
          ForEach(vm.requests) { request in
            HStack {
              userRow(request.from)
              Spacer()
              Button {
                Task { await vm.answer(request, accept: true) }
              } label: {
                Image(systemName: "checkmark.circle.fill")
                  .font(.title2)
                  .foregroundStyle(VinctusTokens.Color.accent)
              }
              .buttonStyle(.plain)
              .accessibilityLabel("Aceptar")
              Button {
                Task { await vm.answer(request, accept: false) }
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
        if vm.isLoading {
          ProgressView()
        } else if let errorMessage = vm.errorMessage {
          Text(errorMessage)
            .foregroundStyle(.red)
        } else if visibleUsers.isEmpty {
          Text(vm.kind == .followers ? "Todavía no hay seguidores." : "Todavía no sigue a nadie.")
            .foregroundStyle(VinctusTokens.Color.textMuted)
        } else {
          ForEach(visibleUsers) { user in
            NavigationLink {
              ProfileView(repo: profileRepo, userID: user.id)
            } label: {
              userRow(user)
            }
          }
          if vm.hasMore {
            LoadMoreButton(isLoading: vm.isLoadingMore) {
              Task { await vm.loadMore() }
            }
          }
        }
      }
    }
    .navigationTitle(vm.kind.title)
    .navigationBarTitleDisplayMode(.inline)
    .task(id: vm.kind) { await vm.load() }
    .task { await vm.loadRequests() }
    .refreshable { await vm.load() }
  }

  private var visibleUsers: [ProfileUserSummary] {
    vm.users.filter { !blockedUsers.isBlocked($0.id) }
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
}

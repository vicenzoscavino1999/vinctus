import SwiftUI

struct ConnectionsSearchView: View {
  @EnvironmentObject private var authVM: AuthViewModel
  @StateObject private var vm: DiscoverViewModel

  @State private var isCreatePostPresented = false
  @State private var followedUserIDs: Set<String> = []
  @State private var pendingFollowUserIDs: Set<String> = []
  @State private var followActionError: String?

  private let discoverRepo: any DiscoverRepo
  private let profileRepo: ProfileRepo
  private let createPostRepo: any CreatePostRepo

  init(repo: DiscoverRepo, profileRepo: ProfileRepo, createPostRepo: any CreatePostRepo) {
    discoverRepo = repo
    self.profileRepo = profileRepo
    self.createPostRepo = createPostRepo
    _vm = StateObject(wrappedValue: DiscoverViewModel(repo: repo))
  }

  var body: some View {
    List {
      VinctusHeaderBar {
        isCreatePostPresented = true
      }
      .listRowSeparator(.hidden)
      .listRowBackground(SwiftUI.Color.clear)

      Section {
        VStack(alignment: .leading, spacing: VinctusTokens.Spacing.md) {
          Text("Buscar usuarios")
            .font(VinctusTokens.Typography.brandTitle(size: 50))
            .foregroundStyle(VinctusTokens.Color.textPrimary)

          DiscoverUsersSearchField(searchText: $vm.searchText)

          Text(vm.isSearchActive ? "Resultados" : "Usuarios sugeridos")
            .font(.title3.weight(.medium))
            .foregroundStyle(VinctusTokens.Color.textMuted)
            .padding(.top, 2)
        }
      }
      .listRowSeparator(.hidden)
      .listRowBackground(SwiftUI.Color.clear)

      if vm.isInitialLoading, vm.displayedUsers.isEmpty {
        peopleSkeletonRows
      } else if let error = vm.errorMessage {
        VCard {
          VStack(alignment: .leading, spacing: VinctusTokens.Spacing.sm) {
            Text(error)
              .font(.footnote)
              .foregroundStyle(.red)

            VButton("Reintentar", variant: .secondary) {
              vm.retryCurrentState()
            }
          }
        }
        .listRowSeparator(.hidden)
        .listRowBackground(SwiftUI.Color.clear)
      } else if vm.displayedUsers.isEmpty {
        VCard {
          VStack(alignment: .leading, spacing: 6) {
            Text(vm.isSearchActive ? "Sin resultados" : "Aun no hay usuarios sugeridos")
              .font(.headline)
              .foregroundStyle(VinctusTokens.Color.textPrimary)
            Text(
              vm.isSearchActive
                ? "Prueba otro termino de busqueda."
                : "Cuando existan perfiles sugeridos, apareceran aqui."
            )
            .font(.footnote)
            .foregroundStyle(VinctusTokens.Color.textMuted)
          }
        }
        .listRowSeparator(.hidden)
        .listRowBackground(SwiftUI.Color.clear)
      } else {
        VStack(spacing: VinctusTokens.Spacing.sm) {
          ForEach(vm.displayedUsers) { user in
            DiscoverUserFollowCard(
              user: user,
              profileRepo: profileRepo,
              isFollowing: followedUserIDs.contains(user.uid),
              isLoading: pendingFollowUserIDs.contains(user.uid),
              onToggleFollow: { toggleFollow(for: user.uid) }
            )
          }
        }
        .listRowSeparator(.hidden)
        .listRowBackground(SwiftUI.Color.clear)
      }

      if let followActionError {
        VCard {
          Text(followActionError)
            .font(.footnote)
            .foregroundStyle(.red)
        }
        .listRowSeparator(.hidden)
        .listRowBackground(SwiftUI.Color.clear)
      }

      if vm.isSearching {
        HStack(spacing: 10) {
          ProgressView()
            .controlSize(.small)
          Text("Buscando personas…")
            .font(.footnote)
            .foregroundStyle(VinctusTokens.Color.textMuted)
        }
        .frame(maxWidth: .infinity, alignment: .center)
        .listRowSeparator(.hidden)
        .listRowBackground(SwiftUI.Color.clear)
      }
    }
    .listStyle(.plain)
    .toolbar(.hidden, for: .navigationBar)
    .scrollContentBackground(.hidden)
    .background(VinctusTokens.Color.background)
    .overlay(alignment: .top) {
      VTopSafeAreaBackground()
    }
    .onChange(of: vm.searchText) { _, newValue in
      vm.handleSearchTextChange(newValue)
    }
    .navigationDestination(isPresented: $isCreatePostPresented) {
      CreatePostView(repo: createPostRepo)
    }
    .task(id: authVM.currentUserID) {
      await refreshData()
    }
    .refreshable {
      await refreshData()
      if vm.isSearchActive {
        vm.handleSearchTextChange(vm.searchText)
      }
    }
  }

  private func toggleFollow(for uid: String) {
    guard let currentUID = authVM.currentUserID else { return }
    guard !pendingFollowUserIDs.contains(uid) else { return }

    let shouldFollow = !followedUserIDs.contains(uid)
    pendingFollowUserIDs.insert(uid)
    followActionError = nil
    if shouldFollow {
      followedUserIDs.insert(uid)
    } else {
      followedUserIDs.remove(uid)
    }

    Task {
      do {
        try await discoverRepo.setFollowState(
          currentUID: currentUID,
          targetUID: uid,
          isFollowing: shouldFollow
        )
      } catch {
        await MainActor.run {
          if shouldFollow {
            followedUserIDs.remove(uid)
          } else {
            followedUserIDs.insert(uid)
          }
          followActionError = error.localizedDescription
        }
      }

      await MainActor.run {
        pendingFollowUserIDs.remove(uid)
      }
    }
  }

  @ViewBuilder
  private var peopleSkeletonRows: some View {
    ForEach(0..<4, id: \.self) { _ in
      VCard {
        HStack(spacing: VinctusTokens.Spacing.md) {
          Circle()
            .fill(SwiftUI.Color.gray.opacity(0.2))
            .frame(width: 44, height: 44)
          VStack(alignment: .leading, spacing: 6) {
            RoundedRectangle(cornerRadius: 4, style: .continuous)
              .fill(SwiftUI.Color.gray.opacity(0.2))
              .frame(width: 180, height: 14)
            RoundedRectangle(cornerRadius: 4, style: .continuous)
              .fill(SwiftUI.Color.gray.opacity(0.16))
              .frame(width: 120, height: 12)
          }
          Spacer()

          Capsule()
            .fill(SwiftUI.Color.gray.opacity(0.18))
            .frame(width: 114, height: 40)
        }
      }
      .redacted(reason: .placeholder)
      .listRowSeparator(.hidden)
      .listRowBackground(SwiftUI.Color.clear)
    }
  }

  @MainActor
  private func refreshData() async {
    vm.currentUserID = authVM.currentUserID
    await vm.refreshSuggestedUsers()
    await refreshFollowedUsers()
  }

  @MainActor
  private func refreshFollowedUsers() async {
    guard let currentUID = authVM.currentUserID else {
      followedUserIDs = []
      pendingFollowUserIDs = []
      return
    }

    do {
      let ids = try await discoverRepo.fetchFollowedUserIDs(uid: currentUID)
      followedUserIDs = ids
      followActionError = nil
    } catch {
      followActionError = error.localizedDescription
    }
  }
}

struct DiscoverUserRow: View {
  let user: DiscoverUser

  var body: some View {
    HStack(spacing: VinctusTokens.Spacing.md) {
      VAvatarView(name: user.displayName, photoURLString: user.photoURL, size: 44)

      VStack(alignment: .leading, spacing: 3) {
        Text(user.displayName)
          .font(.headline)
          .foregroundStyle(VinctusTokens.Color.textPrimary)

        Text(user.accountVisibility == .private ? "Perfil privado" : "Perfil publico")
          .font(.caption)
          .foregroundStyle(VinctusTokens.Color.textMuted)
      }

      Spacer()

      Image(systemName: "chevron.right")
        .font(.caption)
        .foregroundStyle(VinctusTokens.Color.textMuted.opacity(0.8))
    }
    .padding(.vertical, 2)
  }
}

struct DiscoverUserFollowCard: View {
  let user: DiscoverUser
  let profileRepo: ProfileRepo
  let isFollowing: Bool
  let isLoading: Bool
  let onToggleFollow: () -> Void

  var body: some View {
    VCard {
      HStack(spacing: VinctusTokens.Spacing.md) {
        NavigationLink(destination: ProfileView(repo: profileRepo, userID: user.uid)) {
          HStack(spacing: VinctusTokens.Spacing.md) {
            VAvatarView(name: user.displayName, photoURLString: user.photoURL, size: 52)

            VStack(alignment: .leading, spacing: 4) {
              Text(user.displayName)
                .font(.headline)
                .foregroundStyle(VinctusTokens.Color.textPrimary)
                .lineLimit(1)

              Text("Toca para ver perfil")
                .font(.subheadline)
                .foregroundStyle(VinctusTokens.Color.textMuted)
                .lineLimit(1)
            }
          }
          .contentShape(Rectangle())
        }
        .buttonStyle(.plain)

        Spacer(minLength: VinctusTokens.Spacing.sm)

        Button(action: onToggleFollow) {
          HStack(spacing: 7) {
            if isLoading {
              ProgressView()
                .controlSize(.small)
                .tint(isFollowing ? VinctusTokens.Color.textPrimary : SwiftUI.Color.black)
            } else {
              Image(systemName: isFollowing ? "person.crop.circle.badge.checkmark" : "person.crop.circle.badge.plus")
                .font(.callout.weight(.semibold))
            }
            Text(isFollowing ? "Siguiendo" : "Seguir")
              .font(.headline)
          }
          .foregroundStyle(isFollowing ? VinctusTokens.Color.textPrimary : SwiftUI.Color.black)
          .padding(.horizontal, 16)
          .padding(.vertical, 10)
          .background(isFollowing ? VinctusTokens.Color.surface2 : VinctusTokens.Color.accent)
          .clipShape(Capsule())
          .overlay(
            Capsule()
              .stroke(
                isFollowing ? VinctusTokens.Color.border.opacity(0.9) : SwiftUI.Color.clear,
                lineWidth: 1
              )
          )
        }
        .buttonStyle(.plain)
        .disabled(isLoading)
      }
    }
  }
}

struct DiscoverUsersSearchField: View {
  @Binding var searchText: String

  var body: some View {
    HStack(spacing: 10) {
      TextField("Buscar usuarios...", text: $searchText)
        .textInputAutocapitalization(.never)
        .autocorrectionDisabled()
        .foregroundStyle(VinctusTokens.Color.textPrimary)

      if !searchText.isEmpty {
        Button {
          searchText = ""
        } label: {
          Image(systemName: "xmark.circle.fill")
            .foregroundStyle(VinctusTokens.Color.textMuted.opacity(0.9))
        }
        .buttonStyle(.plain)
      }

      Image(systemName: "magnifyingglass")
        .foregroundStyle(VinctusTokens.Color.textMuted)
    }
    .padding(.horizontal, 14)
    .padding(.vertical, 12)
    .background(VinctusTokens.Color.surface)
    .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
    .overlay(
      RoundedRectangle(cornerRadius: 20, style: .continuous)
        .stroke(VinctusTokens.Color.border.opacity(0.6), lineWidth: 1)
    )
  }
}

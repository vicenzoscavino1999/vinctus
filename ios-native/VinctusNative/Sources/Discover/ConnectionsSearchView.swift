import SwiftUI

struct ConnectionsSearchView: View {
  @EnvironmentObject private var authVM: AuthViewModel
  @EnvironmentObject private var blockedUsers: BlockedUsersStore
  @StateObject private var vm: DiscoverViewModel

  @State private var groups: [GroupSummary] = []
  @State private var openedGroupID: String?
  @State private var isLoadingGroups = false
  @State private var groupsError: String?
  @State private var isShowingCachedGroups = false

  private let profileRepo: ProfileRepo
  private let groupsRepo: any GroupsRepo

  init(repo: DiscoverRepo, profileRepo: ProfileRepo, groupsRepo: any GroupsRepo) {
    self.profileRepo = profileRepo
    self.groupsRepo = groupsRepo
    _vm = StateObject(wrappedValue: DiscoverViewModel(repo: repo))
  }

  var body: some View {
    List {
      Section {
        DiscoverPeopleSearchField(
          searchText: $vm.searchText,
          placeholder: "Buscar amigos o grupos...",
          icon: "magnifyingglass"
        )
      }
      .listRowSeparator(.hidden)
      .listRowBackground(SwiftUI.Color.clear)

      if isShowingCachedGroups {
        HStack(spacing: 8) {
          Image(systemName: "externaldrive.badge.clock")
            .foregroundStyle(VinctusTokens.Color.accent)
          Text("Mostrando grupos desde cache local.")
            .font(.footnote)
            .foregroundStyle(VinctusTokens.Color.textMuted)
        }
        .listRowSeparator(.hidden)
        .listRowBackground(SwiftUI.Color.clear)
      }

      if isLoadingGroups, groups.isEmpty {
        groupSkeletonRows
      } else if let groupsError {
        VCard {
          VStack(alignment: .leading, spacing: VinctusTokens.Spacing.sm) {
            Text(groupsError)
              .font(.footnote)
              .foregroundStyle(.red)

            VButton("Reintentar", variant: .secondary) {
              Task {
                await refreshData()
              }
            }
          }
        }
        .listRowSeparator(.hidden)
        .listRowBackground(SwiftUI.Color.clear)
      } else if filteredGroups.isEmpty, vm.isSearchActive {
        VCard {
          Text("Sin grupos para esa búsqueda.")
            .font(.footnote)
            .foregroundStyle(VinctusTokens.Color.textMuted)
        }
        .listRowSeparator(.hidden)
        .listRowBackground(SwiftUI.Color.clear)
      } else if !filteredGroups.isEmpty {
        Section(vm.isSearchActive ? "Resultados de grupos" : "Grupos recientes") {
          ForEach(filteredGroups.prefix(10)) { group in
            GroupCard(group: group, repo: groupsRepo) {
              openedGroupID = group.id
            }
            .textCase(nil)
            .listRowSeparator(.hidden)
          }
        }
        .textCase(.uppercase)
        .listRowBackground(SwiftUI.Color.clear)
      }

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
            Text(vm.isSearchActive ? "Sin resultados" : "Aún no hay personas recientes")
              .font(.headline)
              .foregroundStyle(VinctusTokens.Color.textPrimary)
            Text(
              vm.isSearchActive
                ? "Prueba otro término de búsqueda."
                : "Cuando existan perfiles recientes, aparecerán aquí."
            )
            .font(.footnote)
            .foregroundStyle(VinctusTokens.Color.textMuted)
          }
        }
        .listRowSeparator(.hidden)
        .listRowBackground(SwiftUI.Color.clear)
      } else {
        Section(vm.isSearchActive ? "Resultados de personas" : "Personas recientes") {
          ForEach(vm.displayedUsers.filter { !blockedUsers.isBlocked($0.uid) }) { user in
            NavigationLink(destination: ProfileView(repo: profileRepo, userID: user.uid)) {
              DiscoverUserRow(user: user)
            }
          }
        }
        .textCase(.uppercase)
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
    .navigationDestination(item: $openedGroupID) { groupID in
      GroupView(repo: groupsRepo, groupID: groupID)
    }
    .toolbar(.hidden, for: .navigationBar)
    .scrollContentBackground(.hidden)
    .background(VinctusTokens.Color.background)
    .onChange(of: vm.searchText) { _, newValue in
      vm.handleSearchTextChange(newValue)
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

  private var normalizedSearchQuery: String {
    vm.searchText.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
  }

  private var filteredGroups: [GroupSummary] {
    guard vm.isSearchActive else { return groups }
    return groups.filter { group in
      group.name.lowercased().contains(normalizedSearchQuery)
        || group.description.lowercased().contains(normalizedSearchQuery)
        || (group.categoryID?.lowercased().contains(normalizedSearchQuery) ?? false)
    }
  }

  @ViewBuilder
  private var groupSkeletonRows: some View {
    ForEach(0..<2, id: \.self) { _ in
      VCard {
        HStack(spacing: VinctusTokens.Spacing.md) {
          RoundedRectangle(cornerRadius: 12, style: .continuous)
            .fill(SwiftUI.Color.gray.opacity(0.2))
            .frame(width: 48, height: 48)
          VStack(alignment: .leading, spacing: 6) {
            RoundedRectangle(cornerRadius: 4, style: .continuous)
              .fill(SwiftUI.Color.gray.opacity(0.2))
              .frame(width: 170, height: 14)
            RoundedRectangle(cornerRadius: 4, style: .continuous)
              .fill(SwiftUI.Color.gray.opacity(0.16))
              .frame(width: 220, height: 12)
          }
          Spacer()
        }
      }
      .redacted(reason: .placeholder)
      .listRowSeparator(.hidden)
      .listRowBackground(SwiftUI.Color.clear)
    }
  }

  @ViewBuilder
  private var peopleSkeletonRows: some View {
    ForEach(0..<4, id: \.self) { _ in
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
    await refreshGroups()
  }

  @MainActor
  private func refreshGroups() async {
    guard !isLoadingGroups else { return }
    isLoadingGroups = true
    groupsError = nil
    defer { isLoadingGroups = false }

    do {
      let page = try await groupsRepo.fetchGroups(limit: 20)
      groups = page.items
      isShowingCachedGroups = page.isFromCache
    } catch {
      groupsError = error.localizedDescription
    }
  }
}

private struct DiscoverUserRow: View {
  let user: DiscoverUser

  var body: some View {
    HStack(spacing: VinctusTokens.Spacing.md) {
      DiscoverAvatarView(name: user.displayName, photoURLString: user.photoURL, size: 44)

      VStack(alignment: .leading, spacing: 3) {
        Text(user.displayName)
          .font(.headline)
          .foregroundStyle(VinctusTokens.Color.textPrimary)

        Text(user.accountVisibility == .private ? "Perfil privado" : "Perfil público")
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

private struct DiscoverPeopleSearchField: View {
  @Binding var searchText: String
  var placeholder: String = "Buscar personas..."
  var icon: String = "person.2"

  var body: some View {
    HStack(spacing: 10) {
      Image(systemName: icon)
        .foregroundStyle(VinctusTokens.Color.textMuted)
      TextField(placeholder, text: $searchText)
        .textInputAutocapitalization(.never)
        .autocorrectionDisabled()
        .foregroundStyle(VinctusTokens.Color.textPrimary)
      if !searchText.isEmpty {
        Button {
          searchText = ""
        } label: {
          Image(systemName: "xmark.circle.fill")
            .foregroundStyle(VinctusTokens.Color.textMuted)
        }
      }
    }
    .padding(.horizontal, 14)
    .padding(.vertical, 10)
    .background(VinctusTokens.Color.surface)
    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    .overlay(
      RoundedRectangle(cornerRadius: 14, style: .continuous)
        .stroke(VinctusTokens.Color.border.opacity(0.6), lineWidth: 1)
    )
  }
}

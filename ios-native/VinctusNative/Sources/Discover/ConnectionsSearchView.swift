import SwiftUI

struct ConnectionsSearchView: View {
  @EnvironmentObject private var authVM: AuthViewModel
  @EnvironmentObject private var blockedUsers: BlockedUsersStore
  @StateObject private var vm: DiscoverViewModel
  @StateObject private var suggestedGroups: GroupSuggestionsViewModel

  @State private var openedGroupID: String?

  private let profileRepo: ProfileRepo
  private let groupsRepo: any GroupsRepo

  init(repo: DiscoverRepo, profileRepo: ProfileRepo, groupsRepo: any GroupsRepo) {
    self.profileRepo = profileRepo
    self.groupsRepo = groupsRepo
    _vm = StateObject(wrappedValue: DiscoverViewModel(repo: repo))
    _suggestedGroups = StateObject(wrappedValue: GroupSuggestionsViewModel(repo: groupsRepo, limit: 50))
  }

  /// Like the web's Search: suggested people first (with a follow button); while searching,
  /// people and then groups.
  var body: some View {
    List {
      Section {
        VStack(alignment: .leading, spacing: VinctusTokens.Spacing.md) {
          Text("Buscar")
            .font(VinctusTokens.Typography.serif(30))
            .foregroundStyle(VinctusTokens.Color.textPrimary)
          DiscoverPeopleSearchField(
            searchText: $vm.searchText,
            placeholder: "Buscar personas o grupos",
            icon: "magnifyingglass"
          )
          if trimmedSearchLength == 1 {
            Text("Escribe al menos 2 letras para buscar.")
              .font(.caption)
              .foregroundStyle(VinctusTokens.Color.textMuted)
          }
        }
        .padding(.top, 8)
      }
      .listRowSeparator(.hidden)
      .listRowBackground(SwiftUI.Color.clear)

      peopleSection

      if vm.isSearchActive {
        groupsSection
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
      if authVM.currentUserID == nil && !AppRepos.isDemo {
        vm.reset()
        suggestedGroups.reset()
        return
      }
      await refreshData()
    }
    .refreshable {
      if vm.isSearchActive {
        vm.currentUserID = authVM.currentUserID
        await vm.refreshSearchNow()
        await suggestedGroups.refresh()
      } else {
        await refreshData()
      }
    }
  }

  // MARK: People

  @ViewBuilder
  private var peopleSection: some View {
    if vm.isInitialLoading, visibleDisplayedUsers.isEmpty {
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
    } else if vm.isSearching, visibleDisplayedUsers.isEmpty {
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
    } else if visibleDisplayedUsers.isEmpty {
      // While searching, groups may still match: say nothing here, the groups section answers.
      if !vm.isSearchActive {
        sectionMessage("Aún no hay personas recientes. Cuando existan perfiles, aparecerán aquí.")
      } else if filteredGroups.isEmpty, !suggestedGroups.isLoading {
        sectionMessage("No hay resultados. Prueba otro término de búsqueda.")
      }
    } else {
      Section {
        ForEach(visibleDisplayedUsers) { user in
          SearchPersonRow(user: user, profileRepo: profileRepo)
            .listRowSeparator(.hidden)
            .listRowInsets(EdgeInsets(top: 4, leading: 16, bottom: 4, trailing: 16))
            .listRowBackground(SwiftUI.Color.clear)
        }
      } header: {
        sectionHeader(vm.isSearchActive ? "Personas" : "Personas sugeridas")
      }
    }
  }

  // MARK: Groups

  @ViewBuilder
  private var groupsSection: some View {
    if suggestedGroups.isLoading, suggestedGroups.groups.isEmpty {
      groupSkeletonRows
    } else if let groupsError = suggestedGroups.errorMessage {
      VCard {
        VStack(alignment: .leading, spacing: VinctusTokens.Spacing.sm) {
          Text(groupsError)
            .font(.footnote)
            .foregroundStyle(.red)
          VButton("Reintentar", variant: .secondary) {
            Task { await refreshData() }
          }
        }
      }
      .listRowSeparator(.hidden)
      .listRowBackground(SwiftUI.Color.clear)
    } else if !filteredGroups.isEmpty {
      Section {
        if suggestedGroups.isShowingCachedData {
          Label("Mostrando grupos desde cache local.", systemImage: "externaldrive.badge.clock")
            .font(.footnote)
            .foregroundStyle(VinctusTokens.Color.textMuted)
            .listRowSeparator(.hidden)
            .listRowBackground(SwiftUI.Color.clear)
        }
        ForEach(filteredGroups.prefix(10)) { group in
          GroupCard(group: group, repo: groupsRepo) {
            openedGroupID = group.id
          }
          .listRowSeparator(.hidden)
          .listRowBackground(SwiftUI.Color.clear)
        }
      } header: {
        sectionHeader("Grupos")
      }
    }
  }

  private func sectionHeader(_ title: String) -> some View {
    Text(title.uppercased())
      .font(.caption.weight(.semibold))
      .tracking(1.6)
      .foregroundStyle(VinctusTokens.Color.textMuted)
      .padding(.top, 8)
  }

  private func sectionMessage(_ text: String) -> some View {
    Text(text)
      .font(.footnote)
      .foregroundStyle(VinctusTokens.Color.textMuted)
      .frame(maxWidth: .infinity, alignment: .center)
      .multilineTextAlignment(.center)
      .padding(.vertical, 24)
      .listRowSeparator(.hidden)
      .listRowBackground(SwiftUI.Color.clear)
  }

  private var trimmedSearchLength: Int {
    vm.searchText.trimmingCharacters(in: .whitespacesAndNewlines).count
  }

  private var visibleDisplayedUsers: [DiscoverUser] {
    vm.displayedUsers.filter { !blockedUsers.isBlocked($0.uid) }
  }

  /// Short queries (under two letters) show every group, like the people search.
  private var filteredGroups: [GroupSummary] {
    suggestedGroups.filtered(by: vm.isSearchActive ? vm.searchText : "")
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
    await suggestedGroups.refresh()
  }
}

/// A person: photo, name, "Cuenta privada" when it is, and a compact follow button. Tapping the
/// row (outside the button) opens the profile; a hidden link avoids List's disclosure arrow.
private struct SearchPersonRow: View {
  let user: DiscoverUser
  let profileRepo: ProfileRepo

  var body: some View {
    HStack(spacing: VinctusTokens.Spacing.md) {
      DiscoverAvatarView(name: user.displayName, photoURLString: user.photoURL, size: 44)

      VStack(alignment: .leading, spacing: 3) {
        Text(user.displayName)
          .font(.subheadline.weight(.semibold))
          .foregroundStyle(VinctusTokens.Color.textPrimary)
          .lineLimit(1)
        if user.accountVisibility == .private {
          Label("Cuenta privada", systemImage: "lock")
            .font(.caption)
            .foregroundStyle(VinctusTokens.Color.textMuted)
        }
      }

      Spacer(minLength: 8)

      FollowButton(targetUID: user.uid, isPrivate: user.accountVisibility == .private, compact: true)
    }
    .padding(.horizontal, 14)
    .padding(.vertical, 10)
    .background(
      RoundedRectangle(cornerRadius: VinctusTokens.Radius.lg, style: .continuous)
        .fill(VinctusTokens.Color.surface)
    )
    .background(
      NavigationLink(destination: ProfileView(repo: profileRepo, userID: user.uid)) { EmptyView() }
        .opacity(0)
    )
    .contentShape(Rectangle())
    .accessibilityElement(children: .contain)
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
        .accessibilityLabel("Borrar búsqueda")
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

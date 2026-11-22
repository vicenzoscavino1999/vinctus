import SwiftUI

/// All groups, as web-style cards.
struct GroupsListView: View {
  @StateObject private var vm: GroupsListViewModel
  @State private var searchQuery = ""
  @State private var openedGroupID: String?

  private let repo: any GroupsRepo

  init(repo: any GroupsRepo) {
    self.repo = repo
    _vm = StateObject(wrappedValue: GroupsListViewModel(repo: repo))
  }

  private var filteredGroups: [GroupSummary] {
    let needle = DiscoverCategory.normalizedSearch(searchQuery)
    guard !needle.isEmpty else { return vm.groups }
    return vm.groups.filter { group in
      DiscoverCategory.normalizedSearch(group.name).contains(needle)
        || DiscoverCategory.normalizedSearch(group.description).contains(needle)
        || (group.categoryID.map {
          DiscoverCategory.normalizedSearch($0).contains(needle)
            || DiscoverCategory.normalizedSearch(InterestCategory.title(for: $0)).contains(needle)
        } ?? false)
    }
  }

  var body: some View {
    ScrollView {
      LazyVStack(alignment: .leading, spacing: 16) {
        (Text("Todos los ").foregroundStyle(VinctusTokens.Color.textSecondary)
          + Text("grupos").foregroundStyle(VinctusTokens.Color.textPrimary))
          .font(VinctusTokens.Typography.serif(26))
          .padding(.top, 8)

        HStack(spacing: 10) {
          Image(systemName: "magnifyingglass")
            .foregroundStyle(VinctusTokens.Color.textMuted)
          TextField("Buscar grupos...", text: $searchQuery)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
            .foregroundStyle(VinctusTokens.Color.textPrimary)
          if !searchQuery.isEmpty {
            Button {
              searchQuery = ""
            } label: {
              Image(systemName: "xmark.circle.fill")
                .foregroundStyle(VinctusTokens.Color.textMuted)
            }
            .accessibilityLabel("Borrar búsqueda")
          }
        }
        .padding(.horizontal, 14)
        .frame(height: 44)
        .background(VinctusTokens.Color.surface)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(
          RoundedRectangle(cornerRadius: 12, style: .continuous)
            .stroke(VinctusTokens.Color.border.opacity(0.6), lineWidth: 1)
        )

        if vm.isShowingCachedData {
          Label("Mostrando grupos guardados en el teléfono.", systemImage: "externaldrive.badge.clock")
            .font(.footnote)
            .foregroundStyle(VinctusTokens.Color.textMuted)
        }

        if vm.isLoading, vm.groups.isEmpty {
          ProgressView()
            .frame(maxWidth: .infinity)
            .padding(.vertical, 40)
        } else if vm.groups.isEmpty, let error = vm.errorMessage {
          VStack(alignment: .leading, spacing: 10) {
            Text(error)
              .font(.footnote)
              .foregroundStyle(.red)
            VButton("Reintentar", variant: .secondary) {
              Task { await vm.refresh() }
            }
          }
        } else if filteredGroups.isEmpty {
          Text(
            searchQuery.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
              ? "Aún no hay grupos disponibles."
              : "Sin grupos para esa búsqueda."
          )
            .foregroundStyle(VinctusTokens.Color.textMuted)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 40)
        } else {
          ForEach(filteredGroups) { group in
            GroupCard(group: group, repo: repo) {
              openedGroupID = group.id
            }
          }
        }
      }
      .padding(.horizontal, 16)
      .padding(.bottom, 24)
    }
    .background(VinctusTokens.Color.background)
    .navigationTitle("Grupos")
    .navigationBarTitleDisplayMode(.inline)
    .navigationDestination(item: $openedGroupID) { groupID in
      GroupView(repo: repo, groupID: groupID)
    }
    .task { await vm.refresh() }
    .refreshable { await vm.refresh() }
  }
}

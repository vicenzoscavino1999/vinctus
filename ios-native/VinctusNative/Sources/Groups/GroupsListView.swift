import SwiftUI

/// All groups, as web-style cards.
struct GroupsListView: View {
  @StateObject private var vm: GroupsListViewModel
  @State private var openedGroupID: String?

  private let repo: any GroupsRepo

  init(repo: any GroupsRepo) {
    self.repo = repo
    _vm = StateObject(wrappedValue: GroupsListViewModel(repo: repo))
  }

  var body: some View {
    ScrollView {
      LazyVStack(alignment: .leading, spacing: 16) {
        (Text("Todos los ").foregroundStyle(VinctusTokens.Color.textSecondary)
          + Text("grupos").foregroundStyle(VinctusTokens.Color.textPrimary))
          .font(VinctusTokens.Typography.serif(26))
          .padding(.top, 8)

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
        } else if vm.groups.isEmpty {
          Text("Aún no hay grupos disponibles.")
            .foregroundStyle(VinctusTokens.Color.textMuted)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 40)
        } else {
          ForEach(vm.groups) { group in
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

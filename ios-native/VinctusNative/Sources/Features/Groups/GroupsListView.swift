import SwiftUI

struct GroupsListView: View {
  @StateObject private var vm: GroupsListViewModel
  @State private var isCreatePostPresented = false

  private let repo: any GroupsRepo
  private let createPostRepo: any CreatePostRepo

  init(repo: any GroupsRepo, createPostRepo: any CreatePostRepo = FirebaseCreatePostRepo()) {
    self.repo = repo
    self.createPostRepo = createPostRepo
    _vm = StateObject(wrappedValue: GroupsListViewModel(repo: repo))
  }

  var body: some View {
    List {
      VinctusHeaderBar {
        isCreatePostPresented = true
      }
      .listRowSeparator(.hidden)
      .listRowBackground(SwiftUI.Color.clear)

      VStack(alignment: .leading, spacing: 8) {
        Text("Conexiones")
          .font(VinctusTokens.Typography.brandTitle(size: 40))
          .foregroundStyle(VinctusTokens.Color.textPrimary)

        Text("Conecta. Colabora. Encuentra.")
          .font(.subheadline)
          .foregroundStyle(VinctusTokens.Color.textMuted)
      }
      .listRowSeparator(.hidden)
      .listRowBackground(SwiftUI.Color.clear)

      ConnectionsPublishButton(title: "+ PUBLICAR PROYECTO") {
        isCreatePostPresented = true
      }
      .listRowSeparator(.hidden)
      .listRowBackground(SwiftUI.Color.clear)

      if vm.isLoading, vm.groups.isEmpty {
        ConnectionsCollaborationsSkeletonSection()
        ConnectionsEncountersSkeletonSection()
      } else if vm.groups.isEmpty, let error = vm.errorMessage {
        VCard {
          VStack(alignment: .leading, spacing: VinctusTokens.Spacing.sm) {
            Text("No se pudo cargar conexiones")
              .font(.headline)
              .foregroundStyle(VinctusTokens.Color.textPrimary)

            Text(error)
              .font(.footnote)
              .foregroundStyle(VinctusTokens.Color.textMuted)

            VButton("Reintentar", variant: .secondary) {
              Task {
                await vm.refresh()
              }
            }
          }
        }
        .listRowSeparator(.hidden)
        .listRowBackground(SwiftUI.Color.clear)
      } else if vm.groups.isEmpty {
        VCard {
          VStack(alignment: .leading, spacing: 6) {
            Text("Aun no hay colaboraciones")
              .font(.headline)
              .foregroundStyle(VinctusTokens.Color.textPrimary)

            Text("Cuando existan grupos disponibles apareceran aqui.")
              .font(.footnote)
              .foregroundStyle(VinctusTokens.Color.textMuted)
          }
        }
        .listRowSeparator(.hidden)
        .listRowBackground(SwiftUI.Color.clear)
      } else {
        if vm.isShowingCachedData {
          HStack(spacing: 8) {
            Image(systemName: "externaldrive.badge.clock")
              .foregroundStyle(VinctusTokens.Color.accent)
            Text("Mostrando datos desde cache local.")
              .font(.footnote)
              .foregroundStyle(VinctusTokens.Color.textMuted)
          }
          .listRowSeparator(.hidden)
          .listRowBackground(SwiftUI.Color.clear)
        }

        Text("Colaboraciones")
          .font(VinctusTokens.Typography.sectionTitle(size: 26))
          .foregroundStyle(VinctusTokens.Color.textPrimary)
          .listRowSeparator(.hidden)
          .listRowBackground(SwiftUI.Color.clear)

        ForEach(collaborationGroups) { group in
          NavigationLink(destination: GroupView(repo: repo, groupID: group.id)) {
            ConnectionsCollaborationCard(
              group: group,
              recencyLabel: recencyLabel(for: group.updatedAt),
              locationLabel: locationLabel(for: group)
            )
          }
          .buttonStyle(.plain)
          .listRowSeparator(.hidden)
          .listRowBackground(SwiftUI.Color.clear)
        }

        Text("Encuentros")
          .font(VinctusTokens.Typography.sectionTitle(size: 26))
          .foregroundStyle(VinctusTokens.Color.textPrimary)
          .listRowSeparator(.hidden)
          .listRowBackground(SwiftUI.Color.clear)

        ConnectionsPublishButton(title: "+ PUBLICAR ENCUENTRO") {
          isCreatePostPresented = true
        }
        .listRowSeparator(.hidden)
        .listRowBackground(SwiftUI.Color.clear)

        ScrollView(.horizontal, showsIndicators: false) {
          HStack(spacing: VinctusTokens.Spacing.md) {
            ForEach(encounterGroups) { group in
              NavigationLink(destination: GroupView(repo: repo, groupID: group.id)) {
                ConnectionsEncounterCard(group: group, locationLabel: locationLabel(for: group))
              }
              .buttonStyle(.plain)
            }
          }
          .padding(.horizontal, 1)
          .padding(.vertical, 2)
        }
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
    .navigationDestination(isPresented: $isCreatePostPresented) {
      CreatePostView(repo: createPostRepo)
    }
    .task {
      await vm.refresh()
    }
    .refreshable {
      await vm.refresh()
    }
  }

  private var collaborationGroups: [GroupSummary] {
    Array(vm.groups.prefix(3))
  }

  private var encounterGroups: [GroupSummary] {
    Array(vm.groups.prefix(8))
  }

  private func recencyLabel(for date: Date) -> String {
    let elapsed = max(Int(Date().timeIntervalSince(date)), 0)
    if elapsed >= 24 * 60 * 60 {
      return "Hace \(elapsed / (24 * 60 * 60)) d"
    }
    if elapsed >= 60 * 60 {
      return "Hace \(elapsed / (60 * 60)) h"
    }
    if elapsed >= 60 {
      return "Hace \(elapsed / 60) min"
    }
    return "Ahora"
  }

  private func locationLabel(for group: GroupSummary) -> String {
    if let category = group.categoryID?.trimmingCharacters(in: .whitespacesAndNewlines), !category.isEmpty {
      return category.replacingOccurrences(of: "_", with: " ").capitalized
    }
    return "Sin ubicacion"
  }
}

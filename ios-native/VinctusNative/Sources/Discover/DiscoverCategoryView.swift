import SwiftUI

struct DiscoverCategoryView: View {
  @EnvironmentObject private var blockedUsers: BlockedUsersStore
  @Environment(\.openURL) private var openURL
  @StateObject private var vm: DiscoverCategoryViewModel
  @State private var openedGroupID: String?

  private let groupsRepo: any GroupsRepo

  init(
    category: DiscoverCategory,
    discoverRepo: DiscoverRepo,
    groupsRepo: any GroupsRepo,
    profileContentRepo: ProfileContentRepo
  ) {
    self.groupsRepo = groupsRepo
    _vm = StateObject(
      wrappedValue: DiscoverCategoryViewModel(
        category: category,
        repo: discoverRepo,
        profileContentRepo: profileContentRepo
      )
    )
  }

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: VinctusTokens.Spacing.lg) {
        header

        Picker("Sección", selection: $vm.selectedTab) {
          ForEach(DiscoverCategoryViewModel.Tab.allCases) { tab in
            Text(tab.title).tag(tab)
          }
        }
        .pickerStyle(.segmented)

        switch vm.selectedTab {
        case .live:
          liveSection
        case .groups:
          groupsSection
        case .library:
          librarySection
        }
      }
      .padding(16)
    }
    .background(VinctusTokens.Color.background)
    .navigationTitle(vm.category.title)
    .navigationBarTitleDisplayMode(.inline)
    .navigationDestination(item: $openedGroupID) { groupID in
      GroupView(repo: groupsRepo, groupID: groupID)
    }
    .task(id: vm.category.id) {
      // Screenshot builds open a tab with `-VinctusCategoryTab groups|library`.
      if let tab = AppRepos.demoArgument("-VinctusCategoryTab").flatMap(DiscoverCategoryViewModel.Tab.init(rawValue:)) {
        vm.selectedTab = tab
      }
      await vm.load()
    }
    .task(id: vm.selectedTab) {
      await vm.loadSelectedTabIfNeeded()
    }
    .refreshable {
      await vm.refresh()
    }
  }

  /// The icon and Seguir, then the title in the display serif and the description, like the web.
  private var header: some View {
    VStack(alignment: .leading, spacing: 12) {
      HStack(alignment: .center) {
        Image(systemName: vm.category.icon)
          .font(.system(size: 24, weight: .regular))
          .foregroundStyle(VinctusTokens.Color.accent)
          .frame(width: 56, height: 56)
          .background(VinctusTokens.Color.surface, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
          .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
              .stroke(VinctusTokens.Color.border.opacity(0.7), lineWidth: 0.5)
          )
          .accessibilityHidden(true)
        Spacer()
        followButton
      }
      Text(vm.category.title)
        .font(VinctusTokens.Typography.serif(32))
        .foregroundStyle(VinctusTokens.Color.textPrimary)
        .padding(.top, 4)
      Text(vm.category.subtitle)
        .font(.subheadline)
        .foregroundStyle(VinctusTokens.Color.textSecondary)
      if let followError = vm.followError {
        Text(followError)
          .font(.caption)
          .foregroundStyle(.red)
      }
    }
  }

  private var followButton: some View {
    Button {
      Task { await vm.toggleFollow() }
    } label: {
      Label(vm.isFollowed ? "Siguiendo" : "Seguir", systemImage: vm.isFollowed ? "checkmark" : "plus")
        .font(.subheadline.weight(.semibold))
        .foregroundStyle(vm.isFollowed ? VinctusTokens.Color.textPrimary : SwiftUI.Color.black)
        .padding(.horizontal, 16)
        .frame(height: 36)
        .background(vm.isFollowed ? SwiftUI.Color.clear : VinctusTokens.Color.accent, in: Capsule())
        .overlay(Capsule().stroke(vm.isFollowed ? VinctusTokens.Color.border : SwiftUI.Color.clear, lineWidth: 1))
    }
    .buttonStyle(.plain)
    .disabled(vm.isUpdatingFollow)
    .accessibilityLabel(vm.isFollowed ? "Siguiendo" : "Seguir categoría")
  }

  private func icon(for type: ContributionType) -> String {
    switch type {
    case .project: return "folder"
    case .paper: return "doc.text"
    case .cv: return "graduationcap"
    case .certificate: return "rosette"
    case .other: return "doc"
    }
  }

  @ViewBuilder
  private var liveSection: some View {
    ScrollView(.horizontal, showsIndicators: false) {
      HStack(spacing: 8) {
        ForEach(vm.category.subgroups) { subgroup in
          let isSelected = vm.selectedSubgroupID == subgroup.id
          Button {
            Task { await vm.selectSubgroup(subgroup.id) }
          } label: {
            Text(subgroup.name)
              .font(.caption.weight(.semibold))
              .padding(.horizontal, 14)
              .padding(.vertical, 8)
              .background(isSelected ? VinctusTokens.Color.textPrimary : VinctusTokens.Color.surface)
              .foregroundStyle(isSelected ? VinctusTokens.Color.background : VinctusTokens.Color.textMuted)
              .clipShape(Capsule())
              .overlay(
                Capsule().stroke(
                  isSelected ? VinctusTokens.Color.textPrimary : VinctusTokens.Color.border,
                  lineWidth: 1
                )
              )
          }
          .buttonStyle(.plain)
        }
      }
      .padding(.vertical, 2)
    }

    if vm.isLoadingLive {
      ProgressView("Cargando contenido en vivo…")
        .frame(maxWidth: .infinity)
        .padding(.vertical, 32)
    } else if let error = vm.liveError {
      VCard {
        VStack(alignment: .leading, spacing: 10) {
          Text(error)
            .font(.footnote)
            .foregroundStyle(.red)
          VButton("Reintentar", variant: .secondary) {
            Task { await vm.loadLive() }
          }
        }
      }
    } else if vm.liveItems.isEmpty {
      VCard {
        Text("Sin contenido disponible para este tema ahora mismo.")
          .font(.footnote)
          .foregroundStyle(VinctusTokens.Color.textMuted)
      }
    } else {
      LazyVStack(spacing: VinctusTokens.Spacing.sm) {
        ForEach(vm.liveItems) { item in
          Button {
            if let linkURL = item.linkURL {
              openURL(linkURL)
            }
          } label: {
            VCard {
              VStack(alignment: .leading, spacing: 8) {
                HStack {
                  Text(item.badge.uppercased())
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(VinctusTokens.Color.accent)
                  Spacer()
                  if item.linkURL != nil {
                    Image(systemName: "arrow.up.right.square")
                      .font(.caption)
                      .foregroundStyle(VinctusTokens.Color.textMuted)
                  }
                }

                Text(item.title)
                  .font(.headline)
                  .foregroundStyle(VinctusTokens.Color.textPrimary)
                  .multilineTextAlignment(.leading)

                if !item.subtitle.isEmpty {
                  Text(item.subtitle)
                    .font(.footnote)
                    .foregroundStyle(VinctusTokens.Color.textMuted)
                    .lineLimit(3)
                    .multilineTextAlignment(.leading)
                }

                Text(item.meta)
                  .font(.caption)
                  .foregroundStyle(VinctusTokens.Color.textSecondary)
              }
            }
          }
          .buttonStyle(.plain)
          .disabled(item.linkURL == nil)
        }
      }
    }
  }

  @ViewBuilder
  private var groupsSection: some View {
    if vm.isLoadingGroups {
      ProgressView("Cargando comunidades…")
        .frame(maxWidth: .infinity)
        .padding(.vertical, 32)
    } else if let error = vm.groupsError {
      VCard {
        VStack(alignment: .leading, spacing: 10) {
          Text(error)
            .font(.footnote)
            .foregroundStyle(.red)
          VButton("Reintentar", variant: .secondary) {
            Task { await vm.loadGroups() }
          }
        }
      }
    } else if vm.groups.isEmpty {
      VCard {
        Text("Aún no hay comunidades en esta categoría.")
          .font(.footnote)
          .foregroundStyle(VinctusTokens.Color.textMuted)
      }
    } else {
      LazyVStack(spacing: VinctusTokens.Spacing.sm) {
        ForEach(vm.groups) { group in
          GroupCard(group: group, repo: groupsRepo) {
            openedGroupID = group.id
          }
        }
      }
    }
  }

  private var visibleLibraryItems: [DiscoverLibraryItem] {
    vm.libraryItems.filter { !blockedUsers.isBlocked($0.userID) }
  }

  @ViewBuilder
  private var librarySection: some View {
    if vm.isLoadingLibrary {
      ProgressView("Cargando biblioteca…")
        .frame(maxWidth: .infinity)
        .padding(.vertical, 32)
    } else if let error = vm.libraryError {
      VCard {
        VStack(alignment: .leading, spacing: 10) {
          Text(error)
            .font(.footnote)
            .foregroundStyle(.red)
          VButton("Reintentar", variant: .secondary) {
            Task { await vm.loadLibrary() }
          }
        }
      }
    } else if visibleLibraryItems.isEmpty {
      VCard {
        Text("No hay documentos archivados en esta categoría aún.")
          .font(.footnote)
          .foregroundStyle(VinctusTokens.Color.textMuted)
      }
    } else {
      LazyVStack(spacing: VinctusTokens.Spacing.sm) {
        ForEach(visibleLibraryItems) { item in
          VCard {
            VStack(alignment: .leading, spacing: 8) {
              HStack {
                Label(item.type.title, systemImage: icon(for: item.type))
                  .font(.caption.weight(.semibold))
                  .foregroundStyle(VinctusTokens.Color.accent)
                Spacer()
                HStack(spacing: 6) {
                  AvatarView(name: item.authorName, photoURLString: nil, size: 20)
                  Text(item.authorName)
                    .font(.caption)
                    .foregroundStyle(VinctusTokens.Color.textMuted)
                    .lineLimit(1)
                }
              }

              Text(item.title)
                .font(VinctusTokens.Typography.serif(19))
                .foregroundStyle(VinctusTokens.Color.textPrimary)

              if let description = item.description {
                Text(description)
                  .font(.footnote)
                  .foregroundStyle(VinctusTokens.Color.textMuted)
              }

              HStack(spacing: 10) {
                if let linkURL = item.linkURL {
                  Button {
                    openURL(linkURL)
                  } label: {
                    Label("Ver enlace", systemImage: "link")
                      .font(.caption.weight(.semibold))
                      .padding(.horizontal, 12)
                      .padding(.vertical, 6)
                      .background(VinctusTokens.Color.surface2)
                      .foregroundStyle(VinctusTokens.Color.textPrimary)
                      .clipShape(Capsule())
                  }
                  .buttonStyle(.plain)
                }

                if let fileURL = item.fileURL {
                  Button {
                    openURL(fileURL)
                  } label: {
                    Label(item.fileName ?? "Ver PDF", systemImage: "doc.text")
                      .font(.caption.weight(.semibold))
                      .padding(.horizontal, 12)
                      .padding(.vertical, 6)
                      .background(VinctusTokens.Color.surface2)
                      .foregroundStyle(VinctusTokens.Color.textPrimary)
                      .clipShape(Capsule())
                  }
                  .buttonStyle(.plain)
                }
              }
            }
          }
        }
      }
    }
  }
}

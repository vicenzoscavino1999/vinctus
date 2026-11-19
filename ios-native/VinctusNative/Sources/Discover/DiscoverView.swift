import SwiftUI

struct DiscoverTrend: Identifiable {
  let id: String
  let category: DiscoverCategory
  let icon: String
  let title: String
  let subtitle: String
  let rankLabel: String
  let scoreLabel: String
  let signalLabel: String
  let groupsLabel: String
  let tags: [String]
}

struct DiscoverView: View {
  @EnvironmentObject private var authVM: AuthViewModel
  @EnvironmentObject private var blockedUsers: BlockedUsersStore
  @StateObject private var vm: DiscoverViewModel
  @StateObject private var suggestedGroups: GroupSuggestionsViewModel

  @State private var discoverQuery = ""
  @State private var openedGroupID: String?

  private let discoverRepo: DiscoverRepo
  private let profileRepo: ProfileRepo
  private let groupsRepo: any GroupsRepo
  private let aiRepo: AIRepo
  private let profileContentRepo: ProfileContentRepo

  init(
    repo: DiscoverRepo,
    profileRepo: ProfileRepo,
    groupsRepo: any GroupsRepo,
    aiRepo: AIRepo,
    profileContentRepo: ProfileContentRepo = AppRepos.profileContent()
  ) {
    self.discoverRepo = repo
    self.profileRepo = profileRepo
    self.groupsRepo = groupsRepo
    self.aiRepo = aiRepo
    self.profileContentRepo = profileContentRepo
    _vm = StateObject(wrappedValue: DiscoverViewModel(repo: repo))
    _suggestedGroups = StateObject(wrappedValue: GroupSuggestionsViewModel(repo: groupsRepo, limit: 50))
  }

  var body: some View {
    List {
      Section {
        DiscoverCurationHero(searchText: $discoverQuery)
      }
      .listRowSeparator(.hidden)
      .listRowBackground(SwiftUI.Color.clear)

      Section {
        // A hidden link keeps List from adding its own disclosure arrow next to the card's.
        DiscoverAIPromoCard()
          .background(
            NavigationLink(destination: AIHubView(repo: aiRepo)) { EmptyView() }
              .opacity(0)
          )
      }
      .listRowSeparator(.hidden)
      .listRowBackground(SwiftUI.Color.clear)

      if let peopleError = vm.errorMessage, visibleSuggestedUsers.isEmpty {
        Section {
          DiscoverSectionHeader(title: "Personas para conocer")
          VCard {
            VStack(alignment: .leading, spacing: 10) {
              Text(peopleError)
                .font(.footnote)
                .foregroundStyle(.red)
              VButton("Reintentar", variant: .secondary) {
                Task { await vm.refreshSuggestedUsers() }
              }
            }
          }
        }
        .listRowSeparator(.hidden)
        .listRowBackground(SwiftUI.Color.clear)
      } else if !visibleSuggestedUsers.isEmpty {
        Section {
          DiscoverSectionHeader(title: "Personas para conocer")
          ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: VinctusTokens.Spacing.md) {
              ForEach(Array(visibleSuggestedUsers.prefix(12))) { user in
                NavigationLink(destination: ProfileView(repo: profileRepo, userID: user.uid)) {
                  DiscoverStoryChip(user: user)
                }
                .buttonStyle(.plain)
              }
            }
            .padding(.vertical, 4)
          }
        }
        .listRowSeparator(.hidden)
        .listRowBackground(SwiftUI.Color.clear)
      }

      Section {
        VStack(alignment: .leading, spacing: VinctusTokens.Spacing.md) {
          DiscoverSectionHeader(title: "Tendencias esta semana")

          if filteredTrends.isEmpty {
            VCard {
              Text("No hay tendencias para ese término. Prueba otro filtro.")
                .font(.footnote)
                .foregroundStyle(VinctusTokens.Color.textMuted)
            }
          } else {
            ScrollView(.horizontal, showsIndicators: false) {
              HStack(spacing: VinctusTokens.Spacing.md) {
                ForEach(filteredTrends) { trend in
                  NavigationLink(
                    destination: DiscoverCategoryView(
                      category: trend.category,
                      discoverRepo: discoverRepo,
                      groupsRepo: groupsRepo,
                      profileContentRepo: profileContentRepo
                    )
                  ) {
                    DiscoverTrendCard(trend: trend)
                  }
                  .buttonStyle(.plain)
                }
              }
              .padding(.vertical, 4)
            }
          }
        }
      }
      .listRowSeparator(.hidden)
      .listRowBackground(SwiftUI.Color.clear)

      Section {
        HStack(alignment: .firstTextBaseline) {
          (Text("Grupos ").foregroundStyle(VinctusTokens.Color.textSecondary)
            + Text("recomendados").foregroundStyle(VinctusTokens.Color.textPrimary))
            .font(VinctusTokens.Typography.serif(22))
          Spacer()
          NavigationLink(destination: GroupsListView(repo: groupsRepo)) {
            Text("Ver todos")
              .font(.subheadline.weight(.semibold))
              .foregroundStyle(VinctusTokens.Color.accent)
          }
          .buttonStyle(.plain)
        }

        if suggestedGroups.isShowingCachedData {
          HStack(spacing: 8) {
            Image(systemName: "externaldrive.badge.clock")
              .foregroundStyle(VinctusTokens.Color.accent)
            Text("Mostrando grupos desde cache local.")
              .font(.footnote)
              .foregroundStyle(VinctusTokens.Color.textMuted)
          }
          .padding(.top, 4)
        }

        if suggestedGroups.isLoading, suggestedGroups.groups.isEmpty {
          VStack(spacing: VinctusTokens.Spacing.sm) {
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
            }
          }
          .padding(.top, 2)
        } else if let groupsError = suggestedGroups.errorMessage, filteredGroups.isEmpty {
          VCard {
            VStack(alignment: .leading, spacing: 10) {
              Text(groupsError)
                .font(.footnote)
                .foregroundStyle(.red)
              VButton("Reintentar", variant: .secondary) {
                Task {
                  await suggestedGroups.refresh()
                }
              }
            }
          }
          .padding(.top, 2)
        } else if filteredGroups.isEmpty {
          VCard {
            Text("Aún no hay grupos para este filtro.")
              .font(.footnote)
              .foregroundStyle(VinctusTokens.Color.textMuted)
          }
          .padding(.top, 2)
        } else {
          VStack(spacing: VinctusTokens.Spacing.sm) {
            ForEach(filteredGroups.prefix(6)) { group in
              GroupCard(group: group, repo: groupsRepo) {
                openedGroupID = group.id
              }
            }
          }
          .padding(.top, 2)
        }
      }
      .listRowSeparator(.hidden)
      .listRowBackground(SwiftUI.Color.clear)
    }
    .listStyle(.plain)
    .scrollContentBackground(.hidden)
    .background(VinctusTokens.Color.background)
    .vinctusTopBar()
    .navigationDestination(item: $openedGroupID) { groupID in
      GroupView(repo: groupsRepo, groupID: groupID)
    }
    .onAppear {
      // Screenshot builds open a group with `-VinctusOpenGroup <id>`.
      if openedGroupID == nil, let groupID = AppRepos.demoArgument("-VinctusOpenGroup") {
        openedGroupID = groupID
      }
    }
    .task(id: authVM.currentUserID) {
      if authVM.currentUserID == nil && !AppRepos.isDemo {
        vm.reset()
        return
      }
      await refreshDiscoverData()
    }
    .refreshable {
      await refreshDiscoverData()
    }
  }

  private var normalizedDiscoverQuery: String {
    DiscoverCategory.normalizedSearch(discoverQuery)
  }

  private var rankedTrends: [DiscoverTrend] {
    let countsByCategory = Dictionary(grouping: suggestedGroups.groups) { $0.categoryID ?? "" }
      .mapValues(\.count)
    let membersByCategory = Dictionary(grouping: suggestedGroups.groups) { $0.categoryID ?? "" }
      .mapValues { $0.reduce(0) { $0 + max(0, $1.memberCount) } }

    let sorted = DiscoverCategory.all.sorted { lhs, rhs in
      let lhsMembers = membersByCategory[lhs.id] ?? 0
      let rhsMembers = membersByCategory[rhs.id] ?? 0
      if lhsMembers != rhsMembers { return lhsMembers > rhsMembers }
      let lhsGroups = countsByCategory[lhs.id] ?? 0
      let rhsGroups = countsByCategory[rhs.id] ?? 0
      if lhsGroups != rhsGroups { return lhsGroups > rhsGroups }
      return lhs.title.localizedCaseInsensitiveCompare(rhs.title) == .orderedAscending
    }

    return sorted.enumerated().map { index, category in
      let count = countsByCategory[category.id] ?? 0
      let groupsLabel = count == 1 ? "1 grupo activo" : "\(count) grupos activos"
      let signalLabel = category.apiSource == "arxiv" ? "Papers en vivo" : "Novedades en vivo"
      return DiscoverTrend(
        id: category.id,
        category: category,
        icon: category.icon,
        title: category.title,
        subtitle: category.subtitle,
        rankLabel: "TOP \(index + 1)",
        scoreLabel: "",
        signalLabel: signalLabel,
        groupsLabel: groupsLabel,
        tags: category.subgroups.map(\.name)
      )
    }
  }

  private var filteredTrends: [DiscoverTrend] {
    guard !normalizedDiscoverQuery.isEmpty else { return rankedTrends }
    return rankedTrends.filter { $0.category.matches(query: discoverQuery) }
  }

  private var filteredGroups: [GroupSummary] {
    suggestedGroups.filtered(by: discoverQuery)
  }

  private var visibleSuggestedUsers: [DiscoverUser] {
    let unblocked = vm.suggestedUsers.filter { !blockedUsers.isBlocked($0.uid) }
    guard !normalizedDiscoverQuery.isEmpty else { return unblocked }
    return unblocked.filter {
      DiscoverCategory.normalizedSearch($0.displayName).contains(normalizedDiscoverQuery)
    }
  }

  @MainActor
  private func refreshDiscoverData() async {
    vm.currentUserID = authVM.currentUserID
    await vm.refreshSuggestedUsers()
    await suggestedGroups.refresh()
  }
}

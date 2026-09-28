import SwiftUI

struct DiscoverTrend: Identifiable {
  let id: String
  let icon: String
  let title: String
  let subtitle: String
  let rankLabel: String
  let scoreLabel: String
  let signalLabel: String
  let groupsLabel: String
  let tags: [String]
}

private let discoverTrendSeed: [DiscoverTrend] = [
  DiscoverTrend(
    id: "science",
    icon: "atom",
    title: "Ciencia y Materia",
    subtitle: "La búsqueda de la verdad fundamental.",
    rankLabel: "TOP 1",
    scoreLabel: "87 SCORE",
    signalLabel: "6 papers hoy",
    groupsLabel: "2 grupos activos",
    tags: ["mecánica cuántica", "cosmología", "astronomía"]
  ),
  DiscoverTrend(
    id: "music",
    icon: "music.note",
    title: "Ritmos y Cultura",
    subtitle: "Frecuencias, historia y expresión colectiva.",
    rankLabel: "TOP 2",
    scoreLabel: "81 SCORE",
    signalLabel: "6 novedades hoy",
    groupsLabel: "3 grupos activos",
    tags: ["jazz", "salsa", "clasica"]
  ),
  DiscoverTrend(
    id: "technology",
    icon: "cpu",
    title: "Tecnologia Aplicada",
    subtitle: "Innovación útil para problemas reales.",
    rankLabel: "TOP 3",
    scoreLabel: "79 SCORE",
    signalLabel: "4 papers hoy",
    groupsLabel: "4 grupos activos",
    tags: ["ai", "software", "startups"]
  ),
]

struct DiscoverView: View {
  @EnvironmentObject private var authVM: AuthViewModel
  @EnvironmentObject private var blockedUsers: BlockedUsersStore
  @StateObject private var vm: DiscoverViewModel

  @State private var discoverQuery = ""
  @State private var isCreatePostPresented = false
  @State private var lastDiscoverHeaderOffset: CGFloat = .zero
  @State private var isFloatingHeaderVisible = false
  @State private var discoverHeaderScrollAccumulator: CGFloat = .zero
  @State private var discoverHeaderScrollDirection: CGFloat = .zero
  @State private var groups: [GroupSummary] = []
  @State private var isLoadingGroups = false
  @State private var groupsError: String?
  @State private var isShowingCachedGroups = false

  private let profileRepo: ProfileRepo
  private let groupsRepo: any GroupsRepo
  private let createPostRepo: any CreatePostRepo
  private let aiRepo: AIRepo

  init(
    repo: DiscoverRepo,
    profileRepo: ProfileRepo,
    groupsRepo: any GroupsRepo,
    createPostRepo: any CreatePostRepo,
    aiRepo: AIRepo
  ) {
    self.profileRepo = profileRepo
    self.groupsRepo = groupsRepo
    self.createPostRepo = createPostRepo
    self.aiRepo = aiRepo
    _vm = StateObject(wrappedValue: DiscoverViewModel(repo: repo))
  }

  var body: some View {
    List {
      DiscoverHeaderBar {
        isCreatePostPresented = true
      }
      .background(
        GeometryReader { proxy in
          SwiftUI.Color.clear.preference(
            key: DiscoverHeaderOffsetPreferenceKey.self,
            value: proxy.frame(in: .named("DiscoverList")).minY
          )
        }
      )
      .listRowSeparator(.hidden)
      .listRowBackground(SwiftUI.Color.clear)

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

      if !visibleSuggestedUsers.isEmpty {
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
                  DiscoverTrendCard(trend: trend)
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
          DiscoverSectionHeader(title: "Grupos recomendados")
          Spacer()
          NavigationLink(destination: GroupsListView(repo: groupsRepo)) {
            Text("Ver todos")
              .font(.subheadline.weight(.semibold))
              .foregroundStyle(VinctusTokens.Color.accent)
          }
          .buttonStyle(.plain)
        }

        if isShowingCachedGroups {
          HStack(spacing: 8) {
            Image(systemName: "externaldrive.badge.clock")
              .foregroundStyle(VinctusTokens.Color.accent)
            Text("Mostrando grupos desde cache local.")
              .font(.footnote)
              .foregroundStyle(VinctusTokens.Color.textMuted)
          }
          .padding(.top, 4)
        }

        if isLoadingGroups, groups.isEmpty {
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
        } else if let groupsError {
          VCard {
            VStack(alignment: .leading, spacing: 10) {
              Text(groupsError)
                .font(.footnote)
                .foregroundStyle(.red)
              VButton("Reintentar", variant: .secondary) {
                Task {
                  await refreshGroups()
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
              NavigationLink(destination: GroupView(repo: groupsRepo, groupID: group.id)) {
                DiscoverGroupCard(group: group)
              }
              .buttonStyle(.plain)
            }
          }
          .padding(.top, 2)
        }
      }
      .listRowSeparator(.hidden)
      .listRowBackground(SwiftUI.Color.clear)
    }
    .coordinateSpace(name: "DiscoverList")
    .listStyle(.plain)
    .toolbar(.hidden, for: .navigationBar)
    .scrollContentBackground(.hidden)
    .background(VinctusTokens.Color.background)
    .overlay(alignment: .top) {
      DiscoverTopSafeAreaBackground()
    }
    .overlay(alignment: .top) {
      DiscoverFloatingHeaderOverlay(
        isVisible: isFloatingHeaderVisible,
        onTapCreatePost: { isCreatePostPresented = true }
      )
    }
    .onPreferenceChange(DiscoverHeaderOffsetPreferenceKey.self) { offset in
      let delta = offset - lastDiscoverHeaderOffset
      lastDiscoverHeaderOffset = offset
      let isNearTop = offset > -8

      if isNearTop {
        discoverHeaderScrollAccumulator = .zero
        discoverHeaderScrollDirection = .zero
        if isFloatingHeaderVisible {
          withAnimation(.easeInOut(duration: 0.2)) {
            isFloatingHeaderVisible = false
          }
        }
        return
      }

      // Filter tiny jitter and accumulate directional travel for stable UX.
      guard abs(delta) > 0.3 else { return }

      let direction: CGFloat = delta > 0 ? 1 : -1
      if direction != discoverHeaderScrollDirection {
        discoverHeaderScrollDirection = direction
        discoverHeaderScrollAccumulator = .zero
      }
      discoverHeaderScrollAccumulator += delta

      let revealDistance: CGFloat = 16
      let hideDistance: CGFloat = 10

      if discoverHeaderScrollDirection > 0,
        discoverHeaderScrollAccumulator >= revealDistance,
        !isFloatingHeaderVisible
      {
        discoverHeaderScrollAccumulator = .zero
        withAnimation(.easeInOut(duration: 0.2)) {
          isFloatingHeaderVisible = true
        }
      } else if discoverHeaderScrollDirection < 0,
        discoverHeaderScrollAccumulator <= -hideDistance,
        isFloatingHeaderVisible
      {
        discoverHeaderScrollAccumulator = .zero
        withAnimation(.easeInOut(duration: 0.2)) {
          isFloatingHeaderVisible = false
        }
      }
    }
    .navigationDestination(isPresented: $isCreatePostPresented) {
      CreatePostView(repo: createPostRepo)
    }
    .task(id: authVM.currentUserID) {
      await refreshDiscoverData()
    }
    .refreshable {
      await refreshDiscoverData()
    }
  }

  private var normalizedDiscoverQuery: String {
    discoverQuery.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
  }

  private var filteredTrends: [DiscoverTrend] {
    guard !normalizedDiscoverQuery.isEmpty else { return discoverTrendSeed }
    return discoverTrendSeed.filter { trend in
      trend.title.lowercased().contains(normalizedDiscoverQuery)
        || trend.subtitle.lowercased().contains(normalizedDiscoverQuery)
        || trend.tags.joined(separator: " ").lowercased().contains(normalizedDiscoverQuery)
    }
  }

  private var filteredGroups: [GroupSummary] {
    guard !normalizedDiscoverQuery.isEmpty else { return groups }
    return groups.filter { group in
      group.name.lowercased().contains(normalizedDiscoverQuery)
        || group.description.lowercased().contains(normalizedDiscoverQuery)
        || (group.categoryID?.lowercased().contains(normalizedDiscoverQuery) ?? false)
    }
  }

  private var visibleSuggestedUsers: [DiscoverUser] {
    vm.suggestedUsers.filter { !blockedUsers.isBlocked($0.uid) }
  }

  @MainActor
  private func refreshDiscoverData() async {
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
      let page = try await groupsRepo.fetchGroups(limit: 12)
      groups = page.items
      isShowingCachedGroups = page.isFromCache
    } catch {
      groupsError = error.localizedDescription
    }
  }
}

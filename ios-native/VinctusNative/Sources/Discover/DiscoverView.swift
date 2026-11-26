import SwiftUI

struct DiscoverView: View {
  @EnvironmentObject private var authVM: AuthViewModel
  @EnvironmentObject private var blockedUsers: BlockedUsersStore
  @StateObject private var vm: DiscoverViewModel
  @StateObject private var suggestedGroups: GroupSuggestionsViewModel
  @StateObject private var postsPreview: FeedViewModel
  @StateObject private var interests: DiscoverInterestsViewModel
  @StateObject private var debates: DiscoverDebatesViewModel

  @State private var discoverQuery = ""
  @State private var openedGroupID: String?
  @State private var isShowingFeed = false
  @State private var openedPost: FeedItem?
  @State private var isShowingAllGroups = false
  @State private var openedCategory: DiscoverCategory?
  @State private var openedDebate: PublicDebate?
  @State private var isShowingArena = false
  /// Coming back to Discover within this time shows what is loaded instead of asking again.
  @State private var lastRefresh: Date?
  private static let refreshInterval: TimeInterval = 60

  private let discoverRepo: DiscoverRepo
  private let profileRepo: ProfileRepo
  private let groupsRepo: any GroupsRepo
  private let aiRepo: AIRepo
  private let profileContentRepo: ProfileContentRepo
  private let feedRepo: FeedRepo

  init(
    repo: DiscoverRepo,
    profileRepo: ProfileRepo,
    groupsRepo: any GroupsRepo,
    aiRepo: AIRepo,
    profileContentRepo: ProfileContentRepo = AppRepos.profileContent(),
    feedRepo: FeedRepo = AppRepos.feed(),
    publicDebatesRepo: PublicDebatesRepo = AppRepos.publicDebates()
  ) {
    self.discoverRepo = repo
    self.profileRepo = profileRepo
    self.groupsRepo = groupsRepo
    self.aiRepo = aiRepo
    self.profileContentRepo = profileContentRepo
    self.feedRepo = feedRepo
    _vm = StateObject(wrappedValue: DiscoverViewModel(repo: repo))
    _suggestedGroups = StateObject(wrappedValue: GroupSuggestionsViewModel(repo: groupsRepo, limit: 50))
    _postsPreview = StateObject(wrappedValue: FeedViewModel(repo: feedRepo))
    _interests = StateObject(
      wrappedValue: DiscoverInterestsViewModel(discoverRepo: repo, profileContentRepo: profileContentRepo)
    )
    _debates = StateObject(wrappedValue: DiscoverDebatesViewModel(repo: publicDebatesRepo))
  }

  var body: some View {
    List {
      // Stories first, as on the web's Discover page.
      Section {
        StoriesBar()
      }
      .listRowSeparator(.hidden)
      .listRowBackground(SwiftUI.Color.clear)

      Section {
        DiscoverCurationHero(searchText: $discoverQuery)
      }
      .listRowSeparator(.hidden)
      .listRowBackground(SwiftUI.Color.clear)

      // While searching only the results show: interests, groups and people.
      if !isSearching {
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

        Section {
          DiscoverPostsSection(
            vm: postsPreview,
            onSeeAll: { isShowingFeed = true },
            onOpenPost: { openedPost = $0 }
          )
        }
        .listRowSeparator(.hidden)
        .listRowBackground(SwiftUI.Color.clear)
      }

      Section {
        DiscoverInterestsSection(vm: interests, query: discoverQuery) { category in
          openedCategory = category
        }
      }
      .listRowSeparator(.hidden)
      .listRowBackground(SwiftUI.Color.clear)

      Section {
        HStack(alignment: .firstTextBaseline) {
          DiscoverSectionHeader(title: "Grupos para ti")
          Spacer()
          Button {
            isShowingAllGroups = true
          } label: {
            Text("Ver todos")
              .font(.subheadline.weight(.semibold))
              .foregroundStyle(VinctusTokens.Color.accent)
          }
          .buttonStyle(.borderless)
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
            // Four at a glance, eight while searching (like the web); "Ver todos" lists the rest.
            ForEach(filteredGroups.prefix(isSearching ? 8 : 4)) { group in
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

      if !isSearching {
        Section {
          DiscoverDebatesSection(
            vm: debates,
            onOpenArena: { isShowingArena = true },
            onOpen: { openedDebate = $0 }
          )
        }
        .listRowSeparator(.hidden)
        .listRowBackground(SwiftUI.Color.clear)
      }
    }
    .listStyle(.plain)
    .scrollContentBackground(.hidden)
    .background(VinctusTokens.Color.background)
    .vinctusTopBar()
    .navigationDestination(item: $openedGroupID) { groupID in
      GroupView(repo: groupsRepo, groupID: groupID)
    }
    .navigationDestination(isPresented: $isShowingFeed) {
      FeedView(repo: feedRepo, profileRepo: profileRepo)
    }
    .navigationDestination(isPresented: $isShowingAllGroups) {
      GroupsListView(repo: groupsRepo)
    }
    .navigationDestination(item: $openedCategory) { category in
      DiscoverCategoryView(
        category: category,
        discoverRepo: discoverRepo,
        groupsRepo: groupsRepo,
        profileContentRepo: profileContentRepo
      )
    }
    .navigationDestination(item: $openedDebate) { debate in
      SavedDebateView(debate: debate.asSavedDebate, aiRepo: aiRepo)
    }
    .navigationDestination(isPresented: $isShowingArena) {
      ArenaView(repo: aiRepo)
    }
    .navigationDestination(item: $openedPost) { item in
      PostDetailView(
        item: item,
        profileRepo: profileRepo,
        commentsRepo: AppRepos.postComments(),
        onCommentCountChange: { count in postsPreview.updateCommentCount(postID: item.id, newCount: count) }
      )
    }
    .onAppear {
      // Screenshot builds open a group with `-VinctusOpenGroup <id>` and the full feed with
      // `-VinctusOpenFeed 1`.
      if openedGroupID == nil, let groupID = AppRepos.demoArgument("-VinctusOpenGroup") {
        openedGroupID = groupID
      }
      if !isShowingFeed, AppRepos.demoArgument("-VinctusOpenFeed") != nil {
        isShowingFeed = true
      }
    }
    .onReceive(NotificationCenter.default.publisher(for: .vinctusPostPublished)) { _ in
      Task { await postsPreview.refresh() }
    }
    .task(id: authVM.currentUserID) {
      if authVM.currentUserID == nil && !AppRepos.isDemo {
        discoverQuery = ""
        lastRefresh = nil
        vm.reset()
        suggestedGroups.reset()
        interests.reset()
        debates.reset()
        return
      }
      if let lastRefresh, Date().timeIntervalSince(lastRefresh) < Self.refreshInterval,
        vm.currentUserID == authVM.currentUserID
      {
        return
      }
      await refreshDiscoverData(force: false)
    }
    .refreshable {
      await refreshDiscoverData(force: true)
    }
  }

  private var normalizedDiscoverQuery: String {
    DiscoverCategory.normalizedSearch(discoverQuery)
  }

  private var isSearching: Bool {
    !normalizedDiscoverQuery.isEmpty
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

  /// Every section asks at the same time, so a slow one (a sleeping function, a slow source)
  /// never holds the others back.
  @MainActor
  private func refreshDiscoverData(force: Bool) async {
    lastRefresh = Date()
    vm.currentUserID = authVM.currentUserID
    async let people: Void = vm.refreshSuggestedUsers()
    async let posts: Void = postsPreview.refresh()
    async let groups: Void = suggestedGroups.refresh()
    async let topics: Void = interests.refresh(force: force)
    async let arena: Void = debates.refresh(force: force)
    _ = await (people, posts, groups, topics, arena)
  }
}

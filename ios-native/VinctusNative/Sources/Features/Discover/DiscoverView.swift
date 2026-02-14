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

struct DiscoverPaperHighlight: Identifiable {
  let id: String
  let publishedAt: String
  let title: String
  let authors: String
}

struct DiscoverDebateHighlight {
  let title: String
  let matchupLabel: String
  let summary: String
  let topicTag: String
  let sourcesCount: Int
  let likesCount: Int
}

struct DiscoverView: View {
  @EnvironmentObject private var authVM: AuthViewModel
  @StateObject private var vm: DiscoverViewModel
  @StateObject private var feedVM: FeedViewModel

  @State private var discoverQuery = ""
  @State private var publicationQuery = ""
  @State private var preferredPublicationPostID: String?
  @State private var selectedPublication: FeedItem?
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
  private let commentsRepo: any PostCommentsRepo

  init(
    repo: DiscoverRepo,
    feedRepo: any FeedRepo,
    profileRepo: ProfileRepo,
    groupsRepo: any GroupsRepo,
    createPostRepo: any CreatePostRepo,
    commentsRepo: any PostCommentsRepo
  ) {
    self.profileRepo = profileRepo
    self.groupsRepo = groupsRepo
    self.createPostRepo = createPostRepo
    self.commentsRepo = commentsRepo
    _vm = StateObject(wrappedValue: DiscoverViewModel(repo: repo))
    _feedVM = StateObject(wrappedValue: FeedViewModel(repo: feedRepo))
  }

  var body: some View {
    List {
      VinctusHeaderBar {
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

      if !vm.suggestedUsers.isEmpty {
        Section {
          ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: VinctusTokens.Spacing.md) {
              ForEach(Array(vm.suggestedUsers.prefix(12))) { user in
                NavigationLink(destination: ProfileView(repo: profileRepo, userID: user.uid)) {
                  DiscoverStoryChip(user: user)
                }
                .buttonStyle(.plain)
              }
            }
            .padding(.vertical, 6)
          }
        } header: {
          Text("Historias")
            .font(.system(size: 11, weight: .semibold))
            .tracking(2.4)
            .foregroundStyle(VinctusTokens.Color.textMuted)
        }
        .listRowSeparator(.hidden)
        .listRowBackground(SwiftUI.Color.clear)
      }

      Section {
        DiscoverCurationHero(searchText: $discoverQuery)
      }
      .listRowSeparator(.hidden)
      .listRowBackground(SwiftUI.Color.clear)

      Section {
        VStack(alignment: .leading, spacing: VinctusTokens.Spacing.md) {
          Text("Tendencias esta semana")
            .font(VinctusTokens.Typography.sectionTitle(size: 26))
            .foregroundStyle(VinctusTokens.Color.textPrimary)

          if filteredTrends.isEmpty {
            VCard {
              Text("No hay tendencias para ese termino. Prueba otro filtro.")
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
        if let instantPreview = instantPreviewPayload {
          DiscoverInstantPreviewCard(
            categoryTitle: instantPreview.categoryTitle,
            overviewText: instantPreview.overviewText,
            papers: instantPreview.papers,
            onTapCategory: {
              discoverQuery = instantPreview.searchQuery
            }
          )
        }
      }
      .listRowSeparator(.hidden)
      .listRowBackground(SwiftUI.Color.clear)

      Section {
        if let debateHighlight {
          DiscoverDebateSpotlightSection(debate: debateHighlight)
        }
      }
      .listRowSeparator(.hidden)
      .listRowBackground(SwiftUI.Color.clear)

      Section {
        HStack {
          Text("Grupos recomendados")
            .font(VinctusTokens.Typography.sectionTitle(size: 24))
            .foregroundStyle(VinctusTokens.Color.textPrimary)
          Spacer()
          NavigationLink(destination: GroupsListView(repo: groupsRepo)) {
            Text("Ver todos")
              .font(.caption.weight(.semibold))
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
            Text("Aun no hay grupos para este filtro.")
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

      Section {
        DiscoverPublicationsSection(
          searchText: $publicationQuery,
          items: filteredPublicationItems,
          isInitialLoading: feedVM.isInitialLoading,
          hasLoadedData: !feedVM.items.isEmpty,
          errorMessage: feedVM.errorMessage,
          isShowingCachedData: feedVM.isShowingCachedData,
          onOpenPost: { item in
            selectedPublication = feedVM.items.first(where: { $0.id == item.id }) ?? item
          },
          onRetry: {
            Task {
              await feedVM.refresh()
            }
          }
        )
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
      VTopSafeAreaBackground()
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
        !isFloatingHeaderVisible {
        discoverHeaderScrollAccumulator = .zero
        withAnimation(.easeInOut(duration: 0.2)) {
          isFloatingHeaderVisible = true
        }
      } else if discoverHeaderScrollDirection < 0,
        discoverHeaderScrollAccumulator <= -hideDistance,
        isFloatingHeaderVisible {
        discoverHeaderScrollAccumulator = .zero
        withAnimation(.easeInOut(duration: 0.2)) {
          isFloatingHeaderVisible = false
        }
      }
    }
    .navigationDestination(isPresented: $isCreatePostPresented) {
      CreatePostView(
        repo: createPostRepo,
        onPublished: { postID in
          preferredPublicationPostID = postID
          Task {
            await feedVM.refresh()
          }
        }
      )
    }
    .navigationDestination(item: $selectedPublication) { item in
      PostDetailView(
        item: item,
        profileRepo: profileRepo,
        commentsRepo: commentsRepo,
        onCommentCountChange: { newCount in
          feedVM.updateCommentCount(postID: item.id, newCount: newCount)
        }
      )
    }
    .onChange(of: isCreatePostPresented) { wasPresented, isPresented in
      // Refresh publications after closing composer so the latest post appears immediately.
      if wasPresented, !isPresented {
        Task {
          await feedVM.refresh()
        }
      }
    }
    .task(id: authVM.currentUserID) {
      await refreshDiscoverData()
    }
    .refreshable {
      await refreshDiscoverData()
    }
  }

  private var normalizedDiscoverQuery: String {
    DiscoverContentComposer.normalizedQuery(discoverQuery)
  }

  private var filteredTrends: [DiscoverTrend] {
    DiscoverContentComposer.filteredTrends(query: normalizedDiscoverQuery, trends: allTrends)
  }

  private var filteredGroups: [GroupSummary] {
    GroupsLoader.filteredGroups(query: normalizedDiscoverQuery, groups: groups)
  }

  private var filteredPublicationItems: [FeedItem] {
    DiscoverContentComposer.filteredPublications(
      query: publicationQuery,
      items: feedVM.items,
      preferredPostID: preferredPublicationPostID
    )
  }

  private var allTrends: [DiscoverTrend] {
    DiscoverContentComposer.buildTrends(groups: groups, publicationItems: filteredPublicationItems)
  }

  private var instantPreviewPayload: (
    categoryTitle: String,
    overviewText: String,
    papers: [DiscoverPaperHighlight],
    searchQuery: String
  )? {
    DiscoverContentComposer.buildInstantPreview(
      trends: allTrends,
      items: feedVM.items,
      preferredPostID: preferredPublicationPostID
    )
  }

  private var debateHighlight: DiscoverDebateHighlight? {
    DiscoverContentComposer.buildDebateHighlight(
      items: feedVM.items,
      preferredPostID: preferredPublicationPostID,
      dominantCategoryTag: dominantCategoryTag
    )
  }

  @MainActor
  private func refreshDiscoverData() async {
    vm.currentUserID = authVM.currentUserID
    await vm.refreshSuggestedUsers()
    await feedVM.refresh()
    await refreshGroups()
  }

  @MainActor
  private func refreshGroups() async {
    guard !isLoadingGroups else { return }
    isLoadingGroups = true
    groupsError = nil
    defer { isLoadingGroups = false }

    let state = await GroupsLoader.loadState(repo: groupsRepo, limit: 12)
    GroupsLoader.applyLoadState(
      state,
      groups: &groups,
      errorMessage: &groupsError,
      isShowingCached: &isShowingCachedGroups
    )
  }

  private var dominantCategoryTag: String {
    DiscoverContentComposer.dominantCategoryTag(from: allTrends)
  }
}

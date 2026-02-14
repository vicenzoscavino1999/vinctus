import SwiftUI

struct FeedView: View {
  @EnvironmentObject private var authVM: AuthViewModel
  @State private var groups: [GroupSummary] = []
  @State private var searchText = ""
  @State private var selectedSegment: ConversationsSegment = .groups
  @State private var isCreatePostPresented = false
  @State private var isGroupsListPresented = false
  @State private var selectedDirectThread: FeedDirectThreadRoute?
  @State private var isLoadingGroups = false
  @State private var groupsError: String?
  @State private var isShowingCachedGroups = false
  @StateObject private var directInboxVM: FeedDirectInboxViewModel

  private let groupsRepo: any GroupsRepo
  private let createPostRepo: any CreatePostRepo
  private let chatRepo: any ChatRepo

  init(
    groupsRepo: any GroupsRepo,
    createPostRepo: any CreatePostRepo,
    discoverRepo: any DiscoverRepo,
    chatRepo: any ChatRepo
  ) {
    self.groupsRepo = groupsRepo
    self.createPostRepo = createPostRepo
    self.chatRepo = chatRepo
    _directInboxVM = StateObject(
      wrappedValue: FeedDirectInboxViewModel(chatRepo: chatRepo, discoverRepo: discoverRepo)
    )
  }

  var body: some View {
    List {
      VinctusHeaderBar {
        isCreatePostPresented = true
      }
      .listRowSeparator(.hidden)
      .listRowBackground(SwiftUI.Color.clear)

      VStack(alignment: .leading, spacing: 12) {
        Text("EN CONVERSACION")
          .font(.system(size: 11, weight: .semibold))
          .tracking(2.4)
          .foregroundStyle(VinctusTokens.Color.textMuted)

        Text("Dialogos")
          .font(VinctusTokens.Typography.brandTitle(size: 34))
          .foregroundStyle(VinctusTokens.Color.textPrimary)

        FeedDialogsSearchField(
          searchText: $searchText,
          placeholder: selectedSegment == .groups ? "Buscar mensajes o grupos..." : "Buscar personas o chats..."
        )
      }
      .listRowSeparator(.hidden)
      .listRowBackground(SwiftUI.Color.clear)

      FeedConversationsSegmentedControl(selectedSegment: $selectedSegment)
        .listRowSeparator(.hidden)
        .listRowBackground(SwiftUI.Color.clear)

      if selectedSegment == .groups, isShowingCachedGroups {
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

      if selectedSegment == .groups {
        groupsContent
      } else {
        privateConversationsContent
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
    .navigationDestination(isPresented: $isGroupsListPresented) {
      GroupsListView(repo: groupsRepo)
    }
    .navigationDestination(item: $selectedDirectThread) { route in
      if let currentUID = authVM.currentUserID {
        FeedDirectThreadView(
          chatRepo: chatRepo,
          route: route,
          currentUserID: currentUID,
          currentUserName: authVM.currentUserDisplayName
        )
      } else {
        VCard {
          Text("No hay sesion activa.")
            .foregroundStyle(VinctusTokens.Color.textMuted)
        }
        .padding()
      }
    }
    .task(id: authVM.currentUserID) {
      directInboxVM.setCurrentUserID(authVM.currentUserID)
      await refreshGroups()
      if selectedSegment == .privates {
        directInboxVM.activate()
        directInboxVM.handleSearchTextChange(searchText)
      }
    }
    .onChange(of: searchText) { _, newValue in
      guard selectedSegment == .privates else { return }
      directInboxVM.handleSearchTextChange(newValue)
    }
    .onChange(of: selectedSegment) { _, newValue in
      if newValue == .privates {
        directInboxVM.activate()
        directInboxVM.handleSearchTextChange(searchText)
      } else {
        directInboxVM.deactivate()
      }
    }
    .onAppear {
      directInboxVM.setCurrentUserID(authVM.currentUserID)
      if selectedSegment == .privates {
        directInboxVM.activate()
        directInboxVM.handleSearchTextChange(searchText)
      }
    }
    .onDisappear {
      directInboxVM.deactivate()
    }
    .refreshable {
      await refreshGroups()
      if selectedSegment == .privates {
        await directInboxVM.loadSuggestedUsersIfNeeded(force: true)
      }
    }
  }

  @ViewBuilder
  private var groupsContent: some View {
    if isLoadingGroups, filteredGroups.isEmpty {
      FeedGroupSkeletonRows()
    } else if filteredGroups.isEmpty, let groupsError {
      VCard {
        VStack(alignment: .leading, spacing: VinctusTokens.Spacing.sm) {
          Text("No se pudieron cargar los dialogos de grupos.")
            .font(.headline)
            .foregroundStyle(VinctusTokens.Color.textPrimary)

          Text(groupsError)
            .font(.footnote)
            .foregroundStyle(VinctusTokens.Color.textMuted)

          VButton("Reintentar", variant: .secondary) {
            Task {
              await refreshGroups()
            }
          }
        }
      }
      .listRowSeparator(.hidden)
      .listRowBackground(SwiftUI.Color.clear)
    } else if filteredGroups.isEmpty {
      VCard {
        VStack(alignment: .leading, spacing: 6) {
          Text("Sin resultados")
            .font(.headline)
            .foregroundStyle(VinctusTokens.Color.textPrimary)
          Text("Prueba otro termino para buscar mensajes o grupos.")
            .font(.footnote)
            .foregroundStyle(VinctusTokens.Color.textMuted)
        }
      }
      .listRowSeparator(.hidden)
      .listRowBackground(SwiftUI.Color.clear)
    } else {
      if let recentGroup = filteredGroups.first {
        NavigationLink(destination: GroupView(repo: groupsRepo, groupID: recentGroup.id)) {
          FeedRecentConversationCard(
            group: recentGroup,
            subtitle: recentGroup.description.isEmpty ? "Sin mensajes recientes" : recentGroup.description,
            relativeTime: FeedContentComposer.relativeTimeLabel(from: recentGroup.updatedAt)
          )
        }
        .buttonStyle(.plain)
        .listRowSeparator(.hidden)
        .listRowBackground(SwiftUI.Color.clear)
      }

      HStack {
        Text("Tus grupos")
          .font(VinctusTokens.Typography.sectionTitle(size: 24))
          .foregroundStyle(VinctusTokens.Color.textPrimary)
          .lineLimit(1)
          .minimumScaleFactor(0.9)
        Spacer()
        Button {
          isGroupsListPresented = true
        } label: {
          Text("+ CREAR GRUPO")
            .font(.caption2.weight(.semibold))
            .tracking(0.8)
            .foregroundStyle(VinctusTokens.Color.accent)
            .padding(.horizontal, 12)
            .padding(.vertical, 7)
            .overlay(
              Capsule()
                .stroke(VinctusTokens.Color.accent.opacity(0.6), lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
      }
      .listRowSeparator(.hidden)
      .listRowBackground(SwiftUI.Color.clear)

      ForEach(filteredGroups.prefix(4)) { group in
        NavigationLink(destination: GroupView(repo: groupsRepo, groupID: group.id)) {
          FeedGroupDialogCard(group: group)
        }
        .buttonStyle(.plain)
        .listRowSeparator(.hidden)
        .listRowBackground(SwiftUI.Color.clear)
      }

      if let groupsError {
        Text(groupsError)
          .font(.footnote)
          .foregroundStyle(VinctusTokens.Color.accent)
          .listRowSeparator(.hidden)
          .listRowBackground(SwiftUI.Color.clear)
      }
    }
  }

  @ViewBuilder
  private var privateConversationsContent: some View {
    if directInboxVM.isLoadingConversations, directInboxVM.conversations.isEmpty {
      FeedDirectSkeletonRows()
    } else if isDirectSearchActive {
      directSearchContent
    } else {
      directInboxContent
    }

    if let errorMessage = directInboxVM.errorMessage {
      VCard {
        Text(errorMessage)
          .font(.footnote)
          .foregroundStyle(VinctusTokens.Color.accent)
      }
      .listRowSeparator(.hidden)
      .listRowBackground(SwiftUI.Color.clear)
    }
  }

  @ViewBuilder
  private var directSearchContent: some View {
    let matchingConversations = directInboxVM.filteredConversations(for: searchText)

    if matchingConversations.isEmpty, directInboxVM.searchResults.isEmpty, !directInboxVM.isSearchingUsers {
      VCard {
        VStack(alignment: .leading, spacing: 6) {
          Text("Sin resultados")
            .font(.headline)
            .foregroundStyle(VinctusTokens.Color.textPrimary)
          Text("No encontramos chats ni usuarios para ese termino.")
            .font(.footnote)
            .foregroundStyle(VinctusTokens.Color.textMuted)
        }
      }
      .listRowSeparator(.hidden)
      .listRowBackground(SwiftUI.Color.clear)
    } else {
      if !matchingConversations.isEmpty {
        Text("Chats")
          .font(.caption.weight(.semibold))
          .tracking(2.2)
          .foregroundStyle(VinctusTokens.Color.textMuted)
          .listRowSeparator(.hidden)
          .listRowBackground(SwiftUI.Color.clear)

        ForEach(matchingConversations) { conversation in
          directConversationRow(for: conversation)
        }
      }

      if directInboxVM.isSearchingUsers {
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

      if !directInboxVM.searchResults.isEmpty {
        Text("Personas")
          .font(.caption.weight(.semibold))
          .tracking(2.2)
          .foregroundStyle(VinctusTokens.Color.textMuted)
          .listRowSeparator(.hidden)
          .listRowBackground(SwiftUI.Color.clear)

        ForEach(directInboxVM.searchResults) { user in
          directUserRow(for: user, actionLabel: "Iniciar")
        }
      }
    }
  }

  @ViewBuilder
  private var directInboxContent: some View {
    let conversations = directInboxVM.filteredConversations(for: searchText)

    if conversations.isEmpty {
      VCard {
        VStack(alignment: .leading, spacing: 6) {
          Text("Privados")
            .font(.headline)
            .foregroundStyle(VinctusTokens.Color.textPrimary)
          Text("Aun no tienes conversaciones privadas. Inicia una abajo.")
            .font(.footnote)
            .foregroundStyle(VinctusTokens.Color.textMuted)
        }
      }
      .listRowSeparator(.hidden)
      .listRowBackground(SwiftUI.Color.clear)
    } else {
      ForEach(conversations) { conversation in
        directConversationRow(for: conversation)
      }
    }

    if !directInboxVM.suggestedUsers.isEmpty {
      Text("Personas sugeridas")
        .font(.caption.weight(.semibold))
        .tracking(2.2)
        .foregroundStyle(VinctusTokens.Color.textMuted)
        .listRowSeparator(.hidden)
        .listRowBackground(SwiftUI.Color.clear)

      ForEach(directInboxVM.suggestedUsers.prefix(4)) { user in
        directUserRow(for: user, actionLabel: "Mensaje")
      }
    }
  }

  private func directConversationRow(for conversation: DirectConversationSummary) -> some View {
    let participant = directInboxVM.participant(for: conversation)

    return Button {
      selectedDirectThread = directInboxVM.route(for: conversation)
    } label: {
      FeedDirectConversationCard(
        conversation: conversation,
        participant: participant,
        currentUID: authVM.currentUserID
      )
    }
    .buttonStyle(.plain)
    .listRowSeparator(.hidden)
    .listRowBackground(SwiftUI.Color.clear)
  }

  private func directUserRow(for user: DiscoverUser, actionLabel: String) -> some View {
    Button {
      Task {
        if let route = await directInboxVM.startConversation(with: user) {
          selectedDirectThread = route
        }
      }
    } label: {
      FeedDirectPersonCard(user: user, actionLabel: actionLabel)
    }
    .buttonStyle(.plain)
    .listRowSeparator(.hidden)
    .listRowBackground(SwiftUI.Color.clear)
  }

  private var normalizedSearchQuery: String {
    FeedContentComposer.normalizedSearchQuery(searchText)
  }

  private var isDirectSearchActive: Bool {
    selectedSegment == .privates && normalizedSearchQuery.count >= 2
  }

  private var filteredGroups: [GroupSummary] {
    GroupsLoader.filteredGroups(query: normalizedSearchQuery, groups: groups)
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
}

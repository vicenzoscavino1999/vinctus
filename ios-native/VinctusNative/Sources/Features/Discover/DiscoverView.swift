import SwiftUI

private struct DiscoverTrend: Identifiable {
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
    subtitle: "La busqueda de la verdad fundamental.",
    rankLabel: "TOP 1",
    scoreLabel: "87 SCORE",
    signalLabel: "6 papers hoy",
    groupsLabel: "2 grupos activos",
    tags: ["mecanica cuantica", "cosmologia", "astronomia"]
  ),
  DiscoverTrend(
    id: "music",
    icon: "music.note",
    title: "Ritmos y Cultura",
    subtitle: "Frecuencias, historia y expresion colectiva.",
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
    subtitle: "Innovacion util para problemas reales.",
    rankLabel: "TOP 3",
    scoreLabel: "79 SCORE",
    signalLabel: "4 papers hoy",
    groupsLabel: "4 grupos activos",
    tags: ["ai", "software", "startups"]
  ),
]

struct DiscoverView: View {
  @EnvironmentObject private var authVM: AuthViewModel
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

  init(
    repo: DiscoverRepo,
    profileRepo: ProfileRepo,
    groupsRepo: any GroupsRepo,
    createPostRepo: any CreatePostRepo
  ) {
    self.profileRepo = profileRepo
    self.groupsRepo = groupsRepo
    self.createPostRepo = createPostRepo
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

      if !vm.suggestedUsers.isEmpty {
        Section("Historias") {
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
        }
        .textCase(.uppercase)
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
            .font(VinctusTokens.Typography.sectionTitle(size: 32))
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
        HStack {
          Text("Grupos recomendados")
            .font(VinctusTokens.Typography.sectionTitle(size: 30))
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

struct ConnectionsSearchView: View {
  @EnvironmentObject private var authVM: AuthViewModel
  @StateObject private var vm: DiscoverViewModel

  @State private var groups: [GroupSummary] = []
  @State private var isLoadingGroups = false
  @State private var groupsError: String?
  @State private var isShowingCachedGroups = false

  private let profileRepo: ProfileRepo
  private let groupsRepo: any GroupsRepo

  init(repo: DiscoverRepo, profileRepo: ProfileRepo, groupsRepo: any GroupsRepo) {
    self.profileRepo = profileRepo
    self.groupsRepo = groupsRepo
    _vm = StateObject(wrappedValue: DiscoverViewModel(repo: repo))
  }

  var body: some View {
    List {
      Section {
        DiscoverPeopleSearchField(
          searchText: $vm.searchText,
          placeholder: "Buscar amigos o grupos...",
          icon: "magnifyingglass"
        )
      }
      .listRowSeparator(.hidden)
      .listRowBackground(SwiftUI.Color.clear)

      if isShowingCachedGroups {
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

      if isLoadingGroups, groups.isEmpty {
        groupSkeletonRows
      } else if let groupsError {
        VCard {
          VStack(alignment: .leading, spacing: VinctusTokens.Spacing.sm) {
            Text(groupsError)
              .font(.footnote)
              .foregroundStyle(.red)

            VButton("Reintentar", variant: .secondary) {
              Task {
                await refreshData()
              }
            }
          }
        }
        .listRowSeparator(.hidden)
        .listRowBackground(SwiftUI.Color.clear)
      } else if filteredGroups.isEmpty, vm.isSearchActive {
        VCard {
          Text("Sin grupos para esa busqueda.")
            .font(.footnote)
            .foregroundStyle(VinctusTokens.Color.textMuted)
        }
        .listRowSeparator(.hidden)
        .listRowBackground(SwiftUI.Color.clear)
      } else if !filteredGroups.isEmpty {
        Section(vm.isSearchActive ? "Resultados de grupos" : "Grupos recientes") {
          ForEach(filteredGroups.prefix(10)) { group in
            NavigationLink(destination: GroupView(repo: groupsRepo, groupID: group.id)) {
              DiscoverGroupCard(group: group)
            }
            .buttonStyle(.plain)
          }
        }
        .textCase(.uppercase)
        .listRowBackground(SwiftUI.Color.clear)
      }

      if vm.isInitialLoading, vm.displayedUsers.isEmpty {
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
      } else if vm.displayedUsers.isEmpty {
        VCard {
          VStack(alignment: .leading, spacing: 6) {
            Text(vm.isSearchActive ? "Sin resultados" : "Aun no hay personas recientes")
              .font(.headline)
              .foregroundStyle(VinctusTokens.Color.textPrimary)
            Text(
              vm.isSearchActive
                ? "Prueba otro termino de busqueda."
                : "Cuando existan perfiles recientes, apareceran aqui."
            )
            .font(.footnote)
            .foregroundStyle(VinctusTokens.Color.textMuted)
          }
        }
        .listRowSeparator(.hidden)
        .listRowBackground(SwiftUI.Color.clear)
      } else {
        Section(vm.isSearchActive ? "Resultados de personas" : "Personas recientes") {
          ForEach(vm.displayedUsers) { user in
            NavigationLink(destination: ProfileView(repo: profileRepo, userID: user.uid)) {
              DiscoverUserRow(user: user)
            }
          }
        }
        .textCase(.uppercase)
        .listRowBackground(SwiftUI.Color.clear)
      }

      if vm.isSearching {
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
    }
    .listStyle(.plain)
    .toolbar(.hidden, for: .navigationBar)
    .scrollContentBackground(.hidden)
    .background(VinctusTokens.Color.background)
    .onChange(of: vm.searchText) { _, newValue in
      vm.handleSearchTextChange(newValue)
    }
    .task(id: authVM.currentUserID) {
      await refreshData()
    }
    .refreshable {
      await refreshData()
      if vm.isSearchActive {
        vm.handleSearchTextChange(vm.searchText)
      }
    }
  }

  private var normalizedSearchQuery: String {
    vm.searchText.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
  }

  private var filteredGroups: [GroupSummary] {
    guard vm.isSearchActive else { return groups }
    return groups.filter { group in
      group.name.lowercased().contains(normalizedSearchQuery)
        || group.description.lowercased().contains(normalizedSearchQuery)
        || (group.categoryID?.lowercased().contains(normalizedSearchQuery) ?? false)
    }
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
    await refreshGroups()
  }

  @MainActor
  private func refreshGroups() async {
    guard !isLoadingGroups else { return }
    isLoadingGroups = true
    groupsError = nil
    defer { isLoadingGroups = false }

    do {
      let page = try await groupsRepo.fetchGroups(limit: 20)
      groups = page.items
      isShowingCachedGroups = page.isFromCache
    } catch {
      groupsError = error.localizedDescription
    }
  }
}

private struct DiscoverUserRow: View {
  let user: DiscoverUser

  var body: some View {
    HStack(spacing: VinctusTokens.Spacing.md) {
      DiscoverAvatarView(name: user.displayName, photoURLString: user.photoURL, size: 44)

      VStack(alignment: .leading, spacing: 3) {
        Text(user.displayName)
          .font(.headline)
          .foregroundStyle(VinctusTokens.Color.textPrimary)

        Text(user.accountVisibility == .private ? "Perfil privado" : "Perfil publico")
          .font(.caption)
          .foregroundStyle(VinctusTokens.Color.textMuted)
      }

      Spacer()

      Image(systemName: "chevron.right")
        .font(.caption)
        .foregroundStyle(VinctusTokens.Color.textMuted.opacity(0.8))
    }
    .padding(.vertical, 2)
  }
}

private struct DiscoverAvatarView: View {
  let name: String
  let photoURLString: String?
  let size: CGFloat

  var body: some View {
    ZStack {
      Circle()
        .fill(VinctusTokens.Color.surface2)

      if let url = avatarURL {
        AsyncImage(url: url) { phase in
          switch phase {
          case .empty:
            ProgressView()
              .controlSize(.small)
          case .success(let image):
            image
              .resizable()
              .scaledToFill()
          case .failure:
            initials
          @unknown default:
            initials
          }
        }
      } else {
        initials
      }
    }
    .frame(width: size, height: size)
    .clipShape(Circle())
  }

  private var avatarURL: URL? {
    guard let photoURLString else { return nil }
    return URL(string: photoURLString)
  }

  private var initials: some View {
    Text(String(name.prefix(1)).uppercased())
      .font(.subheadline)
      .foregroundStyle(VinctusTokens.Color.textMuted)
  }
}

private struct DiscoverHeaderBar: View {
  let onTapCreatePost: () -> Void

  var body: some View {
    ZStack {
      HStack {
        Circle()
          .fill(VinctusTokens.Color.accent)
          .frame(width: 44, height: 44)
          .overlay(
            Image(systemName: "plus")
              .font(.title3.weight(.semibold))
              .foregroundStyle(.black)
          )
          .contentShape(Circle())
          .onTapGesture {
            onTapCreatePost()
          }
          .accessibilityLabel("Crear publicacion")
          .accessibilityAddTraits(.isButton)

        Spacer()

        HStack(spacing: 16) {
          Image(systemName: "sparkles")
          Image(systemName: "bell")
        }
        .foregroundStyle(VinctusTokens.Color.textMuted)
        .allowsHitTesting(false)
      }
      .frame(maxWidth: .infinity)
      Text("Vinctus")
        .font(VinctusTokens.Typography.brandTitle(size: 38))
        .foregroundStyle(VinctusTokens.Color.textPrimary)
        .frame(maxWidth: .infinity, alignment: .center)
        .allowsHitTesting(false)
    }
    .padding(.top, 2)
    .padding(.bottom, 4)
  }
}

private struct DiscoverTopSafeAreaBackground: View {
  var body: some View {
    GeometryReader { proxy in
      VinctusTokens.Color.background
        .frame(height: proxy.safeAreaInsets.top)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .ignoresSafeArea(edges: .top)
        .allowsHitTesting(false)
    }
    .allowsHitTesting(false)
  }
}

private struct DiscoverFloatingHeaderOverlay: View {
  let isVisible: Bool
  let onTapCreatePost: () -> Void

  var body: some View {
    GeometryReader { proxy in
      if isVisible {
        DiscoverHeaderBar(onTapCreatePost: onTapCreatePost)
          .padding(.horizontal, 16)
          .padding(.top, proxy.safeAreaInsets.top + 2)
          .padding(.bottom, 6)
          .frame(maxWidth: .infinity, alignment: .top)
          .background(VinctusTokens.Color.background.opacity(0.98))
          .transition(.move(edge: .top).combined(with: .opacity))
      }
    }
    .allowsHitTesting(isVisible)
  }
}

private struct DiscoverHeaderOffsetPreferenceKey: PreferenceKey {
  static var defaultValue: CGFloat = .zero

  static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
    value = nextValue()
  }
}

private struct DiscoverCurationHero: View {
  @Binding var searchText: String

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      Text("DESCUBRIR")
        .font(.caption.weight(.semibold))
        .tracking(4)
        .foregroundStyle(VinctusTokens.Color.textMuted)

      (
        Text("Curaduria de ")
          .foregroundStyle(VinctusTokens.Color.textPrimary) +
        Text("Intereses")
          .foregroundStyle(VinctusTokens.Color.accent)
      )
      .font(VinctusTokens.Typography.brandTitle(size: 40))

      HStack(spacing: 10) {
        Image(systemName: "line.3.horizontal.decrease.circle")
          .foregroundStyle(VinctusTokens.Color.textMuted)
        TextField("Buscar intereses o grupos...", text: $searchText)
          .textInputAutocapitalization(.never)
          .autocorrectionDisabled()
          .foregroundStyle(VinctusTokens.Color.textPrimary)
        Image(systemName: "magnifyingglass")
          .foregroundStyle(VinctusTokens.Color.textMuted)
      }
      .padding(.horizontal, 14)
      .padding(.vertical, 12)
      .background(VinctusTokens.Color.surface)
      .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
      .overlay(
        RoundedRectangle(cornerRadius: 20, style: .continuous)
          .stroke(VinctusTokens.Color.border.opacity(0.6), lineWidth: 1)
      )
    }
    .padding(.bottom, 10)
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

private struct DiscoverStoryChip: View {
  let user: DiscoverUser

  var body: some View {
    VStack(spacing: 8) {
      ZStack {
        Circle()
          .stroke(VinctusTokens.Color.accent, lineWidth: 2)
          .frame(width: 66, height: 66)
        DiscoverAvatarView(name: user.displayName, photoURLString: user.photoURL, size: 56)
      }

      Text(user.displayName)
        .font(.caption)
        .foregroundStyle(VinctusTokens.Color.textMuted)
        .lineLimit(1)
    }
    .frame(width: 84)
  }
}

private struct DiscoverTrendCard: View {
  let trend: DiscoverTrend

  var body: some View {
    VCard {
      VStack(alignment: .leading, spacing: 12) {
        HStack {
          Image(systemName: trend.icon)
            .foregroundStyle(SwiftUI.Color.blue)
          Spacer()
          Text(trend.rankLabel)
            .font(.caption2.weight(.semibold))
            .padding(.horizontal, 10)
            .padding(.vertical, 4)
            .background(VinctusTokens.Color.accent.opacity(0.18))
            .foregroundStyle(VinctusTokens.Color.accent)
            .clipShape(Capsule())
        }

        Text(trend.title)
          .font(VinctusTokens.Typography.sectionTitle(size: 34))
          .foregroundStyle(VinctusTokens.Color.textPrimary)

        Text(trend.subtitle)
          .font(.footnote)
          .foregroundStyle(VinctusTokens.Color.textMuted)
          .lineLimit(2)

        HStack(spacing: 8) {
          Text(trend.scoreLabel)
            .badgeStyle()
          Text("SIGUIENDO")
            .badgeStyle(selected: true)
        }

        HStack(spacing: 8) {
          Text(trend.signalLabel)
            .badgeStyle()
          Text(trend.groupsLabel)
            .badgeStyle()
        }

        WrapTags(tags: trend.tags)
      }
    }
    .frame(width: 320)
  }
}

private struct DiscoverGroupCard: View {
  let group: GroupSummary

  var body: some View {
    VCard {
      HStack(spacing: VinctusTokens.Spacing.md) {
        DiscoverGroupIcon(name: group.name, iconURL: group.iconURL, size: 48)

        VStack(alignment: .leading, spacing: 4) {
          Text(group.name)
            .font(.headline)
            .foregroundStyle(VinctusTokens.Color.textPrimary)
            .lineLimit(1)

          Text(group.description.isEmpty ? "Sin descripcion." : group.description)
            .font(.footnote)
            .foregroundStyle(VinctusTokens.Color.textMuted)
            .lineLimit(2)

          Text("\(group.memberCount) miembros")
            .font(.caption)
            .foregroundStyle(VinctusTokens.Color.textMuted)
        }

        Spacer()

        Image(systemName: "chevron.right")
          .font(.caption.weight(.semibold))
          .foregroundStyle(VinctusTokens.Color.textMuted)
      }
    }
  }
}

private struct DiscoverGroupIcon: View {
  let name: String
  let iconURL: String?
  let size: CGFloat

  var body: some View {
    ZStack {
      RoundedRectangle(cornerRadius: 12, style: .continuous)
        .fill(VinctusTokens.Color.surface2)

      if let iconURL, let url = URL(string: iconURL) {
        AsyncImage(url: url) { phase in
          switch phase {
          case .empty:
            ProgressView()
              .controlSize(.small)
          case .success(let image):
            image
              .resizable()
              .scaledToFill()
          case .failure:
            initials
          @unknown default:
            initials
          }
        }
      } else {
        initials
      }
    }
    .frame(width: size, height: size)
    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
  }

  private var initials: some View {
    Text(String(name.prefix(1)).uppercased())
      .font(.headline)
      .foregroundStyle(VinctusTokens.Color.textMuted)
  }
}

private struct WrapTags: View {
  let tags: [String]

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      ForEach(rows, id: \.self) { row in
        HStack(spacing: 8) {
          ForEach(row, id: \.self) { tag in
            Text(tag.uppercased())
              .font(.caption2)
              .padding(.horizontal, 10)
              .padding(.vertical, 6)
              .background(VinctusTokens.Color.surface2)
              .foregroundStyle(VinctusTokens.Color.textMuted)
              .clipShape(Capsule())
          }
        }
      }
    }
  }

  private var rows: [[String]] {
    var result: [[String]] = []
    var current: [String] = []

    for (index, tag) in tags.enumerated() {
      current.append(tag)
      if current.count == 2 || index == tags.count - 1 {
        result.append(current)
        current = []
      }
    }

    return result
  }
}

private extension View {
  func badgeStyle(selected: Bool = false) -> some View {
    self
      .font(.caption2.weight(.semibold))
      .padding(.horizontal, 10)
      .padding(.vertical, 6)
      .background(selected ? VinctusTokens.Color.accent.opacity(0.2) : VinctusTokens.Color.surface2)
      .foregroundStyle(selected ? VinctusTokens.Color.accent : VinctusTokens.Color.textMuted)
      .clipShape(Capsule())
  }
}

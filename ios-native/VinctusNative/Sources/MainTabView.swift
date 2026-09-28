import SwiftUI
import UIKit

struct MainTabView: View {
  private let createPostRepo = FirebaseCreatePostRepo()
  private let discoverRepo = AppRepos.discover()
  private let feedRepo = AppRepos.feed()
  private let profileRepo = AppRepos.profile()
  private let groupsRepo = AppRepos.groups()
  private let aiRepo = FirebaseAIRepo()
  private let chatRepo = AppRepos.chat()
  @StateObject private var blockedUsers = BlockedUsersStore(repo: FirebaseModerationRepo())

  init() {
    let appearance = UITabBarAppearance()
    appearance.configureWithTransparentBackground()
    appearance.backgroundEffect = UIBlurEffect(style: .systemUltraThinMaterialDark)
    appearance.backgroundColor = UIColor(VinctusTokens.Color.background).withAlphaComponent(0.84)
    appearance.shadowColor = .clear

    let normalColor = UIColor(VinctusTokens.Color.textMuted)
    let selectedColor = UIColor(VinctusTokens.Color.accent)
    let hiddenTitleAttributes: [NSAttributedString.Key: Any] = [
      .foregroundColor: UIColor.clear,
    ]

    for layout in [
      appearance.stackedLayoutAppearance,
      appearance.inlineLayoutAppearance,
      appearance.compactInlineLayoutAppearance,
    ] {
      layout.normal.iconColor = normalColor
      layout.normal.titleTextAttributes = hiddenTitleAttributes
      layout.selected.iconColor = selectedColor
      layout.selected.titleTextAttributes = hiddenTitleAttributes
      layout.normal.titlePositionAdjustment = UIOffset(horizontal: 0, vertical: 20)
      layout.selected.titlePositionAdjustment = UIOffset(horizontal: 0, vertical: 20)
    }

    UITabBar.appearance().standardAppearance = appearance
    UITabBar.appearance().scrollEdgeAppearance = appearance
    UITabBar.appearance().unselectedItemTintColor = normalColor
  }

  /// Screenshot builds open a tab with `-VinctusTab <name>`.
  @State private var selectedTab = AppRepos.demoArgument("-VinctusTab") ?? "discover"

  var body: some View {
    TabView(selection: $selectedTab) {
      NavigationStack {
        DiscoverView(
          repo: discoverRepo,
          profileRepo: profileRepo,
          groupsRepo: groupsRepo,
          createPostRepo: createPostRepo,
          aiRepo: aiRepo
        )
      }
      .tabItem { Label("Descubrir", systemImage: "safari") }
      .tag("discover")

      NavigationStack {
        ConnectionsSearchView(
          repo: discoverRepo,
          profileRepo: profileRepo,
          groupsRepo: groupsRepo
        )
      }
      .tabItem { Label("Buscar", systemImage: "magnifyingglass") }
      .tag("search")

      NavigationStack {
        FeedView(repo: feedRepo, profileRepo: profileRepo)
      }
      .tabItem { Label("Comunidad", systemImage: "number") }
      .tag("feed")

      NavigationStack {
        MessagesListView(repo: chatRepo, profileRepo: profileRepo)
      }
      .tabItem { Label("Mensajes", systemImage: "bubble.left.and.bubble.right") }
      .tag("messages")

      NavigationStack {
        ProfileRootView(repo: profileRepo)
      }
      .tabItem { Label("Perfil", systemImage: "person.crop.circle") }
      .tag("profile")
    }
    .tint(VinctusTokens.Color.accent)
    .background(VinctusTokens.Color.background.ignoresSafeArea())
    .environmentObject(blockedUsers)
    .task {
      await blockedUsers.refresh()
    }
  }
}

private struct ProfileRootView: View {
  @EnvironmentObject private var authVM: AuthViewModel
  let repo: ProfileRepo

  var body: some View {
    Group {
      if let currentUserID = authVM.currentUserID {
        ProfileView(repo: repo, userID: currentUserID)
      } else {
        VCard {
          Text("No hay sesión activa.")
            .foregroundStyle(VinctusTokens.Color.textMuted)
        }
        .padding()
      }
    }
    .toolbar {
      ToolbarItem(placement: .topBarTrailing) {
        NavigationLink(destination: SettingsView()) {
          Image(systemName: "gearshape")
            .foregroundStyle(VinctusTokens.Color.textPrimary)
        }
      }
    }
  }
}

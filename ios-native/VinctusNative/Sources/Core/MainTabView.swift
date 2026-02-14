import SwiftUI
import UIKit

struct MainTabView: View {
  private let createPostRepo = FirebaseCreatePostRepo()
  private let discoverRepo = FirebaseDiscoverRepo()
  private let feedRepo = FirebaseFeedRepo()
  private let profileRepo = FirebaseProfileRepo()
  private let groupsRepo = FirebaseGroupsRepo()

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

  var body: some View {
    TabView {
      NavigationStack {
        DiscoverView(
          repo: discoverRepo,
          profileRepo: profileRepo,
          groupsRepo: groupsRepo,
          createPostRepo: createPostRepo
        )
      }
      .tabItem { Label("Descubrir", systemImage: "location.north.line") }

      NavigationStack {
        ConnectionsSearchView(
          repo: discoverRepo,
          profileRepo: profileRepo,
          groupsRepo: groupsRepo
        )
      }
      .tabItem { Label("Buscar", systemImage: "magnifyingglass") }

      NavigationStack {
        FeedView(repo: feedRepo, profileRepo: profileRepo)
      }
      .tabItem { Label("Comunidad", systemImage: "number") }

      NavigationStack {
        GroupsListView(repo: groupsRepo)
      }
      .tabItem { Label("Conexiones", systemImage: "briefcase") }

      NavigationStack {
        ProfileRootView(repo: profileRepo)
      }
      .tabItem { Label("Perfil", systemImage: "person.crop.circle") }
    }
    .tint(VinctusTokens.Color.accent)
    .background(VinctusTokens.Color.background.ignoresSafeArea())
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
          Text("No hay sesion activa.")
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

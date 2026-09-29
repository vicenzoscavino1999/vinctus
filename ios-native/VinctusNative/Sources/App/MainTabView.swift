import SwiftUI
import UIKit

struct MainTabView: View {
  private let discoverRepo = AppRepos.discover()
  private let feedRepo = AppRepos.feed()
  private let profileRepo = AppRepos.profile()
  private let groupsRepo = AppRepos.groups()
  private let aiRepo = AppRepos.ai()
  private let chatRepo = AppRepos.chat()
  @StateObject private var blockedUsers = BlockedUsersStore(repo: AppRepos.moderation())

  /// Screenshot builds open a tab with `-VinctusTab <name>`.
  @State private var selectedTab = AppRepos.demoArgument("-VinctusTab") ?? "discover"
  @State private var isKeyboardVisible = false

  var body: some View {
    TabView(selection: $selectedTab) {
      NavigationStack {
        DiscoverView(
          repo: discoverRepo,
          profileRepo: profileRepo,
          groupsRepo: groupsRepo,
          aiRepo: aiRepo
        )
      }
      .toolbar(.hidden, for: .tabBar)
      .tag("discover")

      NavigationStack {
        ConnectionsSearchView(
          repo: discoverRepo,
          profileRepo: profileRepo,
          groupsRepo: groupsRepo
        )
      }
      .toolbar(.hidden, for: .tabBar)
      .tag("search")

      NavigationStack {
        FeedView(repo: feedRepo, profileRepo: profileRepo)
      }
      .toolbar(.hidden, for: .tabBar)
      .tag("feed")

      NavigationStack {
        MessagesListView(repo: chatRepo, profileRepo: profileRepo)
      }
      .toolbar(.hidden, for: .tabBar)
      .tag("messages")

      NavigationStack {
        ProfileRootView(repo: profileRepo)
      }
      .toolbar(.hidden, for: .tabBar)
      .tag("profile")
    }
    // The web's flat bottom bar instead of the system tab bar. It hides while typing, so it
    // never sits above the keyboard (for example over the chat composer).
    .safeAreaInset(edge: .bottom, spacing: 0) {
      if !isKeyboardVisible {
        FlatTabBar(selection: $selectedTab)
      }
    }
    .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillShowNotification)) { _ in
      isKeyboardVisible = true
    }
    .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillHideNotification)) { _ in
      isKeyboardVisible = false
    }
    .tint(VinctusTokens.Color.accent)
    .background(VinctusTokens.Color.background.ignoresSafeArea())
    .environmentObject(blockedUsers)
    .task {
      await blockedUsers.refresh()
    }
  }
}

/// Bottom navigation like the web's MobileNav (`src/app/routes/AppLayout.tsx`): thin icons,
/// white when selected and gray otherwise, over a thin top border.
private struct FlatTabBar: View {
  @Binding var selection: String

  private struct Item {
    let tag: String
    let icon: String
    let title: String
  }

  private let items = [
    Item(tag: "discover", icon: "safari", title: "Descubrir"),
    Item(tag: "search", icon: "magnifyingglass", title: "Buscar"),
    Item(tag: "feed", icon: "number", title: "Comunidad"),
    Item(tag: "messages", icon: "bubble.left.and.bubble.right", title: "Mensajes"),
    Item(tag: "profile", icon: "person", title: "Perfil"),
  ]

  var body: some View {
    HStack(spacing: 0) {
      ForEach(items, id: \.tag) { item in
        let isSelected = selection == item.tag
        Button {
          selection = item.tag
        } label: {
          Image(systemName: item.icon)
            .font(.system(size: 22, weight: .light))
            .foregroundStyle(isSelected ? VinctusTokens.Color.textPrimary : SwiftUI.Color(white: 0.34))
            .frame(maxWidth: .infinity, minHeight: 48)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(item.title)
        .accessibilityAddTraits(isSelected ? .isSelected : [])
      }
    }
    .padding(.horizontal, 12)
    .padding(.top, 4)
    .background(VinctusTokens.Color.background.opacity(0.95))
    .background(.ultraThinMaterial)
    .overlay(alignment: .top) {
      Rectangle()
        .fill(SwiftUI.Color(white: 0.09))
        .frame(height: 0.5)
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

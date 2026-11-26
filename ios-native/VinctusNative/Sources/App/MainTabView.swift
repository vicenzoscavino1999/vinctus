import SwiftUI
import UIKit

struct MainTabView: View {
  @EnvironmentObject private var authVM: AuthViewModel
  private let discoverRepo = AppRepos.discover()
  private let feedRepo = AppRepos.feed()
  private let connectionsRepo = AppRepos.connections()
  private let profileRepo = AppRepos.profile()
  private let profileContentRepo = AppRepos.profileContent()
  private let groupsRepo = AppRepos.groups()
  private let aiRepo = AppRepos.ai()
  private let chatRepo = AppRepos.chat()
  @StateObject private var blockedUsers = BlockedUsersStore(repo: AppRepos.moderation())

  /// Screenshot builds open a tab with `-VinctusTab <name>`.
  @State private var selectedTab = AppRepos.demoArgument("-VinctusTab") ?? "discover"
  /// Tabs built so far. Each stays alive afterwards (its navigation and scroll position are
  /// kept), like a tab bar controller.
  @State private var loadedTabs: Set<String> = []
  @State private var isKeyboardVisible = false
  @State private var isBottomNavigationHidden = false

  /// Same tabs, order and icons as the web's MobileNav: Descubrir, Buscar, Mensajes (#),
  /// Conexiones and Perfil. The feed lives inside Descubrir, as on the web.
  static let tabs = ["discover", "search", "messages", "connections", "profile"]
  /// After launch, the other tabs are built in the background so the first switch is instant.
  static let warmUpDelay: UInt64 = 2_000_000_000

  /// A plain container instead of TabView. With TabView the system tab bar (hidden behind the
  /// web-style bar) flashed the first time a tab opened, and the space of our bar did not reach
  /// the screens, so their last part stayed under it and bounced back after scrolling.
  var body: some View {
    ZStack {
      ForEach(Self.tabs, id: \.self) { tab in
        if tab == selectedTab || loadedTabs.contains(tab) {
          tabRoot(tab)
            .environment(\.isActiveTab, tab == selectedTab)
            .opacity(tab == selectedTab ? 1 : 0)
            .allowsHitTesting(tab == selectedTab)
            .accessibilityHidden(tab != selectedTab)
            .zIndex(tab == selectedTab ? 1 : 0)
        }
      }
    }
    // The web's flat bottom bar. As a safe-area inset every screen ends above it. It hides
    // while typing, so it never sits above the keyboard (for example over the chat composer).
    .safeAreaInset(edge: .bottom, spacing: 0) {
      if !isKeyboardVisible && !isBottomNavigationHidden {
        FlatTabBar(selection: $selectedTab)
      }
    }
    .onChange(of: selectedTab, initial: true) { _, tab in
      loadedTabs.insert(tab)
    }
    .task {
      try? await Task.sleep(nanoseconds: Self.warmUpDelay)
      loadedTabs.formUnion(Self.tabs)
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
    .environment(\.setBottomNavigationHidden) { hidden in
      isBottomNavigationHidden = hidden
    }
    .task(id: authVM.currentUserID) {
      await blockedUsers.refresh(for: authVM.currentUserID)
    }
  }

  @ViewBuilder
  private func tabRoot(_ tab: String) -> some View {
    switch tab {
    case "discover":
      NavigationStack {
        DiscoverView(
          repo: discoverRepo,
          profileRepo: profileRepo,
          groupsRepo: groupsRepo,
          aiRepo: aiRepo,
          profileContentRepo: profileContentRepo,
          feedRepo: feedRepo
        )
      }
    case "search":
      NavigationStack {
        ConnectionsSearchView(
          repo: discoverRepo,
          profileRepo: profileRepo,
          groupsRepo: groupsRepo
        )
      }
    case "messages":
      NavigationStack {
        MessagesListView(repo: chatRepo, profileRepo: profileRepo)
      }
    case "connections":
      NavigationStack {
        ConnectionsView(repo: connectionsRepo)
      }
    default:
      NavigationStack {
        ProfileRootView(repo: profileRepo)
      }
    }
  }
}

/// Bottom navigation identical to the web's MobileNav (`src/app/routes/AppLayout.tsx`): the same
/// five destinations, order and icons (Compass, Search, Hash, Briefcase, User), thin strokes with
/// a short label, white when selected and gray otherwise, over a thin top border.
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
    Item(tag: "messages", icon: "number", title: "Mensajes"),
    Item(tag: "connections", icon: "briefcase", title: "Conexiones"),
    Item(tag: "profile", icon: "person", title: "Perfil"),
  ]

  var body: some View {
    HStack(spacing: 0) {
      ForEach(items, id: \.tag) { item in
        let isSelected = selection == item.tag
        Button {
          selection = item.tag
        } label: {
          VStack(spacing: 3) {
            Image(systemName: item.icon)
              .font(.system(size: 21, weight: .light))
            Text(item.title)
              .font(.system(size: 10, weight: isSelected ? .semibold : .regular))
              .lineLimit(1)
              .minimumScaleFactor(0.8)
          }
          .foregroundStyle(isSelected ? VinctusTokens.Color.textPrimary : VinctusTokens.Color.textMuted)
          .frame(maxWidth: .infinity, minHeight: 50)
          .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(item.title)
        .accessibilityAddTraits(isSelected ? .isSelected : [])
        .accessibilityIdentifier("tab-\(item.tag)")
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

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
  /// Height of the bottom bar above the home indicator, measured.
  @State private var barHeight: CGFloat = 54.5
  @Environment(\.scenePhase) private var scenePhase
  /// Ajustes > Apariencia: Clásico (default) or Vidrio (Liquid Glass, iOS 26).
  @AppStorage(AppAppearance.storageKey) private var appearance = AppAppearance.classic.rawValue
  private var usesGlass: Bool { AppAppearance.usesGlass(saved: appearance) }

  /// Same tabs, order and icons as the web's MobileNav: Descubrir, Buscar, Mensajes (#),
  /// Conexiones and Perfil. The feed lives inside Descubrir, as on the web.
  static let tabs = ["discover", "search", "messages", "connections", "profile"]
  /// After launch, the other tabs are built in the background so the first switch is instant.
  static let warmUpDelay: UInt64 = 2_000_000_000

  private var showsBar: Bool {
    !isKeyboardVisible && !isBottomNavigationHidden
  }

  /// The tabs live in `TabPagesView`, a UIKit container, instead of a TabView. With TabView the
  /// system tab bar (hidden behind the web-style bar) flashed the first time a tab opened, and the
  /// space of our bar did not reach the screens inside each NavigationStack, so their last part
  /// stayed under it and bounced back after scrolling.
  var body: some View {
    ZStack(alignment: .bottom) {
      TabPagesView(
        selection: selectedTab,
        built: Self.tabs.filter { $0 == selectedTab || loadedTabs.contains($0) },
        bottomInset: showsBar ? barHeight : 0,
        page: page
      )
      .ignoresSafeArea()

      // The web's flat bottom bar. It hides while typing, so it never sits above the keyboard
      // (for example over the chat composer).
      if showsBar {
        FlatTabBar(selection: $selectedTab, usesGlass: usesGlass)
          .onGeometryChange(for: CGFloat.self) { proxy in
            proxy.size.height
          } action: { height in
            barHeight = height
          }
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
    .background(VinctusTokens.Color.background.ignoresSafeArea())
    .task(id: authVM.currentUserID) {
      await blockedUsers.refresh(for: authVM.currentUserID)
    }
  }

  /// One tab's screens. Each tab is hosted by its own UIKit controller, which does not inherit
  /// SwiftUI's environment, so everything the screens read from above is passed here.
  private func page(_ tab: String) -> AnyView {
    AnyView(
      tabRoot(tab)
        .environment(\.isActiveTab, tab == selectedTab)
        .environment(\.setBottomNavigationHidden) { hidden in
          isBottomNavigationHidden = hidden
        }
        .environment(\.scenePhase, scenePhase)
        .environment(\.usesGlass, usesGlass)
        .environmentObject(authVM)
        .environmentObject(blockedUsers)
        .tint(VinctusTokens.Color.accent)
    )
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

/// Holds the tabs the way UITabBarController does: each tab in its own hosting controller, kept
/// alive once built; the others hidden, so they take no touches and VoiceOver skips them; and the
/// space of the bottom bar given to every tab as a UIKit safe-area inset, which reaches every
/// screen pushed in its navigation stack.
private struct TabPagesView: UIViewControllerRepresentable {
  let selection: String
  let built: [String]
  let bottomInset: CGFloat
  let page: (String) -> AnyView

  func makeUIViewController(context: Context) -> TabPagesController {
    TabPagesController()
  }

  func updateUIViewController(_ controller: TabPagesController, context: Context) {
    controller.show(selection: selection, built: built, bottomInset: bottomInset, page: page)
  }
}

private final class TabPagesController: UIViewController {
  private var pages: [String: UIHostingController<AnyView>] = [:]

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .clear
  }

  func show(selection: String, built: [String], bottomInset: CGFloat, page: (String) -> AnyView) {
    for tab in built {
      let controller: UIHostingController<AnyView>
      if let existing = pages[tab] {
        controller = existing
        controller.rootView = page(tab)
      } else {
        controller = UIHostingController(rootView: page(tab))
        controller.overrideUserInterfaceStyle = .dark
        controller.view.backgroundColor = .clear
        addChild(controller)
        controller.view.frame = view.bounds
        controller.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(controller.view)
        controller.didMove(toParent: self)
        pages[tab] = controller
      }
      if controller.additionalSafeAreaInsets.bottom != bottomInset {
        controller.additionalSafeAreaInsets.bottom = bottomInset
      }
      let isSelected = tab == selection
      controller.view.isHidden = !isSelected
      if isSelected {
        view.bringSubviewToFront(controller.view)
      }
    }
  }
}

/// Bottom navigation identical to the web's MobileNav (`src/app/routes/AppLayout.tsx`): the same
/// five destinations, order and icons (Compass, Search, Hash, Briefcase, User), thin strokes with
/// a short label, white when selected and gray otherwise, over a thin top border.
private struct FlatTabBar: View {
  @Binding var selection: String
  /// "Vidrio": a floating glass capsule over the content, like iOS 26's own tab bar.
  var usesGlass = false

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
    if usesGlass {
      buttons
        .padding(.horizontal, 6)
        .padding(.vertical, 4)
        .vinctusGlass(true, in: Capsule())
        .padding(.horizontal, 14)
        .padding(.bottom, 2)
    } else {
      buttons
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

  private var buttons: some View {
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
          .frame(maxWidth: .infinity, minHeight: usesGlass ? 48 : 50)
          .background {
            // In glass the selected tab sits on a soft pill, like the system's.
            if usesGlass && isSelected {
              Capsule().fill(SwiftUI.Color.white.opacity(0.12))
            }
          }
          .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(item.title)
        .accessibilityAddTraits(isSelected ? .isSelected : [])
        .accessibilityIdentifier("tab-\(item.tag)")
      }
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

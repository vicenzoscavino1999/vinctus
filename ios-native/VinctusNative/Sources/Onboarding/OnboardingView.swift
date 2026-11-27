import SwiftUI

/// Who sees the welcome: new accounts only, once per account on this device (like the web).
enum WelcomeDecision {
  /// Accounts older than this already know Vinctus.
  static let newAccountWindow: TimeInterval = 24 * 60 * 60

  static func isNewAccount(_ profile: UserProfile?, now: Date = Date()) -> Bool {
    guard let profile else { return true }
    return now.timeIntervalSince(profile.createdAt) <= newAccountWindow && profile.postsCount == 0
  }

  static func storageKey(uid: String) -> String { "vinctus.onboardingComplete.\(uid)" }
}

/// The welcome after signing up: what Vinctus is, interests to follow (followed categories) and
/// real public groups to join, like the web's OnboardingFlow.
@MainActor
final class OnboardingViewModel: ObservableObject {
  static let minInterests = 2
  static let groupsToShow = 6

  @Published var step = 0
  @Published private(set) var interests: [String] = []
  @Published private(set) var groups: [GroupSummary]?
  @Published private(set) var selectedGroups: Set<String> = []
  @Published private(set) var isFinishing = false

  private let groupsRepo: any GroupsRepo
  private let profileContentRepo: ProfileContentRepo

  init(groupsRepo: any GroupsRepo, profileContentRepo: ProfileContentRepo) {
    self.groupsRepo = groupsRepo
    self.profileContentRepo = profileContentRepo
  }

  var canContinue: Bool { step != 1 || interests.count >= Self.minInterests }

  func toggleInterest(_ id: String) {
    if let index = interests.firstIndex(of: id) {
      interests.remove(at: index)
    } else {
      interests.append(id)
    }
  }

  func toggleGroup(_ id: String) {
    if selectedGroups.contains(id) {
      selectedGroups.remove(id)
    } else {
      selectedGroups.insert(id)
    }
  }

  /// Public groups only (private ones need a request); a failure just shows none.
  func loadGroups() async {
    guard groups == nil else { return }
    let all = (try? await groupsRepo.fetchGroups(limit: 50).items) ?? []
    groups = all.filter { $0.visibility == .public }
  }

  /// The chosen interests' groups first, then the biggest.
  var suggestedGroups: [GroupSummary] {
    let chosen = Set(interests)
    return Array((groups ?? []).sorted { lhs, rhs in
      let left = chosen.contains(lhs.categoryID ?? "")
      let right = chosen.contains(rhs.categoryID ?? "")
      if left != right { return left }
      return lhs.memberCount > rhs.memberCount
    }.prefix(Self.groupsToShow))
  }

  /// Follows the interests and joins the chosen groups; one failure doesn't stop the others.
  func finish(uid: String?) async {
    guard !isFinishing else { return }
    isFinishing = true
    defer { isFinishing = false }
    guard let uid else { return }
    for categoryID in interests {
      try? await profileContentRepo.setCategoryFollowed(true, categoryID: categoryID)
    }
    for groupID in selectedGroups {
      try? await groupsRepo.joinGroup(groupID: groupID, uid: uid)
    }
  }
}

/// Shows the welcome before the app to new accounts, once.
struct WelcomeGate<Content: View>: View {
  let content: () -> Content

  @EnvironmentObject private var authVM: AuthViewModel
  @State private var state: GateState = .checking

  private enum GateState { case checking, welcome, done }

  init(@ViewBuilder content: @escaping () -> Content) {
    self.content = content
  }

  var body: some View {
    Group {
      switch state {
      case .checking:
        ProgressView()
          .frame(maxWidth: .infinity, maxHeight: .infinity)
      case .welcome:
        OnboardingView {
          markDone()
        }
      case .done:
        content()
      }
    }
    .task(id: authVM.currentUserID) { await decide() }
  }

  private func decide() async {
    if AppRepos.demoArgument("-VinctusShowWelcome") != nil {
      state = .welcome
      return
    }
    guard let uid = authVM.currentUserID else {
      state = .done
      return
    }
    if UserDefaults.standard.bool(forKey: WelcomeDecision.storageKey(uid: uid)) {
      state = .done
      return
    }
    let profile = try? await AppRepos.profile().fetchUserProfile(uid: uid)
    if WelcomeDecision.isNewAccount(profile) {
      state = .welcome
    } else {
      markDone()
    }
  }

  private func markDone() {
    if let uid = authVM.currentUserID {
      UserDefaults.standard.set(true, forKey: WelcomeDecision.storageKey(uid: uid))
    }
    withAnimation(.easeOut(duration: 0.25)) { state = .done }
  }
}

struct OnboardingView: View {
  let onFinished: () -> Void

  @EnvironmentObject private var authVM: AuthViewModel
  @StateObject private var vm: OnboardingViewModel

  init(
    groupsRepo: any GroupsRepo = AppRepos.groups(),
    profileContentRepo: ProfileContentRepo = AppRepos.profileContent(),
    onFinished: @escaping () -> Void
  ) {
    self.onFinished = onFinished
    _vm = StateObject(wrappedValue: OnboardingViewModel(groupsRepo: groupsRepo, profileContentRepo: profileContentRepo))
  }

  var body: some View {
    VStack(spacing: 0) {
      progress
        .padding(.top, 16)
        .padding(.bottom, 8)
      ScrollView {
        Group {
          switch vm.step {
          case 0: welcome
          case 1: interestsStep
          default: groupsStep
          }
        }
        .padding(.horizontal, VinctusTokens.Spacing.lg)
        .padding(.bottom, 24)
      }
      footer
    }
    .background(VinctusTokens.Color.background.ignoresSafeArea())
    .animation(.easeOut(duration: 0.2), value: vm.step)
  }

  private var progress: some View {
    HStack(spacing: 8) {
      ForEach(0..<3, id: \.self) { index in
        Capsule()
          .fill(index <= vm.step ? VinctusTokens.Color.accent.opacity(index == vm.step ? 1 : 0.5) : SwiftUI.Color.white.opacity(0.15))
          .frame(width: index == vm.step ? 28 : 6, height: 6)
      }
    }
    .accessibilityHidden(true)
  }

  private var welcome: some View {
    VStack(spacing: 14) {
      AIAssistantAvatar(size: 76)
        .padding(.bottom, 10)
      (Text("Bienvenido a ") + Text("Vinctus").foregroundColor(VinctusTokens.Color.accent))
        .font(VinctusTokens.Typography.serif(34))
        .foregroundStyle(VinctusTokens.Color.textPrimary)
        .multilineTextAlignment(.center)
      Text("Una red social basada en lo que realmente te apasiona.")
        .font(.body)
        .foregroundStyle(VinctusTokens.Color.textSecondary)
        .multilineTextAlignment(.center)
      Text("Elige tus intereses y te mostraremos personas, grupos y temas que valen la pena.")
        .font(.subheadline)
        .foregroundStyle(VinctusTokens.Color.textMuted)
        .multilineTextAlignment(.center)
    }
    .frame(maxWidth: .infinity)
    .padding(.top, 90)
  }

  private var interestsStep: some View {
    VStack(spacing: 18) {
      stepHeader(
        title: "¿Qué te apasiona?",
        subtitle: "Elige al menos \(OnboardingViewModel.minInterests). Seguirás esas categorías y podrás cambiarlas cuando quieras."
      )
      LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) {
        ForEach(DiscoverCategory.all) { category in
          interestTile(category)
        }
      }
      Text(vm.interests.count == 1 ? "1 elegido" : "\(vm.interests.count) elegidos")
        .font(.caption)
        .foregroundStyle(VinctusTokens.Color.textMuted)
    }
    .padding(.top, 20)
  }

  private func interestTile(_ category: DiscoverCategory) -> some View {
    let isSelected = vm.interests.contains(category.id)
    return Button {
      vm.toggleInterest(category.id)
    } label: {
      VStack(alignment: .leading, spacing: 10) {
        HStack {
          Image(systemName: category.icon)
            .font(.system(size: 20))
            .foregroundStyle(VinctusTokens.Color.accent)
          Spacer()
          if isSelected {
            Image(systemName: "checkmark")
              .font(.system(size: 10, weight: .heavy))
              .foregroundStyle(.black)
              .frame(width: 20, height: 20)
              .background(VinctusTokens.Color.accent, in: Circle())
          }
        }
        Text(category.title)
          .font(.subheadline.weight(.medium))
          .foregroundStyle(isSelected ? VinctusTokens.Color.textPrimary : VinctusTokens.Color.textSecondary)
          .multilineTextAlignment(.leading)
      }
      .frame(maxWidth: .infinity, minHeight: 78, alignment: .topLeading)
      .padding(14)
      .background(isSelected ? VinctusTokens.Color.accent.opacity(0.12) : VinctusTokens.Color.surface, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
      .overlay(
        RoundedRectangle(cornerRadius: 18, style: .continuous)
          .stroke(isSelected ? VinctusTokens.Color.accent.opacity(0.7) : VinctusTokens.Color.border.opacity(0.6), lineWidth: isSelected ? 1 : 0.5)
      )
    }
    .buttonStyle(.plain)
    .accessibilityLabel(category.title)
    .accessibilityAddTraits(isSelected ? .isSelected : [])
  }

  private var groupsStep: some View {
    VStack(spacing: 18) {
      stepHeader(title: "Grupos para empezar", subtitle: "Únete a los que te interesen. Puedes saltar este paso.")
      if vm.groups == nil {
        ProgressView()
          .padding(.top, 30)
      } else if vm.suggestedGroups.isEmpty {
        Text("Aún no hay grupos públicos. Podrás crear el primero desde tu perfil.")
          .font(.subheadline)
          .foregroundStyle(VinctusTokens.Color.textMuted)
          .multilineTextAlignment(.center)
          .padding(.top, 20)
      } else {
        VStack(spacing: 10) {
          ForEach(vm.suggestedGroups) { group in
            groupRow(group)
          }
        }
      }
    }
    .padding(.top, 20)
    .task { await vm.loadGroups() }
  }

  private func groupRow(_ group: GroupSummary) -> some View {
    let isSelected = vm.selectedGroups.contains(group.id)
    return Button {
      vm.toggleGroup(group.id)
    } label: {
      HStack(spacing: 12) {
        GroupSquareIcon(name: group.name, iconURL: group.iconURL, size: 44)
        VStack(alignment: .leading, spacing: 2) {
          Text(group.name)
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(VinctusTokens.Color.textPrimary)
            .lineLimit(1)
          Text(group.memberCount == 1 ? "1 miembro" : "\(group.memberCount.formatted()) miembros")
            .font(.caption)
            .foregroundStyle(VinctusTokens.Color.textMuted)
        }
        Spacer()
        Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
          .font(.title3)
          .foregroundStyle(isSelected ? VinctusTokens.Color.accent : VinctusTokens.Color.textMuted)
      }
      .padding(12)
      .background(isSelected ? VinctusTokens.Color.accent.opacity(0.12) : VinctusTokens.Color.surface, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }
    .buttonStyle(.plain)
    .accessibilityLabel(group.name)
    .accessibilityAddTraits(isSelected ? .isSelected : [])
  }

  private func stepHeader(title: String, subtitle: String) -> some View {
    VStack(spacing: 8) {
      Text(title)
        .font(VinctusTokens.Typography.serif(30))
        .foregroundStyle(VinctusTokens.Color.textPrimary)
      Text(subtitle)
        .font(.subheadline)
        .foregroundStyle(VinctusTokens.Color.textMuted)
        .multilineTextAlignment(.center)
    }
  }

  private var primaryTitle: String {
    if vm.isFinishing { return "Preparando tu Vinctus..." }
    if vm.step < 2 { return "Continuar" }
    return vm.selectedGroups.isEmpty ? "Empezar" : "Unirme y empezar"
  }

  private var footer: some View {
    VStack(spacing: 6) {
      Button {
        if vm.step < 2 {
          vm.step += 1
        } else {
          Task {
            await vm.finish(uid: authVM.currentUserID)
            onFinished()
          }
        }
      } label: {
        HStack(spacing: 8) {
          if vm.isFinishing { ProgressView().tint(.black) }
          Text(primaryTitle)
        }
        .font(.headline)
        .foregroundStyle(.black)
        .frame(maxWidth: .infinity)
        .frame(height: 52)
        .background(VinctusTokens.Color.accent.opacity(vm.canContinue ? 1 : 0.4), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
      }
      .buttonStyle(.plain)
      .disabled(!vm.canContinue || vm.isFinishing)

      if vm.step > 0 {
        Button("Atrás") { vm.step -= 1 }
          .font(.subheadline)
          .foregroundStyle(VinctusTokens.Color.textMuted)
          .disabled(vm.isFinishing)
          .padding(.vertical, 6)
      }
    }
    .padding(.horizontal, VinctusTokens.Spacing.lg)
    .padding(.bottom, 12)
  }
}

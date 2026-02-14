import SwiftUI

enum ProfileContentTab: String, CaseIterable, Identifiable {
  case myProfile = "Mi Perfil"
  case collections = "Colecciones"

  var id: String { rawValue }
}

struct ProfileStoryItem: Identifiable, Hashable {
  let id: String
  let title: String
  let imageURL: String?
  let isOwnStory: Bool
}

struct FollowedCategory: Identifiable, Hashable {
  let id: String
  let icon: String
  let title: String
}

struct ProfileView: View {
  let userID: String

  @StateObject private var vm: ProfileViewModel
  @State private var selectedTab: ProfileContentTab = .myProfile
  @State private var isCreatePostPresented = false
  @State private var isSettingsPresented = false

  private let createPostRepo: any CreatePostRepo

  init(
    repo: ProfileRepo,
    userID: String,
    createPostRepo: any CreatePostRepo = FirebaseCreatePostRepo()
  ) {
    self.userID = userID
    self.createPostRepo = createPostRepo
    _vm = StateObject(wrappedValue: ProfileViewModel(repo: repo))
  }

  var body: some View {
    List {
      VinctusHeaderBar {
        isCreatePostPresented = true
      }
      .vinctusProfileListRowStyle()

      if vm.isLoading, vm.profile == nil {
        profileSkeleton
      }

      if let profile = vm.profile {
        ProfileIdentityCard(
          profile: profile,
          memberLabel: memberLabel(for: profile),
          locationLabel: locationLabel(for: profile),
          onTapSettings: { isSettingsPresented = true },
          onTapEdit: { isSettingsPresented = true }
        )
        .vinctusProfileListRowStyle()

        HStack(spacing: 10) {
          ProfileStatTile(title: "Publicaciones", value: profile.postsCount)
          ProfileStatTile(title: "Seguidores", value: profile.followersCount)
          ProfileStatTile(title: "Siguiendo", value: profile.followingCount)
        }
        .vinctusProfileListRowStyle()

        VStack(alignment: .leading, spacing: 10) {
          Text("HISTORIAS")
            .font(.system(size: 11, weight: .semibold))
            .tracking(2.4)
            .foregroundStyle(VinctusTokens.Color.textMuted)

          ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 14) {
              ForEach(storyItems(for: profile)) { item in
                ProfileStoryBubble(item: item, fallbackName: profile.displayName)
              }
            }
            .padding(.horizontal, 1)
          }
        }
        .vinctusProfileListRowStyle()

        ProfileTabSelector(selectedTab: $selectedTab)
          .vinctusProfileListRowStyle()

        if selectedTab == .myProfile {
          ProfileMyProfileContent(
            profile: profile,
            previewText: publicationPreview(for: profile),
            onTapCreate: { isCreatePostPresented = true }
          )
          .vinctusProfileListRowStyle()
        } else {
          ProfileCollectionsContent(profile: profile)
            .vinctusProfileListRowStyle()
        }
      }

      if let error = vm.errorMessage {
        VCard {
          VStack(alignment: .leading, spacing: VinctusTokens.Spacing.sm) {
            Text(error)
              .font(.footnote)
              .foregroundStyle(.red)

            VButton("Reintentar", variant: .secondary) {
              Task {
                await vm.load(userID: userID)
              }
            }
          }
        }
        .vinctusProfileListRowStyle()
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
    .navigationDestination(isPresented: $isSettingsPresented) {
      SettingsView()
    }
    .task(id: userID) {
      await vm.load(userID: userID)
    }
    .refreshable {
      await vm.load(userID: userID)
    }
  }

  private func storyItems(for profile: UserProfile) -> [ProfileStoryItem] {
    var items: [ProfileStoryItem] = [
      .init(id: "story_own", title: "Tu historia", imageURL: profile.photoURL, isOwnStory: true)
    ]

    let generatedCount = min(max(profile.postsCount, 0), 4)
    guard generatedCount > 0 else { return items }

    for index in 1...generatedCount {
      items.append(
        .init(
          id: "story_generated_\(profile.id)_\(index)",
          title: "Historia \(index)",
          imageURL: profile.photoURL,
          isOwnStory: false
        )
      )
    }

    return items
  }

  private func memberLabel(for profile: UserProfile) -> String {
    let days = max(Calendar.current.dateComponents([.day], from: profile.createdAt, to: Date()).day ?? 0, 0)
    if days < 30 { return "Nuevo miembro" }
    return "Miembro desde \(Calendar.current.component(.year, from: profile.createdAt))"
  }

  private func locationLabel(for profile: UserProfile) -> String {
    guard let location = profile.location, !location.isEmpty else { return "Sin ubicacion" }
    return location
  }

  private func publicationPreview(for profile: UserProfile) -> String {
    if let bio = profile.bio, !bio.isEmpty {
      return bio
    }
    return "Comparte tu primera publicacion con la comunidad."
  }

  @ViewBuilder
  private var profileSkeleton: some View {
    VCard {
      VStack(alignment: .leading, spacing: 12) {
        RoundedRectangle(cornerRadius: 8, style: .continuous)
          .fill(SwiftUI.Color.gray.opacity(0.22))
          .frame(width: 220, height: 24)

        RoundedRectangle(cornerRadius: 8, style: .continuous)
          .fill(SwiftUI.Color.gray.opacity(0.18))
          .frame(width: 170, height: 18)

        RoundedRectangle(cornerRadius: 8, style: .continuous)
          .fill(SwiftUI.Color.gray.opacity(0.15))
          .frame(height: 14)

        RoundedRectangle(cornerRadius: 8, style: .continuous)
          .fill(SwiftUI.Color.gray.opacity(0.14))
          .frame(height: 14)
      }
    }
    .redacted(reason: .placeholder)
    .vinctusProfileListRowStyle()
  }
}

private extension View {
  func vinctusProfileListRowStyle() -> some View {
    self
      .listRowSeparator(.hidden)
      .listRowBackground(SwiftUI.Color.clear)
  }
}

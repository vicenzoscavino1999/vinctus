import SwiftUI

struct ProfileView: View {
  let userID: String

  @StateObject private var vm: ProfileViewModel

  init(repo: ProfileRepo, userID: String) {
    self.userID = userID
    _vm = StateObject(wrappedValue: ProfileViewModel(repo: repo))
  }

  var body: some View {
    List {
      if vm.isLoading, vm.profile == nil {
        profileSkeleton
      }

      if let profile = vm.profile {
        Section {
          VCard {
            HStack(alignment: .center, spacing: VinctusTokens.Spacing.md) {
              AvatarView(name: profile.displayName, photoURLString: profile.photoURL, size: 62)

              VStack(alignment: .leading, spacing: 4) {
                Text(profile.displayName)
                  .font(.title3)
                  .bold()

                if let username = profile.username {
                  Text("@\(username)")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                }

                Text(profile.accountVisibility == .private ? "Cuenta privada" : "Cuenta publica")
                  .font(.caption)
                  .padding(.horizontal, 8)
                  .padding(.vertical, 4)
                  .background(
                    profile.accountVisibility == .private
                      ? SwiftUI.Color.orange.opacity(0.15)
                      : SwiftUI.Color.green.opacity(0.15)
                  )
                  .foregroundStyle(profile.accountVisibility == .private ? .orange : .green)
                  .clipShape(Capsule())
              }

              Spacer()
            }
          }
        }
        .listRowSeparator(.hidden)

        Section("Actividad") {
          LabeledContent("Publicaciones") { Text("\(profile.postsCount)") }
          LabeledContent("Seguidores") { Text("\(profile.followersCount)") }
          LabeledContent("Siguiendo") { Text("\(profile.followingCount)") }
          LabeledContent("Reputacion") { Text("\(profile.reputation)") }
        }

        Section("Perfil") {
          if let role = profile.role {
            LabeledContent("Rol") { Text(role) }
          }

          if let location = profile.location {
            LabeledContent("Ubicacion") { Text(location) }
          }

          if let email = profile.email {
            LabeledContent("Email") {
              Text(email)
                .lineLimit(1)
            }
          }

          LabeledContent("Actualizado") {
            Text(profile.updatedAt.formatted(date: .abbreviated, time: .shortened))
          }

          LabeledContent("Creado") {
            Text(profile.createdAt.formatted(date: .abbreviated, time: .omitted))
          }
        }

        if let bio = profile.bio, !bio.isEmpty {
          Section("Bio") {
            Text(bio)
              .font(.body)
              .foregroundStyle(.primary)
              .multilineTextAlignment(.leading)
          }
        }
      }

      if let error = vm.errorMessage {
        Section {
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
        }
        .listRowSeparator(.hidden)
      }
    }
    .listStyle(.insetGrouped)
    .navigationTitle(vm.profile?.displayName ?? "Perfil")
    .navigationBarTitleDisplayMode(.inline)
    .task(id: userID) {
      await vm.load(userID: userID)
    }
    .refreshable {
      await vm.load(userID: userID)
    }
  }

  @ViewBuilder
  private var profileSkeleton: some View {
    VStack(alignment: .leading, spacing: VinctusTokens.Spacing.md) {
      RoundedRectangle(cornerRadius: 8, style: .continuous)
        .fill(SwiftUI.Color.gray.opacity(0.22))
        .frame(width: 220, height: 22)

      RoundedRectangle(cornerRadius: 8, style: .continuous)
        .fill(SwiftUI.Color.gray.opacity(0.18))
        .frame(width: 150, height: 16)

      RoundedRectangle(cornerRadius: 8, style: .continuous)
        .fill(SwiftUI.Color.gray.opacity(0.16))
        .frame(height: 14)

      RoundedRectangle(cornerRadius: 8, style: .continuous)
        .fill(SwiftUI.Color.gray.opacity(0.15))
        .frame(height: 14)
    }
    .redacted(reason: .placeholder)
    .listRowSeparator(.hidden)
  }
}

private struct AvatarView: View {
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
          case .success(let image):
            image
              .resizable()
              .scaledToFill()
          case .failure:
            initialText
          @unknown default:
            initialText
          }
        }
      } else {
        initialText
      }
    }
    .frame(width: size, height: size)
    .clipShape(Circle())
    .overlay(
      Circle()
        .stroke(VinctusTokens.Color.border.opacity(0.35), lineWidth: 1)
    )
  }

  private var avatarURL: URL? {
    guard let photoURLString else { return nil }
    return URL(string: photoURLString)
  }

  private var initialText: some View {
    Text(String(name.prefix(1)).uppercased())
      .font(.headline)
      .foregroundStyle(.secondary)
  }
}

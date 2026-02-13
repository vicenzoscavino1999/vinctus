import SwiftUI

struct GroupsListView: View {
  @StateObject private var vm: GroupsListViewModel

  private let repo: any GroupsRepo

  init(repo: any GroupsRepo) {
    self.repo = repo
    _vm = StateObject(wrappedValue: GroupsListViewModel(repo: repo))
  }

  var body: some View {
    List {
      if vm.isShowingCachedData {
        VCard {
          HStack(spacing: 8) {
            Image(systemName: "externaldrive.badge.clock")
              .foregroundStyle(.orange)
            Text("Mostrando grupos desde cache local.")
              .font(.footnote)
              .foregroundStyle(.secondary)
          }
        }
        .listRowSeparator(.hidden)
      }

      if vm.isLoading, vm.groups.isEmpty {
        skeletonRows
      } else if vm.groups.isEmpty, let error = vm.errorMessage {
        VCard {
          VStack(alignment: .leading, spacing: VinctusTokens.Spacing.sm) {
            Text("No se pudo cargar grupos")
              .font(.headline)
            Text(error)
              .font(.footnote)
              .foregroundStyle(.secondary)

            VButton("Reintentar", variant: .secondary) {
              Task {
                await vm.refresh()
              }
            }
          }
        }
        .listRowSeparator(.hidden)
      } else if vm.groups.isEmpty {
        VCard {
          VStack(alignment: .leading, spacing: 6) {
            Text("Aun no hay grupos")
              .font(.headline)
            Text("Cuando existan grupos disponibles apareceran aqui.")
              .font(.footnote)
              .foregroundStyle(.secondary)
          }
        }
        .listRowSeparator(.hidden)
      } else {
        Section("Grupos") {
          ForEach(vm.groups) { group in
            NavigationLink(destination: GroupView(repo: repo, groupID: group.id)) {
              GroupSummaryRow(group: group)
            }
          }
        }
      }
    }
    .listStyle(.insetGrouped)
    .navigationTitle("Grupos")
    .task {
      await vm.refresh()
    }
    .refreshable {
      await vm.refresh()
    }
  }

  @ViewBuilder
  private var skeletonRows: some View {
    ForEach(0..<5, id: \.self) { _ in
      HStack(spacing: VinctusTokens.Spacing.md) {
        RoundedRectangle(cornerRadius: 12, style: .continuous)
          .fill(SwiftUI.Color.gray.opacity(0.2))
          .frame(width: 46, height: 46)

        VStack(alignment: .leading, spacing: 6) {
          RoundedRectangle(cornerRadius: 4, style: .continuous)
            .fill(SwiftUI.Color.gray.opacity(0.2))
            .frame(width: 170, height: 14)
          RoundedRectangle(cornerRadius: 4, style: .continuous)
            .fill(SwiftUI.Color.gray.opacity(0.16))
            .frame(width: 230, height: 12)
        }

        Spacer()
      }
      .redacted(reason: .placeholder)
      .listRowSeparator(.hidden)
    }
  }
}

struct GroupView: View {
  @StateObject private var vm: GroupDetailViewModel
  @StateObject private var connectivity = ConnectivityMonitor()

  init(repo: any GroupsRepo, groupID: String) {
    _vm = StateObject(wrappedValue: GroupDetailViewModel(repo: repo, groupID: groupID))
  }

  var body: some View {
    List {
      Section {
        HStack(spacing: 14) {
          VInlineStatus(title: vm.isOnline ? "Conexion: online" : "Conexion: offline", isGood: vm.isOnline)

          if vm.isShowingCachedData {
            Text("cache")
              .font(.caption)
              .padding(.horizontal, 8)
              .padding(.vertical, 4)
              .background(SwiftUI.Color.orange.opacity(0.15))
              .foregroundStyle(.orange)
              .clipShape(Capsule())
          }
        }
      }

      if vm.isLoading, vm.detail == nil {
        detailSkeleton
      }

      if let detail = vm.detail {
        Section {
          VCard {
            VStack(alignment: .leading, spacing: VinctusTokens.Spacing.sm) {
              HStack(alignment: .center, spacing: VinctusTokens.Spacing.md) {
                GroupIconView(name: detail.name, iconURL: detail.iconURL, size: 54)

                VStack(alignment: .leading, spacing: 4) {
                  Text(detail.name)
                    .font(.title3)
                    .bold()

                  Text(detail.visibility == .private ? "Grupo privado" : "Grupo publico")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                }

                Spacer()
              }

              if !detail.description.isEmpty {
                Text(detail.description)
                  .font(.body)
                  .foregroundStyle(.primary)
              }
            }
          }
        }
        .listRowSeparator(.hidden)

        Section("Actividad") {
          LabeledContent("Miembros") { Text("\(detail.memberCount)") }
          LabeledContent("Posts (7 dias)") { Text("\(detail.postsPerWeek)") }

          if let updatedAt = detail.updatedAt {
            LabeledContent("Actualizado") {
              Text(updatedAt.formatted(date: .abbreviated, time: .shortened))
            }
          }
        }

        Section("Publicaciones recientes") {
          if detail.recentPosts.isEmpty {
            Text("Aun no hay publicaciones en este grupo.")
              .font(.footnote)
              .foregroundStyle(.secondary)
          } else {
            ForEach(detail.recentPosts) { post in
              VStack(alignment: .leading, spacing: 4) {
                Text(post.title)
                  .font(.subheadline)
                  .foregroundStyle(.primary)
                  .lineLimit(2)

                HStack(spacing: 8) {
                  Text(post.authorName)
                    .font(.caption)
                    .foregroundStyle(.secondary)

                  if let createdAt = post.createdAt {
                    Text(createdAt, style: .relative)
                      .font(.caption)
                      .foregroundStyle(.secondary)
                  }
                }
              }
              .padding(.vertical, 2)
            }
          }
        }

        Section("Miembros destacados") {
          if detail.topMembers.isEmpty {
            Text("Sin miembros destacados por ahora.")
              .font(.footnote)
              .foregroundStyle(.secondary)
          } else {
            ForEach(detail.topMembers) { member in
              HStack(spacing: VinctusTokens.Spacing.md) {
                GroupMemberAvatar(name: member.name, photoURL: member.photoURL, size: 38)

                VStack(alignment: .leading, spacing: 2) {
                  Text(member.name)
                    .font(.subheadline)

                  Text(member.role.capitalized)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                }

                Spacer()

                if let joinedAt = member.joinedAt {
                  Text(joinedAt, style: .relative)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                }
              }
            }
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
                  await vm.refresh()
                }
              }
            }
          }
        }
        .listRowSeparator(.hidden)
      }
    }
    .listStyle(.insetGrouped)
    .navigationTitle(vm.detail?.name ?? "Grupo")
    .navigationBarTitleDisplayMode(.inline)
    .task {
      vm.handleConnectivityChange(connectivity.isOnline)
      await vm.refresh()
    }
    .onChange(of: connectivity.isOnline) { _, newValue in
      vm.handleConnectivityChange(newValue)
    }
    .refreshable {
      await vm.refresh()
    }
  }

  @ViewBuilder
  private var detailSkeleton: some View {
    VStack(alignment: .leading, spacing: VinctusTokens.Spacing.md) {
      RoundedRectangle(cornerRadius: 8, style: .continuous)
        .fill(SwiftUI.Color.gray.opacity(0.2))
        .frame(width: 240, height: 22)

      RoundedRectangle(cornerRadius: 8, style: .continuous)
        .fill(SwiftUI.Color.gray.opacity(0.16))
        .frame(height: 14)

      RoundedRectangle(cornerRadius: 8, style: .continuous)
        .fill(SwiftUI.Color.gray.opacity(0.14))
        .frame(height: 14)
    }
    .redacted(reason: .placeholder)
    .listRowSeparator(.hidden)
  }
}

private struct GroupSummaryRow: View {
  let group: GroupSummary

  var body: some View {
    HStack(spacing: VinctusTokens.Spacing.md) {
      GroupIconView(name: group.name, iconURL: group.iconURL, size: 44)

      VStack(alignment: .leading, spacing: 3) {
        Text(group.name)
          .font(.headline)

        if !group.description.isEmpty {
          Text(group.description)
            .font(.footnote)
            .foregroundStyle(.secondary)
            .lineLimit(1)
        }

        Text("\(group.memberCount) miembros")
          .font(.caption)
          .foregroundStyle(.secondary)
      }

      Spacer()
    }
    .padding(.vertical, 2)
  }
}

private struct GroupIconView: View {
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
      .foregroundStyle(.secondary)
  }
}

private struct GroupMemberAvatar: View {
  let name: String
  let photoURL: String?
  let size: CGFloat

  var body: some View {
    ZStack {
      Circle()
        .fill(VinctusTokens.Color.surface2)

      if let photoURL, let url = URL(string: photoURL) {
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

  private var initials: some View {
    Text(String(name.prefix(1)).uppercased())
      .font(.caption)
      .foregroundStyle(.secondary)
  }
}

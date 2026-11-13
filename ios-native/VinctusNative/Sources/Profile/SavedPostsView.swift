import SwiftUI

struct SavedPostsView: View {
  let profileRepo: ProfileRepo
  @StateObject private var vm: SavedPostsViewModel
  @EnvironmentObject private var blockedUsers: BlockedUsersStore

  init(profileRepo: ProfileRepo, repo: any SavedPostsRepo = AppRepos.savedPosts()) {
    self.profileRepo = profileRepo
    _vm = StateObject(wrappedValue: SavedPostsViewModel(repo: repo))
  }

  var body: some View {
    List {
      if vm.isLoading && vm.items.isEmpty { ProgressView() }
      else if vm.items.isEmpty && vm.errorMessage == nil {
        Text("Aún no tienes publicaciones guardadas.").foregroundStyle(.secondary)
      }
      ForEach(vm.items.filter { !blockedUsers.isBlocked($0.authorID) }) { item in
        NavigationLink {
          PostDetailView(item: item, profileRepo: profileRepo, commentsRepo: AppRepos.postComments())
        } label: {
          VStack(alignment: .leading, spacing: 5) {
            Text(item.title ?? (item.text.isEmpty ? "Publicación" : item.text)).lineLimit(2)
            Text(item.authorName).font(.caption).foregroundStyle(.secondary)
          }
        }
      }
      if let error = vm.errorMessage {
        Text(error).font(.footnote).foregroundStyle(.red)
        if !vm.canLoadMore { Button("Reintentar") { Task { await vm.load() } } }
      }
      if vm.canLoadMore {
        Button { Task { await vm.loadMore() } } label: {
          HStack {
            if vm.isLoadingMore { ProgressView() }
            Text(vm.errorMessage == nil ? "Cargar más guardados" : "Reintentar carga")
          }
        }.disabled(vm.isLoading || vm.isLoadingMore)
      }
    }
    .navigationTitle("Publicaciones guardadas")
    .task { await vm.load() }
    .refreshable { await vm.load() }
  }
}

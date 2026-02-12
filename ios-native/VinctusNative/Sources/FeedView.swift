import SwiftUI

struct FeedView: View {
  @StateObject private var vm: FeedViewModel

  init(repo: FeedRepo) {
    _vm = StateObject(wrappedValue: FeedViewModel(repo: repo))
  }

  var body: some View {
    List {
      if vm.isLoading {
        Text("Loading…")
      }

      if let error = vm.errorMessage {
        Text(error).foregroundStyle(.red)
      }

      ForEach(vm.items) { item in
        Text(item.title)
      }

      if vm.items.isEmpty && !vm.isLoading && vm.errorMessage == nil {
        Text("Empty feed (skeleton)")
          .foregroundStyle(.secondary)
      }
    }
    .navigationTitle("Feed")
    .task { vm.refresh() }
    .refreshable { vm.refresh() }
  }
}


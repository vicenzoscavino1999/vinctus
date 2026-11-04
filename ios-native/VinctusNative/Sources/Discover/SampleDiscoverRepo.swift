import Foundation

// Screenshot builds only (see App/DemoData.swift).

#if SCREENSHOTS
struct SampleDiscoverRepo: DiscoverRepo {
  func fetchRecentUsers(limit: Int, excluding uid: String?) async throws -> [DiscoverUser] {
    Array(DemoSample.users.prefix(limit))
  }

  func searchUsers(prefix: String, limit: Int, excluding uid: String?) async throws -> [DiscoverUser] {
    DemoSample.users.filter { $0.displayName.localizedCaseInsensitiveContains(prefix) }
  }
}
#endif

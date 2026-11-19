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

  func fetchLiveContent(source: String, query: String, limit: Int) async throws -> [DiscoverLiveItem] {
    [
      DiscoverLiveItem(
        id: "demo-1",
        badge: "En vivo",
        title: "Hallazgos recientes sobre \(query)",
        subtitle: "Resumen de ejemplo para la vista de categoría.",
        meta: source.uppercased(),
        linkURL: URL(string: "https://vinctus.vercel.app"),
        imageURL: nil
      ),
    ]
  }

  func fetchCategoryGroups(categoryID: String, limit: Int) async throws -> [GroupSummary] {
    Array(DemoSample.groups.filter { $0.categoryID == categoryID }.prefix(limit))
  }

  func fetchCategoryLibrary(categoryID: String, limit: Int) async throws -> [DiscoverLibraryItem] {
    [
      DiscoverLibraryItem(
        id: "lib-1",
        userID: "u1",
        type: .paper,
        title: "Lectura recomendada de la comunidad",
        description: "Notas curadas para explorar esta categoría.",
        authorName: "Lucía Fernández",
        linkURL: URL(string: "https://vinctus.vercel.app"),
        fileURL: nil,
        fileName: nil,
        createdAt: Date()
      ),
    ]
  }
}
#endif

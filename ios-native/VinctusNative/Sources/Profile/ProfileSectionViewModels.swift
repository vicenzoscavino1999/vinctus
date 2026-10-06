import Foundation

// MARK: - Followed categories

@MainActor
final class FollowedCategoriesViewModel: ObservableObject {
  @Published private(set) var followed: [String] = []
  @Published private(set) var isLoading = true
  @Published private(set) var errorMessage: String?

  private let repo: ProfileContentRepo

  init(repo: ProfileContentRepo) {
    self.repo = repo
  }

  /// Categories the + menu offers.
  var notFollowed: [InterestCategory] {
    InterestCategory.all.filter { !followed.contains($0.id) }
  }

  var followsEverything: Bool {
    notFollowed.isEmpty
  }

  func load() async {
    do {
      followed = try await repo.fetchFollowedCategories()
    } catch {
      errorMessage = "No se pudieron cargar tus categorías."
    }
    isLoading = false
  }

  /// Updates right away and rolls back if the write fails.
  func setFollowed(_ follow: Bool, categoryID: String) async {
    guard follow != followed.contains(categoryID) else { return }
    let previous = followed
    followed = follow ? followed + [categoryID] : followed.filter { $0 != categoryID }
    do {
      try await repo.setCategoryFollowed(follow, categoryID: categoryID)
    } catch {
      followed = previous
      errorMessage = "No se pudo actualizar la categoría."
    }
  }
}

// MARK: - Saved Arena debates

@MainActor
final class SavedDebatesViewModel: ObservableObject {
  @Published private(set) var debates: [SavedDebate] = []
  @Published private(set) var isLoading = true
  @Published private(set) var errorMessage: String?

  private let repo: ProfileContentRepo

  init(repo: ProfileContentRepo) {
    self.repo = repo
  }

  func load() async {
    do {
      debates = try await repo.fetchSavedDebates()
    } catch {
      errorMessage = "No se pudieron cargar tus debates guardados."
    }
    isLoading = false
  }

  /// Removes right away and puts the debate back if the delete fails.
  func remove(_ debate: SavedDebate) async {
    let previous = debates
    debates.removeAll { $0.id == debate.id }
    do {
      try await repo.removeSavedDebate(id: debate.id)
    } catch {
      debates = previous
      errorMessage = "No se pudo quitar el debate."
    }
  }
}

/// The turns of one saved debate, read from `arenaDebates/{id}/turns`.
@MainActor
final class DebateTurnsViewModel: ObservableObject {
  @Published private(set) var turns: [ArenaTurn] = []
  @Published private(set) var isLoading = true
  @Published private(set) var errorMessage: String?

  private let debateID: String
  private let repo: AIRepo

  init(debateID: String, repo: AIRepo) {
    self.debateID = debateID
    self.repo = repo
  }

  func load() async {
    do {
      turns = try await repo.fetchDebateTurns(debateID: debateID)
    } catch {
      errorMessage = "No se pudo cargar el debate."
    }
    isLoading = false
  }
}

// MARK: - Posts

@MainActor
final class ProfilePostsViewModel: ObservableObject {
  @Published private(set) var posts: [FeedItem] = []
  @Published private(set) var hasMore = false
  @Published private(set) var isLoading = true
  @Published private(set) var isLoadingMore = false
  @Published private(set) var errorMessage: String?

  static let pageSize = 20

  private let repo: ProfileContentRepo
  private let userID: String
  private var nextPage: ProfileListCursor?

  init(repo: ProfileContentRepo, userID: String) {
    self.repo = repo
    self.userID = userID
  }

  func load() async {
    do {
      let page = try await repo.fetchPosts(uid: userID, limit: Self.pageSize, after: nil)
      posts = page.items
      setNextPage(page.next)
      errorMessage = nil
    } catch {
      errorMessage = "No se pudieron cargar las publicaciones."
    }
    isLoading = false
  }

  func loadMore() async {
    guard let cursor = nextPage, !isLoadingMore else { return }
    isLoadingMore = true
    defer { isLoadingMore = false }
    do {
      let page = try await repo.fetchPosts(uid: userID, limit: Self.pageSize, after: cursor)
      let known = Set(posts.map(\.id))
      posts += page.items.filter { !known.contains($0.id) }
      setNextPage(page.next)
    } catch {
      errorMessage = "No se pudieron cargar más publicaciones."
    }
  }

  private func setNextPage(_ cursor: ProfileListCursor?) {
    nextPage = cursor
    hasMore = cursor != nil
  }
}

// MARK: - Contributions

@MainActor
final class ContributionsViewModel: ObservableObject {
  @Published private(set) var contributions: [Contribution] = []
  @Published private(set) var isLoading = true
  @Published private(set) var errorMessage: String?

  private let repo: ProfileContentRepo
  private let userID: String

  init(repo: ProfileContentRepo, userID: String) {
    self.repo = repo
    self.userID = userID
  }

  func load() async {
    do {
      contributions = try await repo.fetchContributions(uid: userID)
      errorMessage = nil
    } catch {
      errorMessage = "No se pudieron cargar los aportes."
    }
    isLoading = false
  }

  /// Removes right away and puts the contribution back if the delete fails.
  func delete(_ item: Contribution) async {
    let previous = contributions
    contributions.removeAll { $0.id == item.id }
    do {
      try await repo.deleteContribution(id: item.id)
    } catch {
      contributions = previous
      errorMessage = "No se pudo eliminar el aporte."
    }
  }
}

@MainActor
final class NewContributionViewModel: ObservableObject {
  @Published var draft = NewContribution()
  @Published private(set) var isSaving = false
  @Published private(set) var errorMessage: String?

  private let repo: ProfileContentRepo

  init(repo: ProfileContentRepo) {
    self.repo = repo
  }

  var canSave: Bool {
    !isSaving && !draft.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
  }

  /// Returns true when the contribution was created.
  func save() async -> Bool {
    guard canSave else { return false }
    isSaving = true
    errorMessage = nil
    defer { isSaving = false }
    do {
      try await repo.createContribution(draft)
      return true
    } catch {
      errorMessage = (error as? LocalizedError)?.errorDescription ?? "No se pudo guardar el aporte."
      return false
    }
  }
}

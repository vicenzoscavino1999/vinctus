import Foundation

/// Picks the data sources for the signed-in app. Builds made by the screenshot workflow
/// (.github/workflows/ios-screenshots.yml) compile with `SCREENSHOTS` and, when launched with
/// `-VinctusDemo`, skip sign-in and show sample data, so screens can be reviewed without a Firebase
/// account. App Store builds never contain the sample data.
enum AppRepos {
  static var isDemo: Bool {
    #if SCREENSHOTS
    return ProcessInfo.processInfo.arguments.contains("-VinctusDemo")
    #else
    return false
    #endif
  }

  static func discover() -> DiscoverRepo {
    #if SCREENSHOTS
    if isDemo { return SampleDiscoverRepo() }
    #endif
    return FirebaseDiscoverRepo()
  }

  static func groups() -> any GroupsRepo {
    #if SCREENSHOTS
    if isDemo { return SampleGroupsRepo() }
    #endif
    return FirebaseGroupsRepo()
  }

  static func profile() -> ProfileRepo {
    #if SCREENSHOTS
    if isDemo { return SampleProfileRepo() }
    #endif
    return FirebaseProfileRepo()
  }

  static func feed() -> FeedRepo {
    #if SCREENSHOTS
    if isDemo { return SampleFeedRepo() }
    #endif
    return FirebaseFeedRepo()
  }
}

#if SCREENSHOTS
private enum Sample {
  static let users: [DiscoverUser] = [
    ("u1", "Lucía Fernández"), ("u2", "Mateo Rojas"), ("u3", "Valentina Cruz"),
    ("u4", "Diego Salazar"), ("u5", "Camila Torres"), ("u6", "Andrés Vega"),
    ("u7", "Sofía Méndez"),
  ].map { DiscoverUser(uid: $0.0, displayName: $0.1, photoURL: nil, accountVisibility: .public) }

  static let groups: [GroupSummary] = [
    ("g1", "Física para curiosos", "Charlas sobre el universo, sin fórmulas imposibles.", "science", 1284),
    ("g2", "Jazz y café", "Discos, conciertos y recomendaciones para la semana.", "music", 642),
    ("g3", "Makers Lima", "Proyectos de hardware, impresión 3D y electrónica.", "technology", 915),
    ("g4", "Club de lectura", "Un libro al mes y conversación todos los domingos.", "literature", 377),
    ("g5", "Filosofía de bolsillo", "Grandes preguntas en conversaciones cortas.", "philosophy", 508),
  ].map {
    GroupSummary(
      id: $0.0, name: $0.1, description: $0.2, categoryID: $0.3, visibility: .public,
      iconURL: nil, memberCount: $0.4, updatedAt: Date()
    )
  }
}

struct SampleDiscoverRepo: DiscoverRepo {
  func fetchRecentUsers(limit: Int, excluding uid: String?) async throws -> [DiscoverUser] {
    Array(Sample.users.prefix(limit))
  }

  func searchUsers(prefix: String, limit: Int, excluding uid: String?) async throws -> [DiscoverUser] {
    Sample.users.filter { $0.displayName.localizedCaseInsensitiveContains(prefix) }
  }
}

struct SampleGroupsRepo: GroupsRepo {
  func fetchGroups(limit: Int) async throws -> GroupsPage {
    GroupsPage(items: Array(Sample.groups.prefix(limit)), isFromCache: false)
  }

  func fetchGroupDetail(groupID: String, recentPostLimit: Int, topMemberLimit: Int) async throws -> GroupDetail? {
    guard let group = Sample.groups.first(where: { $0.id == groupID }) else { return nil }
    return GroupDetail(
      id: group.id, name: group.name, description: group.description, categoryID: group.categoryID,
      ownerID: "u1", visibility: .public, iconURL: nil, memberCount: group.memberCount,
      postsPerWeek: 24, createdAt: Date(), updatedAt: Date(),
      recentPosts: [
        GroupPostPreview(id: "p1", title: "¿Qué libro recomiendan para empezar?", authorID: "u2", authorName: "Mateo Rojas", createdAt: Date()),
        GroupPostPreview(id: "p2", title: "Resumen del encuentro del sábado", authorID: "u3", authorName: "Valentina Cruz", createdAt: Date()),
      ],
      topMembers: Sample.users.prefix(4).map {
        GroupMemberPreview(uid: $0.uid, name: $0.displayName, photoURL: nil, role: "member", joinedAt: Date())
      },
      isFromCache: false
    )
  }
}

struct SampleProfileRepo: ProfileRepo {
  func fetchUserProfile(uid: String) async throws -> UserProfile? {
    let name = Sample.users.first(where: { $0.uid == uid })?.displayName ?? "Lucía Fernández"
    return UserProfile(
      id: uid, displayName: name, photoURL: nil, username: "lucia", email: nil,
      bio: "Curiosa por la ciencia y la música.", role: nil, location: "Lima, Perú",
      reputation: 128, followersCount: 342, followingCount: 180, postsCount: 27,
      accountVisibility: .public, createdAt: Date(), updatedAt: Date()
    )
  }
}

struct SampleFeedRepo: FeedRepo {
  func fetchFeedPage(limit: Int, after cursor: FeedCursor?) async throws -> FeedPage {
    let items = [
      ("f1", "u2", "Mateo Rojas", "Anoche vi los anillos de Saturno con un telescopio pequeño. ¡Vale totalmente la pena!", 42, 8),
      ("f2", "u3", "Valentina Cruz", "¿Alguien más va al festival de jazz del sábado? Busco gente para ir.", 17, 5),
      ("f3", "u4", "Diego Salazar", "Terminé mi primera impresora 3D armada desde cero. Les dejo lo que aprendí.", 88, 21),
    ].map {
      FeedItem(id: $0.0, authorID: $0.1, authorName: $0.2, text: $0.3, createdAt: Date(), likeCount: $0.4, commentCount: $0.5)
    }
    return FeedPage(items: items, nextCursor: nil, hasMore: false, isFromCache: false)
  }
}
#endif

import Foundation

// Screenshot builds only (see App/DemoData.swift).

#if SCREENSHOTS
struct SampleProfileRepo: ProfileRepo {
  func fetchUserProfile(uid: String) async throws -> UserProfile? {
    let name = DemoSample.users.first(where: { $0.uid == uid })?.displayName ?? "Lucía Fernández"
    return UserProfile(
      id: uid, displayName: name, photoURL: nil, username: "lucia", email: nil,
      bio: "Curiosa por la ciencia y la música.", role: nil, location: "Lima, Perú",
      reputation: 128, followersCount: 342, followingCount: 180, postsCount: 27,
      accountVisibility: .public, createdAt: Date(), updatedAt: Date(),
      karmaByInterest: ["science": 64, "music": 38, "literature": 12]
    )
  }

  func updateProfile(uid: String, _ update: ProfileUpdate) async throws {}
  func uploadProfilePhoto(uid: String, jpegData: Data) async throws -> String { "" }
}

struct SampleProfileContentRepo: ProfileContentRepo {
  func fetchPosts(uid: String, limit: Int, after cursor: ProfileListCursor?) async throws -> ProfileListPage<FeedItem> {
    ProfileListPage(items: [
      FeedItem(id: "p1", authorID: uid, authorName: "Lucía Fernández", text: "Hoy empecé un club de lectura de divulgación científica. ¿Qué libro recomiendan para el primer mes?", createdAt: Date().addingTimeInterval(-7200), likeCount: 24, commentCount: 9),
      FeedItem(id: "p2", authorID: uid, authorName: "Lucía Fernández", text: "Grabé mi primera pieza de jazz al piano. ¡Gracias a todos por los consejos!", createdAt: Date().addingTimeInterval(-259_200), likeCount: 57, commentCount: 14, hasVideo: true, videoThumbnailURL: YouTubeLink.thumbnailURL(from: "https://youtu.be/9bZkp7q19f0")),
      FeedItem(id: "p3", authorID: uid, authorName: "Lucía Fernández", text: "hola, ¿cómo están?", createdAt: Date().addingTimeInterval(-400_000), likeCount: 3, commentCount: 1),
      FeedItem(id: "p4", authorID: uid, authorName: "Lucía Fernández", text: "", createdAt: Date().addingTimeInterval(-500_000), likeCount: 0, commentCount: 0, fileName: "apuntes-cuantica.pdf"),
    ], next: nil)
  }

  func fetchFollowList(
    uid: String, kind: FollowListKind, limit: Int, after cursor: ProfileListCursor?
  ) async throws -> ProfileListPage<ProfileUserSummary> {
    ProfileListPage(
      items: DemoSample.users.prefix(5).map { ProfileUserSummary(id: $0.uid, name: $0.displayName, photoURL: nil, username: nil) },
      next: nil
    )
  }

  func fetchIncomingFollowRequests() async throws -> [IncomingFollowRequest] {
    [IncomingFollowRequest(id: "u6_me", from: ProfileUserSummary(id: "u6", name: "Andrés Vega", photoURL: nil, username: "andres"))]
  }

  func hasPendingFollowRequest(from fromUID: String) async throws -> Bool { false }
  func answerFollowRequest(from fromUID: String, accept: Bool) async throws {}

  func fetchContributions(uid: String) async throws -> [Contribution] {
    [
      Contribution(id: "c1", type: .project, title: "Telescopio casero con Arduino", description: "Montura motorizada que sigue estrellas automáticamente.", link: "https://example.com", fileURL: nil, fileName: nil, categoryID: "science", createdAt: Date()),
      Contribution(id: "c2", type: .certificate, title: "Certificado de armonía de jazz", description: nil, link: nil, fileURL: nil, fileName: nil, categoryID: "music", createdAt: Date()),
    ]
  }

  func createContribution(_ contribution: NewContribution) async throws {}
  func deleteContribution(id: String) async throws {}
  func fetchFollowedCategories() async throws -> [String] { ["science", "music"] }
  func setCategoryFollowed(_ followed: Bool, categoryID: String) async throws {}

  func fetchSavedDebates() async throws -> [SavedDebate] {
    [SavedDebate(id: "d1", topic: "¿Debería la IA tener derechos?", personaA: "philosopher", personaB: "scientist", summary: "Un debate sobre conciencia, responsabilidad y los límites de las máquinas.", winner: "A", createdAt: Date())]
  }

  func saveDebate(_ debate: SavedDebate) async throws {}
  func removeSavedDebate(id: String) async throws {}
}
#endif

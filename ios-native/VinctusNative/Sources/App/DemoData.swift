import Foundation

// Sample data for screenshot builds (see AppRepos). Compiled only with `SCREENSHOTS`, so App Store
// builds never contain it.

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

  func isMember(groupID: String, uid: String) async throws -> Bool { groupID == "g2" }
  func joinGroup(groupID: String, uid: String) async throws {}
  func leaveGroup(groupID: String, uid: String) async throws {}
}

struct SampleProfileRepo: ProfileRepo {
  func fetchUserProfile(uid: String) async throws -> UserProfile? {
    let name = Sample.users.first(where: { $0.uid == uid })?.displayName ?? "Lucía Fernández"
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
  func fetchPosts(uid: String, limit: Int) async throws -> [FeedItem] {
    [
      FeedItem(id: "p1", authorID: uid, authorName: "Lucía Fernández", text: "Hoy empecé un club de lectura de divulgación científica. ¿Qué libro recomiendan para el primer mes?", createdAt: Date().addingTimeInterval(-7200), likeCount: 24, commentCount: 9),
      FeedItem(id: "p2", authorID: uid, authorName: "Lucía Fernández", text: "Grabé mi primera pieza de jazz al piano. ¡Gracias a todos por los consejos!", createdAt: Date().addingTimeInterval(-259_200), likeCount: 57, commentCount: 14),
    ]
  }

  func fetchFollowList(uid: String, kind: FollowListKind, limit: Int) async throws -> [ProfileUserSummary] {
    Sample.users.prefix(5).map { ProfileUserSummary(id: $0.uid, name: $0.displayName, photoURL: nil, username: nil) }
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

struct SampleChatRepo: ChatRepo {
  func observeConversations(
    onChange: @escaping ([ChatConversation]) -> Void,
    onError: @escaping (Error) -> Void
  ) -> ChatSubscription {
    let now = Date()
    onChange([
      ChatConversation(
        id: "dm_me_u2", isGroup: false, title: "Mateo Rojas", photoURL: nil, otherUserID: "u2",
        groupID: nil, lastMessageText: "¡Nos vemos en el observatorio el sábado!",
        lastMessageSenderID: "u2", updatedAt: now.addingTimeInterval(-300)
      ),
      ChatConversation(
        id: "grp_g2", isGroup: true, title: "Jazz y café", photoURL: nil, otherUserID: nil,
        groupID: "g2", lastMessageText: "Valentina: Dejo la lista de discos de la semana",
        lastMessageSenderID: "u3", updatedAt: now.addingTimeInterval(-3600)
      ),
      ChatConversation(
        id: "dm_me_u4", isGroup: false, title: "Diego Salazar", photoURL: nil, otherUserID: "u4",
        groupID: nil, lastMessageText: "Te paso los archivos de la impresora 3D",
        lastMessageSenderID: "me", updatedAt: now.addingTimeInterval(-86_400)
      ),
    ])
    return ChatSubscription {}
  }

  func observeMessages(
    conversationID: String,
    onChange: @escaping ([ChatMessage]) -> Void,
    onError: @escaping (Error) -> Void
  ) -> ChatSubscription {
    let now = Date()
    onChange([
      ChatMessage(id: "m1", senderID: "u2", senderName: "Mateo Rojas", text: "¿Viste la luna anoche?", hasAttachments: false, createdAt: now.addingTimeInterval(-900)),
      ChatMessage(id: "m2", senderID: "me", senderName: "Yo", text: "¡Sí! Se veía enorme 🌕", hasAttachments: false, createdAt: now.addingTimeInterval(-800)),
      ChatMessage(id: "m3", senderID: "u2", senderName: "Mateo Rojas", text: "¡Nos vemos en el observatorio el sábado!", hasAttachments: false, createdAt: now.addingTimeInterval(-300)),
    ])
    return ChatSubscription {}
  }

  func sendMessage(conversationID: String, text: String) async throws {}
  func markRead(conversationID: String) async {}
  func openDirectConversation(with otherUserID: String) async throws -> String { "dm_me_\(otherUserID)" }
  func openGroupConversation(groupID: String) async throws -> String { "grp_\(groupID)" }
}
#endif

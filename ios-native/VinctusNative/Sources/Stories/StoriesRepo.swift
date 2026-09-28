import FirebaseAuth
import FirebaseCore
import FirebaseFirestore
import FirebaseStorage
import Foundation

enum StoryMediaType: String {
  case image
  case video
}

struct Story: Identifiable, Hashable {
  let id: String
  let ownerID: String
  let ownerName: String?
  let ownerPhotoURL: String?
  let mediaType: StoryMediaType
  let mediaURL: String
  let mediaPath: String
  let createdAt: Date
  let expiresAt: Date
}

/// All the live stories of one person, oldest first (the order they are watched in).
struct StoryGroup: Identifiable, Hashable {
  let ownerID: String
  let ownerName: String
  let ownerPhotoURL: String?
  var stories: [Story]

  var id: String { ownerID }

  /// Groups stories by owner. The signed-in user's group goes first, then the most recent.
  static func make(from stories: [Story], currentUID: String?) -> [StoryGroup] {
    let byOwner = Dictionary(grouping: stories, by: \.ownerID)
    let groups = byOwner.map { ownerID, items -> StoryGroup in
      let sorted = items.sorted { $0.createdAt < $1.createdAt }
      let latest = sorted.last
      return StoryGroup(
        ownerID: ownerID,
        ownerName: latest?.ownerName ?? "Usuario",
        ownerPhotoURL: latest?.ownerPhotoURL,
        stories: sorted
      )
    }
    return groups.sorted { lhs, rhs in
      if lhs.ownerID == currentUID { return true }
      if rhs.ownerID == currentUID { return false }
      return (lhs.stories.last?.createdAt ?? .distantPast) > (rhs.stories.last?.createdAt ?? .distantPast)
    }
  }
}

/// Stories over the same data as the web (`src/shared/lib/firestore/stories.ts`): a
/// `stories/{id}` document per photo or video, visible for 24 hours to friends and followers.
protocol StoriesRepo {
  /// Live stories of the signed-in user, their friends and the people they follow.
  func fetchStoryGroups() async throws -> [StoryGroup]
  /// Publishes a photo story (JPEG). Videos are published from the web.
  func publishImageStory(jpegData: Data) async throws
  func deleteStory(_ story: Story) async throws
}

enum StoriesRepoError: LocalizedError {
  case firebaseNotConfigured
  case userNotAuthenticated

  var errorDescription: String? {
    switch self {
    case .firebaseNotConfigured:
      return "Firebase no está configurado."
    case .userNotAuthenticated:
      return "Debes iniciar sesión."
    }
  }
}

final class FirebaseStoriesRepo: StoriesRepo {
  /// `STORY_DURATION_MS` in `src/shared/lib/storyConstants.ts`.
  static let storyDuration: TimeInterval = 24 * 60 * 60
  /// Firestore allows at most 10 values in an `in` filter.
  private static let ownersPerQuery = 10

  private func context() throws -> (Firestore, String) {
    guard FirebaseApp.app() != nil else { throw StoriesRepoError.firebaseNotConfigured }
    guard let uid = Auth.auth().currentUser?.uid else { throw StoriesRepoError.userNotAuthenticated }
    return (Firestore.firestore(), uid)
  }

  /// Mirrors `useStories`: own stories plus those of friends and followed users.
  func fetchStoryGroups() async throws -> [StoryGroup] {
    let (db, uid) = try context()
    let users = db.collection("users").document(uid)
    async let friends = ids(users.collection("friends").limit(to: 200))
    async let following = ids(users.collection("following").limit(to: 1000))
    let others = Set(await friends + following).subtracting([uid])

    var owners = [uid] + Array(others)
    var stories: [Story] = []
    while !owners.isEmpty {
      let chunk = Array(owners.prefix(Self.ownersPerQuery))
      owners.removeFirst(chunk.count)
      // One failing chunk (for example a permission change) shouldn't hide the others.
      if let found = try? await storiesOf(chunk, db: db) {
        stories += found
      }
    }
    return StoryGroup.make(from: stories, currentUID: uid)
  }

  /// Mirrors `getStoriesForOwners` (same filters, so it uses the same index).
  private func storiesOf(_ ownerIDs: [String], db: Firestore) async throws -> [Story] {
    let snapshot = try await db.collection("stories")
      .whereField("ownerId", in: ownerIDs)
      .whereField("visibility", isEqualTo: "friends")
      .whereField("expiresAt", isGreaterThan: Timestamp(date: Date()))
      .order(by: "expiresAt", descending: true)
      .getDocuments()
    return snapshot.documents.compactMap { Self.story(id: $0.documentID, data: $0.data()) }
  }

  private func ids(_ query: Query) async -> [String] {
    ((try? await query.getDocuments())?.documents ?? []).map(\.documentID)
  }

  /// Mirrors `uploadStoryImage` + `createStory` (paths and fields checked by storage.rules and
  /// `isValidStoryCreate` in firestore.rules).
  func publishImageStory(jpegData: Data) async throws {
    let (db, uid) = try context()
    let storyRef = db.collection("stories").document()
    let millis = Int64(Date().timeIntervalSince1970 * 1000)
    let path = "stories/\(uid)/\(storyRef.documentID)/original/\(millis)_story.jpg"
    let mediaRef = Storage.storage().reference(withPath: path)
    let metadata = StorageMetadata()
    metadata.contentType = "image/jpeg"
    _ = try await mediaRef.putDataAsync(jpegData, metadata: metadata)
    let url = try await mediaRef.downloadURL().absoluteString

    let profile = (try? await db.collection("users_public").document(uid).getDocument().data()) ?? [:]
    let user = Auth.auth().currentUser
    let name = FirestoreValue.string(profile["displayName"]) ?? FirestoreValue.string(user?.displayName)
    let photo = FirestoreValue.string(profile["photoURL"]) ?? user?.photoURL?.absoluteString

    try await storyRef.setData([
      "ownerId": uid,
      "ownerSnapshot": [
        "displayName": name.map { String($0.prefix(80)) } ?? NSNull(),
        "photoURL": photo ?? NSNull(),
      ],
      "mediaType": StoryMediaType.image.rawValue,
      "mediaUrl": url,
      "mediaPath": path,
      "thumbUrl": NSNull(),
      "thumbPath": NSNull(),
      "visibility": "friends",
      "createdAt": FieldValue.serverTimestamp(),
      "expiresAt": Timestamp(date: Date().addingTimeInterval(Self.storyDuration)),
    ])
  }

  func deleteStory(_ story: Story) async throws {
    let (db, _) = try context()
    try await db.collection("stories").document(story.id).delete()
    // The file goes too; if that fails the story is already gone for everyone.
    try? await Storage.storage().reference(withPath: story.mediaPath).delete()
  }

  static func story(id: String, data: [String: Any]) -> Story? {
    guard
      let ownerID = FirestoreValue.string(data["ownerId"]),
      let mediaURL = FirestoreValue.string(data["mediaUrl"])
    else { return nil }
    let owner = data["ownerSnapshot"] as? [String: Any]
    return Story(
      id: id,
      ownerID: ownerID,
      ownerName: FirestoreValue.string(owner?["displayName"]),
      ownerPhotoURL: FirestoreValue.string(owner?["photoURL"]),
      mediaType: StoryMediaType(rawValue: data["mediaType"] as? String ?? "") ?? .image,
      mediaURL: mediaURL,
      mediaPath: FirestoreValue.string(data["mediaPath"]) ?? "",
      createdAt: FirestoreValue.date(data["createdAt"]) ?? Date(),
      expiresAt: FirestoreValue.date(data["expiresAt"]) ?? Date()
    )
  }
}

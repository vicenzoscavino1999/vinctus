import FirebaseCore
import FirebaseFirestore
import Foundation

/// A group's name, for "en <grupo>" under a post's author.
protocol GroupNamesRepo {
  func name(groupID: String) async throws -> String?
}

final class FirebaseGroupNamesRepo: GroupNamesRepo {
  func name(groupID: String) async throws -> String? {
    guard FirebaseApp.app() != nil else { throw GroupsRepoError.firebaseNotConfigured }
    let doc = try await Firestore.firestore().collection(FirestoreCollections.groups).document(groupID).getDocument()
    return FirestoreValue.string(doc.data()?["name"])
  }
}

#if SCREENSHOTS
struct SampleGroupNamesRepo: GroupNamesRepo {
  func name(groupID: String) async throws -> String? {
    DemoSample.groups.first { $0.id == groupID }?.name
  }
}
#endif

/// Group names asked once per session and shared by every post of the same group, like the web's
/// `group-name:<id>` session cache.
@MainActor
final class GroupNames: ObservableObject {
  static let shared = GroupNames(repo: AppRepos.groupNames())

  @Published private(set) var names: [String: String] = [:]
  private var asked: Set<String> = []
  private let repo: GroupNamesRepo

  init(repo: GroupNamesRepo) {
    self.repo = repo
  }

  func name(for groupID: String?) -> String? {
    groupID.flatMap { names[$0] }
  }

  func load(_ groupID: String) async {
    guard !groupID.isEmpty, !asked.contains(groupID) else { return }
    asked.insert(groupID)
    do {
      if let name = try await repo.name(groupID: groupID) {
        names[groupID] = name
      }
    } catch {
      // A failure only means the group is not named; it is asked again next time.
      asked.remove(groupID)
    }
  }
}

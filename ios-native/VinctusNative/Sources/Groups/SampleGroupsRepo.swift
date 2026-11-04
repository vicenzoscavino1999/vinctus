import Foundation

// Screenshot builds only (see App/DemoData.swift).

#if SCREENSHOTS
struct SampleGroupsRepo: GroupsRepo {
  func fetchGroups(limit: Int) async throws -> GroupsPage {
    GroupsPage(items: Array(DemoSample.groups.prefix(limit)), isFromCache: false)
  }

  func fetchGroupDetail(groupID: String, recentPostLimit: Int, topMemberLimit: Int) async throws -> GroupDetail? {
    guard let group = DemoSample.groups.first(where: { $0.id == groupID }) else { return nil }
    return GroupDetail(
      id: group.id, name: group.name, description: group.description, categoryID: group.categoryID,
      ownerID: group.ownerID, visibility: group.visibility, iconURL: nil, memberCount: group.memberCount,
      postsPerWeek: 24, createdAt: Date(), updatedAt: Date(),
      recentPosts: [
        GroupPostPreview(id: "p1", title: "¿Qué libro recomiendan para empezar?", authorID: "u2", authorName: "Mateo Rojas", createdAt: Date()),
        GroupPostPreview(id: "p2", title: "Resumen del encuentro del sábado", authorID: "u3", authorName: "Valentina Cruz", createdAt: Date()),
      ],
      topMembers: DemoSample.users.prefix(4).map {
        GroupMemberPreview(uid: $0.uid, name: $0.displayName, photoURL: nil, role: "member", joinedAt: Date())
      },
      isFromCache: false
    )
  }

  func isMember(groupID: String, uid: String) async throws -> Bool { groupID == "g2" }
  func joinGroup(groupID: String, uid: String) async throws {}
  func leaveGroup(groupID: String, uid: String) async throws {}

  func membershipStatus(groupID: String, ownerID: String?, uid: String) async throws -> GroupMembershipStatus {
    if ownerID == uid { return .owner }
    return groupID == "g2" ? .member : .none
  }

  func requestToJoin(groupID: String, groupName: String, ownerID: String, uid: String) async throws {}
  func updateGroup(groupID: String, _ update: GroupUpdate) async throws {}
  func uploadGroupIcon(ownerID: String, groupID: String, jpegData: Data) async throws -> String { "" }
}
#endif

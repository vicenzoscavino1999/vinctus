import Foundation
@testable import VinctusNative

final class FakeGroupsRepo: GroupsRepo {
  var members: Set<String> = []
  var failsToUpdate = false
  var joinCalls = 0
  var leaveCalls = 0
  var listedGroups: [GroupSummary] = []
  var failsToList = false
  var requestedLimits: [Int] = []
  var stubDetail: GroupDetail?

  func fetchGroups(limit: Int) async throws -> GroupsPage {
    requestedLimits.append(limit)
    if failsToList { throw FakeError() }
    return GroupsPage(items: listedGroups, isFromCache: false)
  }

  func fetchGroupDetail(groupID: String, recentPostLimit: Int, topMemberLimit: Int) async throws -> GroupDetail? {
    stubDetail
  }

  func isMember(groupID: String, uid: String) async throws -> Bool {
    members.contains(uid)
  }

  func joinGroup(groupID: String, uid: String) async throws {
    joinCalls += 1
    if failsToUpdate { throw GroupsRepoError.privateGroup }
    members.insert(uid)
  }

  func leaveGroup(groupID: String, uid: String) async throws {
    leaveCalls += 1
    if failsToUpdate { throw FakeError() }
    members.remove(uid)
  }

  var requests: [String] = []

  func membershipStatus(groupID: String, ownerID: String?, uid: String) async throws -> GroupMembershipStatus {
    if ownerID == uid { return .owner }
    if members.contains(uid) { return .member }
    return requests.contains(uid) ? .pending : .none
  }

  func requestToJoin(groupID: String, groupName: String, ownerID: String, uid: String) async throws {
    requests.append(uid)
  }

  var updates: [GroupUpdate] = []
  var uploadedIcons = 0

  func updateGroup(groupID: String, _ update: GroupUpdate) async throws {
    if failsToUpdate { throw FakeError() }
    updates.append(update)
  }

  func uploadGroupIcon(ownerID: String, groupID: String, jpegData: Data) async throws -> String {
    uploadedIcons += 1
    if failsToUploadIcon { throw FakeError() }
    return "https://example.com/groups/\(ownerID)/\(groupID)/icon.jpg"
  }

  var createdGroups: [(draft: GroupUpdate, ownerID: String)] = []
  var failsToCreate = false
  var failsToUploadIcon = false
  var addedMembers: [(groupID: String, uid: String)] = []
  var failingMemberUIDs: Set<String> = []
  var myGroups: [GroupSummary] = []
  var failsToListMine = false

  func createGroup(_ draft: GroupUpdate, ownerID: String) async throws -> String {
    if failsToCreate { throw FakeError() }
    createdGroups.append((draft, ownerID))
    return "created-\(createdGroups.count)"
  }

  func addMember(groupID: String, uid: String) async throws {
    if failingMemberUIDs.contains(uid) { throw FakeError() }
    addedMembers.append((groupID, uid))
  }

  func fetchMyGroups(uid: String, limit: Int) async throws -> [GroupSummary] {
    if failsToListMine { throw FakeError() }
    return myGroups
  }
}

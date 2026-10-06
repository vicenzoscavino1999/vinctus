import FirebaseFirestore
import XCTest
@testable import VinctusNative

final class GroupsIntegrationTests: EmulatorTestCase {
  func testJoinAPublicGroupOpenItsChatAndLeave() async throws {
    let bruno = try await makeUser("Bruno")
    let groupID = try await makeGroup(name: "Astronomía", visibility: .public)
    let ana = try await makeUser("Ana")
    let groups = FirebaseGroupsRepo()

    let before = try await groups.membershipStatus(groupID: groupID, ownerID: bruno.uid, uid: ana.uid)
    XCTAssertEqual(before, GroupMembershipStatus.none)

    try await groups.joinGroup(groupID: groupID, uid: ana.uid)
    let joined = try await groups.membershipStatus(groupID: groupID, ownerID: bruno.uid, uid: ana.uid)
    XCTAssertEqual(joined, .member)

    let conversationID = try await FirebaseChatRepo().openGroupConversation(groupID: groupID)
    XCTAssertEqual(conversationID, "grp_\(groupID)")

    try await groups.leaveGroup(groupID: groupID, uid: ana.uid)
    let left = try await groups.membershipStatus(groupID: groupID, ownerID: bruno.uid, uid: ana.uid)
    XCTAssertEqual(left, GroupMembershipStatus.none)
  }

  func testAskToJoinAPrivateGroup() async throws {
    let bruno = try await makeUser("Bruno")
    let groupID = try await makeGroup(name: "Club privado", visibility: .private)
    let ana = try await makeUser("Ana")
    let groups = FirebaseGroupsRepo()

    try await groups.requestToJoin(groupID: groupID, groupName: "Club privado", ownerID: bruno.uid, uid: ana.uid)
    let status = try await groups.membershipStatus(groupID: groupID, ownerID: bruno.uid, uid: ana.uid)

    XCTAssertEqual(status, .pending)
  }

  func testAskingAgainAfterARejectionShowsTheNewPendingRequest() async throws {
    let bruno = try await makeUser("Bruno")
    let groupID = try await makeGroup(name: "Club privado", visibility: .private)
    let ana = try await makeUser("Ana")
    let groups = FirebaseGroupsRepo()

    try await groups.requestToJoin(groupID: groupID, groupName: "Club privado", ownerID: bruno.uid, uid: ana.uid)

    try await signIn(bruno)
    let firstRequest = try await Firestore.firestore().collection("group_requests")
      .whereField("toUid", isEqualTo: bruno.uid)
      .whereField("groupId", isEqualTo: groupID)
      .getDocuments()
    try await XCTUnwrap(firstRequest.documents.first).reference.updateData([
      "status": "rejected",
      "updatedAt": FieldValue.serverTimestamp(),
    ])

    try await signIn(ana)
    let afterRejection = try await groups.membershipStatus(groupID: groupID, ownerID: bruno.uid, uid: ana.uid)
    XCTAssertEqual(afterRejection, .none)

    try await groups.requestToJoin(groupID: groupID, groupName: "Club privado", ownerID: bruno.uid, uid: ana.uid)
    let afterNewRequest = try await groups.membershipStatus(groupID: groupID, ownerID: bruno.uid, uid: ana.uid)
    XCTAssertEqual(afterNewRequest, .pending)

    do {
      try await groups.requestToJoin(groupID: groupID, groupName: "Club privado", ownerID: bruno.uid, uid: ana.uid)
      XCTFail("A second pending request for the same group should be refused")
    } catch GroupsRepoError.requestAlreadySent {
      // Expected.
    }
  }

  func testThePublicJoinIsRejectedForAPrivateGroup() async throws {
    _ = try await makeUser("Bruno")
    let groupID = try await makeGroup(name: "Club privado", visibility: .private)
    let ana = try await makeUser("Ana")

    do {
      try await FirebaseGroupsRepo().joinGroup(groupID: groupID, uid: ana.uid)
      XCTFail("The rules should reject joining a private group without a request")
    } catch {}
  }

  func testTheOwnerEditsTheGroup() async throws {
    _ = try await makeUser("Bruno")
    let groupID = try await makeGroup(name: "Astronomía", visibility: .public)
    let groups = FirebaseGroupsRepo()

    let update = GroupUpdate(
      name: "Astronomía Lima",
      description: "Salidas para observar el cielo",
      categoryID: "science",
      visibility: .public,
      iconURL: nil
    )
    try await groups.updateGroup(groupID: groupID, update)
    let detail = try await groups.fetchGroupDetail(groupID: groupID, recentPostLimit: 5, topMemberLimit: 5)

    XCTAssertEqual(detail?.name, "Astronomía Lima")
    XCTAssertEqual(detail?.description, "Salidas para observar el cielo")
  }
}

final class CollectionsIntegrationTests: EmulatorTestCase {
  func testCreateFillEditAndDeleteACollection() async throws {
    _ = try await makeUser("Ana")
    let repo = FirebaseCollectionsRepo()

    try await repo.createCollection(name: "Libros por leer", icon: .book)
    let created = try await repo.fetchCollections()
    let collection = try XCTUnwrap(created.first)
    XCTAssertEqual(collection.name, "Libros por leer")

    var link = NewCollectionItem()
    link.title = "Cosmos"
    link.url = "https://example.com/cosmos"
    try await repo.addItem(link, to: collection)
    var note = NewCollectionItem()
    note.kind = .note
    note.title = "Idea"
    note.text = "Leer en vacaciones"
    try await repo.addItem(note, to: collection)
    let items = try await repo.fetchItems(collectionID: collection.id)
    XCTAssertEqual(Set(items.map(\.title)), ["Cosmos", "Idea"])

    try await repo.updateCollection(id: collection.id, name: "Libros 2026", icon: .notes)
    let renamed = try await repo.fetchCollections()
    XCTAssertEqual(renamed.first?.name, "Libros 2026")

    let firstItem = try XCTUnwrap(items.first)
    try await repo.deleteItem(id: firstItem.id, from: collection.id)
    let remainingItems = try await repo.fetchItems(collectionID: collection.id)
    XCTAssertEqual(remainingItems.count, 1)

    try await repo.deleteCollection(id: collection.id)
    let remaining = try await repo.fetchCollections()
    XCTAssertTrue(remaining.isEmpty)
  }
}

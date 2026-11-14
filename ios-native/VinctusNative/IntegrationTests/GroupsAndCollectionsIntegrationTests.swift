import FirebaseFirestore
import XCTest
@testable import VinctusNative

final class GroupsIntegrationTests: EmulatorTestCase {
  func testPrivatePostAndCommentsAreReauthorizedAfterMembershipRevocation() async throws {
    let owner = try await makeUser("Owner")
    let groupID = try await makeGroup(name: "Private reading", visibility: .private)
    let posts = FirebaseCreatePostRepo()
    let postID = try posts.makePostID()
    try await posts.publishTextPost(text: "Members only", postID: postID, groupID: groupID)
    try await FirebasePostCommentsRepo().addComment(postID: postID, text: "Private comment")
    let member = try await makeUser("Reader")
    let before = try await PostReadClient.read(view: "ids", ids: [postID])
    XCTAssertTrue(before.items.isEmpty)
    try await signIn(owner)
    let membership = Firestore.firestore().collection("groups").document(groupID).collection("members").document(member.uid)
    try await membership.setData(["uid": member.uid, "groupId": groupID, "role": "member", "joinedAt": FieldValue.serverTimestamp()])
    try await signIn(member)
    let allowed = try await PostReadClient.read(view: "ids", ids: [postID])
    XCTAssertEqual(allowed.items.map(\.id), [postID])
    let comments = try await FirebasePostCommentsRepo().fetchComments(postID: postID, limit: 50)
    XCTAssertEqual(comments.items.map(\.text), ["Private comment"])
    try await signIn(owner)
    try await membership.delete()
    try await signIn(member)
    let revoked = try await PostReadClient.read(view: "ids", ids: [postID])
    XCTAssertTrue(revoked.items.isEmpty)
    let hiddenComments = try await FirebasePostCommentsRepo().fetchComments(postID: postID, limit: 50)
    XCTAssertTrue(hiddenComments.items.isEmpty)
  }

  func testPublishingRequiresRealGroupMembershipAndStopsAfterLeaving() async throws {
    let owner = try await makeUser("Bruno")
    let groupID = try await makeGroup(name: "Publicaciones privadas", visibility: .private)
    let posts = FirebaseCreatePostRepo()
    let ownerPost = try posts.makePostID()
    try await posts.publishTextPost(text: "Del propietario", postID: ownerPost, groupID: groupID)
    let member = try await makeUser("Ana")
    let deniedPost = try posts.makePostID()
    do {
      try await posts.publishTextPost(text: "Sin permiso", postID: deniedPost, groupID: groupID)
      XCTFail("A non-member must not publish in a private group")
    } catch {
      XCTAssertEqual((error as NSError).code, FirestoreErrorCode.permissionDenied.rawValue)
    }

    try await signIn(owner)
    try await Firestore.firestore().collection("groups").document(groupID)
      .collection("members").document(member.uid).setData([
        "uid": member.uid, "groupId": groupID, "role": "member",
        "joinedAt": FieldValue.serverTimestamp(),
      ])
    try await signIn(member)
    let acceptedPost = try posts.makePostID()
    try await posts.publishTextPost(text: "Soy miembro", postID: acceptedPost, groupID: groupID)
    try await FirebaseGroupsRepo().leaveGroup(groupID: groupID, uid: member.uid)
    let afterLeaving = try posts.makePostID()
    do {
      try await posts.publishTextPost(text: "Ya salí", postID: afterLeaving, groupID: groupID)
      XCTFail("A former member must not publish")
    } catch {
      XCTAssertEqual((error as NSError).code, FirestoreErrorCode.permissionDenied.rawValue)
    }
  }

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

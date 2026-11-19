import FirebaseFirestore
import FirebaseStorage
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

    let posts = FirebaseCreatePostRepo()
    let postID = try posts.makePostID()
    let draft = NativePostDraft(
      title: "Salida al observatorio",
      text: "Nos vemos este sábado a las 8pm con telescopios.",
      files: [],
      youtubeVideoID: nil
    )
    try await posts.publishPost(
      draft,
      postID: postID,
      groupID: groupID,
      categoryID: "science",
      onProgress: { _ in }
    )
    do {
      try await posts.publishPost(
        draft,
        postID: postID,
        groupID: groupID,
        categoryID: "music",
        onProgress: { _ in }
      )
      XCTFail("A retry must not change the group post's category")
    } catch CreatePostRepoError.draftMismatchForRetry {
      // Expected.
    }

    let detail = try await groups.fetchGroupDetail(groupID: groupID, recentPostLimit: 5, topMemberLimit: 5)

    XCTAssertEqual(detail?.name, "Astronomía Lima")
    XCTAssertEqual(detail?.description, "Salidas para observar el cielo")
    XCTAssertEqual(detail?.categoryID, "science")
    let recentPost = try XCTUnwrap(detail?.recentPosts.first { $0.id == postID })
    XCTAssertEqual(recentPost.title, "Salida al observatorio")
    XCTAssertEqual(recentPost.resolvedFeedItem.id, postID)
    XCTAssertEqual(recentPost.resolvedFeedItem.title, "Salida al observatorio")
    XCTAssertEqual(recentPost.resolvedFeedItem.text, "Nos vemos este sábado a las 8pm con telescopios.")
  }

  func testJoiningTwiceIsIdempotentAndReApplyingWorksAfterLeavingPrivateGroup() async throws {
    let bruno = try await makeUser("Bruno")
    let pubGroupID = try await makeGroup(name: "Grupo Idempotente", visibility: .public)
    let privGroupID = try await makeGroup(name: "Club Selecto", visibility: .private)

    try await Firestore.firestore().collection("groups").document(privGroupID)
      .collection("members").document(bruno.uid).setData([
        "uid": bruno.uid, "groupId": privGroupID, "role": "admin",
        "joinedAt": FieldValue.serverTimestamp(),
      ])

    let ana = try await makeUser("Ana")
    let groups = FirebaseGroupsRepo()

    // Public group idempotency: joining twice does not fail or violate immutable joinedAt rules.
    try await groups.joinGroup(groupID: pubGroupID, uid: ana.uid)
    try await groups.joinGroup(groupID: pubGroupID, uid: ana.uid)
    let pubStatus = try await groups.membershipStatus(groupID: pubGroupID, ownerID: bruno.uid, uid: ana.uid)
    XCTAssertEqual(pubStatus, .member)

    // Private group: outsider can fetch group metadata cleanly without failing on restricted members list.
    let outsiderDetail = try await groups.fetchGroupDetail(groupID: privGroupID, recentPostLimit: 5, topMemberLimit: 5)
    XCTAssertEqual(outsiderDetail?.visibility, .private)
    XCTAssertEqual(outsiderDetail?.topMembers.isEmpty, true)

    // Ana requests access, Bruno accepts, Ana leaves, and Ana can request again cleanly.
    try await groups.requestToJoin(groupID: privGroupID, groupName: "Club Selecto", ownerID: bruno.uid, uid: ana.uid)
    try await signIn(bruno)
    let reqSnap = try await Firestore.firestore().collection("group_requests")
      .whereField("toUid", isEqualTo: bruno.uid)
      .whereField("groupId", isEqualTo: privGroupID)
      .whereField("status", isEqualTo: "pending")
      .getDocuments()
    let reqDoc = try XCTUnwrap(reqSnap.documents.first)
    let batch = Firestore.firestore().batch()
    batch.updateData(["status": "accepted", "updatedAt": FieldValue.serverTimestamp()], forDocument: reqDoc.reference)
    batch.setData([
      "uid": ana.uid,
      "groupId": privGroupID,
      "role": "member",
      "joinedAt": FieldValue.serverTimestamp(),
    ], forDocument: Firestore.firestore().collection("groups").document(privGroupID).collection("members").document(ana.uid))
    batch.setData([
      "groupId": privGroupID,
      "joinedAt": FieldValue.serverTimestamp(),
    ], forDocument: Firestore.firestore().collection("users").document(ana.uid).collection("memberships").document(privGroupID))
    try await batch.commit()

    try await signIn(ana)
    do {
      try await groups.requestToJoin(groupID: privGroupID, groupName: "Club Selecto", ownerID: bruno.uid, uid: ana.uid)
      XCTFail("Existing member must not send a new join request")
    } catch GroupsRepoError.alreadyMember {
      // Expected.
    }

    try await groups.leaveGroup(groupID: privGroupID, uid: ana.uid)
    let afterLeave = try await groups.membershipStatus(groupID: privGroupID, ownerID: bruno.uid, uid: ana.uid)
    XCTAssertEqual(afterLeave, GroupMembershipStatus.none)

    try await groups.requestToJoin(groupID: privGroupID, groupName: "Club Selecto", ownerID: bruno.uid, uid: ana.uid)
    let afterReRequest = try await groups.membershipStatus(groupID: privGroupID, ownerID: bruno.uid, uid: ana.uid)
    XCTAssertEqual(afterReRequest, .pending)
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

  func testFileUploadDriftedItemCountDeleteAndStorageCleanup() async throws {
    let ana = try await makeUser("Ana")
    let repo = FirebaseCollectionsRepo()

    try await repo.createCollection(name: "Archivos privados", icon: .folder)
    let collection = try XCTUnwrap(try await repo.fetchCollections().first)

    let pdfData = Data("%PDF-1.4\nContenido de prueba".utf8)
    var firstFile = NewCollectionItem()
    firstFile.kind = .file
    firstFile.title = "Guía 1"
    firstFile.file = CollectionUploadFile(
      data: pdfData,
      fileName: "guia-1.pdf",
      contentType: "application/pdf"
    )
    try await repo.addItem(firstFile, to: collection)

    let items = try await repo.fetchItems(collectionID: collection.id)
    let savedFirst = try XCTUnwrap(items.first)
    XCTAssertEqual(savedFirst.type, .file)
    XCTAssertEqual(savedFirst.fileName, "guia-1.pdf")
    XCTAssertEqual(savedFirst.fileSize, pdfData.count)
    let firstStoragePath = try XCTUnwrap(savedFirst.storagePath)
    XCTAssertTrue(firstStoragePath.hasPrefix("collections/\(ana.uid)/\(collection.id)/"))

    let metaBeforeDelete = try await Storage.storage().reference(withPath: firstStoragePath).getMetadata()
    XCTAssertEqual(metaBeforeDelete.size, Int64(pdfData.count))

    // Another user must not read private collections, items, or Storage objects.
    _ = try await makeUser("Bruno")
    do {
      _ = try await Firestore.firestore()
        .collection("users").document(ana.uid)
        .collection("collections").document(collection.id)
        .getDocument(source: .server)
      XCTFail("Another user must not read a private collection")
    } catch {
      // Expected permission denied.
    }
    do {
      _ = try await Storage.storage().reference(withPath: firstStoragePath).getMetadata()
      XCTFail("Another user must not read a private collection file")
    } catch {
      // Expected permission denied.
    }

    // Back as Ana: drift itemCount down to 0 and verify deleteItem still succeeds (clamped >= 0)
    // and deletes the Storage object.
    try await signIn(ana)
    try await Firestore.firestore()
      .collection("users").document(ana.uid)
      .collection("collections").document(collection.id)
      .updateData(["itemCount": 0, "updatedAt": FieldValue.serverTimestamp()])

    try await repo.deleteItem(id: savedFirst.id, from: collection.id)
    let itemsAfterFirstDelete = try await repo.fetchItems(collectionID: collection.id)
    XCTAssertTrue(itemsAfterFirstDelete.isEmpty)

    do {
      _ = try await Storage.storage().reference(withPath: firstStoragePath).getMetadata()
      XCTFail("Deleted collection item file should be removed from Storage")
    } catch {
      // Expected object-not-found.
    }

    // Add a second file and verify deleteCollection cleans up both Firestore and Storage.
    var secondFile = NewCollectionItem()
    secondFile.kind = .file
    secondFile.title = "Guía 2"
    secondFile.file = CollectionUploadFile(
      data: pdfData,
      fileName: "guia-2.pdf",
      contentType: "application/pdf"
    )
    try await repo.addItem(secondFile, to: collection)
    let savedSecond = try XCTUnwrap(try await repo.fetchItems(collectionID: collection.id).first)
    let secondStoragePath = try XCTUnwrap(savedSecond.storagePath)

    try await repo.deleteCollection(id: collection.id)
    let remainingCollections = try await repo.fetchCollections()
    XCTAssertTrue(remainingCollections.isEmpty)

    do {
      _ = try await Storage.storage().reference(withPath: secondStoragePath).getMetadata()
      XCTFail("Deleted collection should also remove its files from Storage")
    } catch {
      // Expected object-not-found.
    }
  }
}

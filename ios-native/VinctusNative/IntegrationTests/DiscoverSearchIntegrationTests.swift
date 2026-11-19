import FirebaseAuth
import FirebaseFirestore
import XCTest
@testable import VinctusNative

final class DiscoverSearchIntegrationTests: EmulatorTestCase {
  func testDiscoverUsersCategoryGroupsLibraryAndIdempotentCategoryFollow() async throws {
    let tag = String(UUID().uuidString.prefix(6).lowercased())
    let targetName = "Zora\(tag)"
    let target = try await makeUser(targetName)
    let viewer = try await makeUser("Bruno\(tag)")
    let discoverRepo = FirebaseDiscoverRepo()
    let profileContentRepo = FirebaseProfileContentRepo()

    // 1. Recent suggested users exclude the signed-in viewer and include newly created users.
    let recent = try await discoverRepo.fetchRecentUsers(limit: 20, excluding: viewer.uid)
    XCTAssertFalse(recent.contains(where: { $0.uid == viewer.uid }))
    XCTAssertTrue(recent.contains(where: { $0.uid == target.uid }))

    // 2. Prefix search finds the target user by lowercase displayName prefix.
    let searched = try await discoverRepo.searchUsers(
      prefix: "ZORA\(tag)",
      limit: 10,
      excluding: viewer.uid
    )
    XCTAssertEqual(searched.map(\.uid), [target.uid])

    // 3. Category groups query returns groups assigned to that categoryId.
    let groupRef = Firestore.firestore().collection(FirestoreCollections.groups).document()
    try await groupRef.setData([
      "name": "Física \(tag)",
      "description": "Grupo de prueba de ciencia",
      "categoryId": "science",
      "visibility": ProfileAccountVisibility.public.rawValue,
      "ownerId": viewer.uid,
      "memberCount": 1,
      "createdAt": FieldValue.serverTimestamp(),
      "updatedAt": FieldValue.serverTimestamp(),
    ])

    let scienceGroups = try await discoverRepo.fetchCategoryGroups(categoryID: "science", limit: 50)
    XCTAssertTrue(scienceGroups.contains(where: { $0.id == groupRef.documentID }))

    // 4. Category library returns contributions for the category with resolved author displayName.
    let contributionTitle = "Ondas gravitacionales \(tag)"
    try await profileContentRepo.createContribution(
      NewContribution(
        type: .paper,
        title: contributionTitle,
        description: "Resumen de prueba",
        link: "https://arxiv.org/abs/2401.00001",
        categoryID: "science"
      )
    )

    let library = try await discoverRepo.fetchCategoryLibrary(categoryID: "science", limit: 20)
    let matchedItem = try XCTUnwrap(library.first(where: { $0.title == contributionTitle }))
    XCTAssertEqual(matchedItem.userID, viewer.uid)
    XCTAssertEqual(matchedItem.authorName, viewer.name)
    XCTAssertEqual(matchedItem.linkURL?.absoluteString, "https://arxiv.org/abs/2401.00001")

    // 5. Following the same category twice is idempotent under strict createdAt immutability rules.
    try await profileContentRepo.setCategoryFollowed(true, categoryID: "science")
    try await profileContentRepo.setCategoryFollowed(true, categoryID: "science")
    let followedAfterAdd = try await profileContentRepo.fetchFollowedCategories()
    XCTAssertTrue(followedAfterAdd.contains("science"))

    try await profileContentRepo.setCategoryFollowed(false, categoryID: "science")
    let followedAfterRemove = try await profileContentRepo.fetchFollowedCategories()
    XCTAssertFalse(followedAfterRemove.contains("science"))
  }
}

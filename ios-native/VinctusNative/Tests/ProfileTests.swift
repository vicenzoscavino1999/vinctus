import FirebaseFirestore
import UIKit
import XCTest
@testable import VinctusNative

final class FirestoreValueTests: XCTestCase {
  func testStrings() {
    XCTAssertEqual(FirestoreValue.string("  hola "), "hola")
    XCTAssertNil(FirestoreValue.string("   "))
    XCTAssertNil(FirestoreValue.string(nil))
    XCTAssertNil(FirestoreValue.string(42))
  }

  func testNumbers() {
    XCTAssertEqual(FirestoreValue.int(3), 3)
    XCTAssertEqual(FirestoreValue.int(NSNumber(value: 4)), 4)
    XCTAssertEqual(FirestoreValue.int("5"), 5)
    XCTAssertNil(FirestoreValue.int("cinco"))
    XCTAssertEqual(FirestoreValue.double(NSNumber(value: 2.5)), 2.5)
  }

  func testDates() {
    let date = Date(timeIntervalSince1970: 1_700_000_000)
    XCTAssertEqual(FirestoreValue.date(Timestamp(date: date)), date)
    XCTAssertEqual(FirestoreValue.date(date), date)
    XCTAssertNil(FirestoreValue.date("2026-01-01"))
  }
}

/// Profile values must match the web (`src/features/profile`).
final class ProfileDataTests: XCTestCase {
  func testCategoriesMatchTheWeb() {
    XCTAssertEqual(
      InterestCategory.all.map(\.id),
      ["science", "music", "history", "technology", "literature", "nature"]
    )
    XCTAssertEqual(InterestCategory.title(for: "science"), "Ciencia & Materia")
    XCTAssertEqual(InterestCategory.title(for: "otra"), "otra")
  }

  func testContributionTypesMatchTheRules() {
    XCTAssertEqual(ContributionType.allCases.map(\.rawValue), ["project", "paper", "cv", "certificate", "other"])
  }

  func testValidContributionIsTrimmed() throws {
    var draft = NewContribution()
    draft.title = "  Telescopio  "
    draft.description = "   "
    draft.link = " https://example.com "

    let fields = try draft.validated()

    XCTAssertEqual(fields.title, "Telescopio")
    XCTAssertNil(fields.description)
    XCTAssertEqual(fields.link, "https://example.com")
  }

  func testInvalidContributionsAreRejected() {
    var empty = NewContribution()
    empty.title = "  "
    XCTAssertThrowsError(try empty.validated())

    var longTitle = NewContribution()
    longTitle.title = String(repeating: "a", count: 141)
    XCTAssertThrowsError(try longTitle.validated())

    var badLink = NewContribution()
    badLink.title = "Proyecto"
    badLink.link = "javascript:alert(1)"
    XCTAssertThrowsError(try badLink.validated())
  }

  func testTopInterestsKeepTheSixBestWithPoints() {
    let karma: [String: Double] = [
      "a": 1, "b": 8, "c": 3, "d": 0, "e": 5, "f": 2, "g": 7, "h": 4,
    ]

    let top = ProfileReputationSection.topInterests(karma)

    XCTAssertEqual(top.map { $0.id }, ["b", "g", "e", "h", "c", "f"])
  }

  func testSavedDebatePersonaNames() {
    XCTAssertEqual(SavedDebate.personaName("devil"), "Abogado del Diablo")
    XCTAssertEqual(SavedDebate.personaName("nueva"), "nueva")
  }

  func testProfilePhotoIsScaledDownToJPEG() throws {
    let big = UIGraphicsImageRenderer(size: CGSize(width: 3000, height: 1500)).image { context in
      UIColor.orange.setFill()
      context.fill(CGRect(x: 0, y: 0, width: 3000, height: 1500))
    }

    let data = try XCTUnwrap(EditProfileViewModel.jpegData(big))
    let image = try XCTUnwrap(UIImage(data: data))

    XCTAssertEqual(image.size.width * image.scale, 1024, accuracy: 1)
    XCTAssertEqual(image.size.height * image.scale, 512, accuracy: 1)
  }
}

@MainActor
final class ProfileViewModelTests: XCTestCase {
  func testLoadsTheProfile() async {
    let repo = FakeProfileRepo()
    repo.profile = FakeProfileRepo.sample()
    let vm = ProfileViewModel(repo: repo)

    await vm.load(userID: "u1")

    XCTAssertEqual(vm.profile?.displayName, "Lucía")
    XCTAssertNil(vm.errorMessage)
    XCTAssertFalse(vm.isLoading)
  }

  func testMissingProfileAndBadIDShowAMessage() async {
    let vm = ProfileViewModel(repo: FakeProfileRepo())

    await vm.load(userID: "u1")
    XCTAssertEqual(vm.errorMessage, "No encontramos este perfil.")

    await vm.load(userID: "   ")
    XCTAssertEqual(vm.errorMessage, "UID inválido")
  }

  func testLoadErrorIsShown() async {
    let repo = FakeProfileRepo()
    repo.failsToLoad = true
    let vm = ProfileViewModel(repo: repo)

    await vm.load(userID: "u1")

    XCTAssertEqual(vm.errorMessage, "Falló la prueba")
    XCTAssertNil(vm.profile)
  }
}

import UIKit
import XCTest
@testable import VinctusNative

@MainActor
final class EditProfileViewModelTests: XCTestCase {
  private func imageData() -> Data {
    UIGraphicsImageRenderer(size: CGSize(width: 40, height: 20)).image { context in
      UIColor.orange.setFill()
      context.fill(CGRect(x: 0, y: 0, width: 40, height: 20))
    }.pngData()!
  }

  func testStartsWithTheSavedFields() {
    let vm = EditProfileViewModel(profile: FakeProfileRepo.sample(), repo: FakeProfileRepo())

    XCTAssertEqual(vm.displayName, "Lucía")
    XCTAssertEqual(vm.role, "")
    XCTAssertTrue(vm.canSave)
    XCTAssertFalse(vm.canRemovePhoto)
  }

  func testTheNameAndTheLimitsDecideIfItCanSave() {
    let vm = EditProfileViewModel(profile: FakeProfileRepo.sample(), repo: FakeProfileRepo())

    vm.displayName = "   "
    XCTAssertFalse(vm.canSave)
    XCTAssertEqual(vm.previewName, "Lucía")

    vm.displayName = "Lucía"
    vm.bio = String(repeating: "a", count: EditProfileViewModel.bioLimit + 1)
    XCTAssertFalse(vm.canSave)
    XCTAssertEqual(vm.bioCharactersLeft, -1)
  }

  func testSavesTrimmedFieldsAndClearsEmptyOnes() async throws {
    let repo = FakeProfileRepo()
    let vm = EditProfileViewModel(profile: FakeProfileRepo.sample(), repo: repo)
    vm.displayName = "  Lucía F.  "
    vm.role = "  Física "
    vm.bio = "   "

    let saved = await vm.save()

    XCTAssertTrue(saved)
    let update = try XCTUnwrap(repo.updates.first)
    XCTAssertEqual(update.displayName, "Lucía F.")
    XCTAssertEqual(update.role, "Física")
    XCTAssertNil(update.bio)
    XCTAssertTrue(repo.uploadedPhotos.isEmpty)
    guard case .keep = update.photo else { return XCTFail("La foto no debía cambiar") }
  }

  func testANewPhotoIsUploadedBeforeSaving() async throws {
    let repo = FakeProfileRepo()
    let vm = EditProfileViewModel(profile: FakeProfileRepo.sample(), repo: repo)
    vm.setPickedPhoto(imageData())
    XCTAssertNotNil(vm.newPhoto)
    XCTAssertTrue(vm.canRemovePhoto)

    let saved = await vm.save()

    XCTAssertTrue(saved)
    XCTAssertEqual(repo.uploadedPhotos.count, 1)
    let update = try XCTUnwrap(repo.updates.first)
    guard case .set(let url) = update.photo else { return XCTFail("Debía guardar la foto nueva") }
    XCTAssertEqual(url, "https://example.com/profiles/u1/avatar.jpg")
  }

  func testRemovingThePhoto() async throws {
    let repo = FakeProfileRepo()
    let vm = EditProfileViewModel(
      profile: FakeProfileRepo.sample(photoURL: "https://example.com/old.jpg"),
      repo: repo
    )
    XCTAssertTrue(vm.canRemovePhoto)
    XCTAssertEqual(vm.previewPhotoURL, "https://example.com/old.jpg")

    vm.removePhoto()
    XCTAssertFalse(vm.canRemovePhoto)
    XCTAssertNil(vm.previewPhotoURL)
    let saved = await vm.save()

    XCTAssertTrue(saved)
    let update = try XCTUnwrap(repo.updates.first)
    guard case .remove = update.photo else { return XCTFail("Debía quitar la foto") }
  }

  func testAnUnreadablePhotoShowsAnError() {
    let vm = EditProfileViewModel(profile: FakeProfileRepo.sample(), repo: FakeProfileRepo())

    vm.setPickedPhoto(Data("no es una imagen".utf8))

    XCTAssertNil(vm.newPhoto)
    XCTAssertEqual(vm.errorMessage, "No se pudo leer la imagen.")
  }

  func testAFailedSaveShowsAMessage() async {
    let repo = FakeProfileRepo()
    repo.failsToSave = true
    let vm = EditProfileViewModel(profile: FakeProfileRepo.sample(), repo: repo)

    let saved = await vm.save()

    XCTAssertFalse(saved)
    XCTAssertEqual(vm.errorMessage, "No se pudo guardar. Intenta de nuevo.")
    XCTAssertFalse(vm.isSaving)
  }
}

@MainActor
final class ProfileConnectionViewModelTests: XCTestCase {
  private func request(from id: String) -> IncomingFollowRequest {
    IncomingFollowRequest(id: "req_\(id)", from: FakeProfileContentRepo.user(id))
  }

  func testCountsTheRequestsOnYourOwnProfile() async {
    let content = FakeProfileContentRepo()
    content.incomingRequests = [request(from: "x"), request(from: "y")]
    let vm = ProfileConnectionViewModel(userID: "me", chatRepo: FakeChatRepo(), contentRepo: content)

    await vm.loadRequests(isOwnProfile: true)

    XCTAssertEqual(vm.incomingRequestCount, 2)
    XCTAssertFalse(vm.hasIncomingRequest)
  }

  func testAnswersTheRequestOfThisProfile() async {
    let content = FakeProfileContentRepo()
    content.incomingRequests = [request(from: "x")]
    let vm = ProfileConnectionViewModel(userID: "x", chatRepo: FakeChatRepo(), contentRepo: content)
    await vm.loadRequests(isOwnProfile: false)
    XCTAssertTrue(vm.hasIncomingRequest)

    await vm.answerRequest(accept: true)

    XCTAssertFalse(vm.hasIncomingRequest)
    XCTAssertEqual(content.answers.first?.fromUID, "x")
    XCTAssertEqual(content.answers.first?.accept, true)
    XCTAssertFalse(vm.isAnsweringRequest)
  }

  func testAFailedAnswerKeepsTheBanner() async {
    let content = FakeProfileContentRepo()
    content.incomingRequests = [request(from: "x")]
    content.failsToWrite = true
    let vm = ProfileConnectionViewModel(userID: "x", chatRepo: FakeChatRepo(), contentRepo: content)
    await vm.loadRequests(isOwnProfile: false)

    await vm.answerRequest(accept: false)

    XCTAssertTrue(vm.hasIncomingRequest)
    XCTAssertEqual(vm.messageError, "No se pudo responder la solicitud.")
  }

  func testOpensTheDirectConversation() async {
    let vm = ProfileConnectionViewModel(userID: "u2", chatRepo: FakeChatRepo(), contentRepo: FakeProfileContentRepo())

    await vm.openConversation()

    XCTAssertEqual(vm.openedConversationID, "dm_u2")
    XCTAssertFalse(vm.isOpeningConversation)
    XCTAssertNil(vm.messageError)
  }
}

import XCTest
@testable import VinctusNative

@MainActor
final class CollectionEditorViewModelTests: XCTestCase {
  func testCreatesANewCollection() async {
    let repo = RecordingCollectionsRepo()
    let vm = CollectionEditorViewModel(target: .new, repo: repo)
    XCTAssertEqual(vm.title, "Nueva colección")
    XCTAssertEqual(vm.icon, .folder)
    XCTAssertFalse(vm.canSave)

    vm.name = "Discos"
    vm.icon = .music
    let saved = await vm.save()

    XCTAssertTrue(saved)
    XCTAssertEqual(repo.created.first?.name, "Discos")
    XCTAssertEqual(repo.created.first?.icon, .music)
    XCTAssertFalse(vm.isSaving)
  }

  func testEditsAnExistingCollection() async {
    let repo = RecordingCollectionsRepo()
    let vm = CollectionEditorViewModel(target: .existing(RecordingCollectionsRepo.collection), repo: repo)
    XCTAssertEqual(vm.title, "Editar colección")
    XCTAssertEqual(vm.name, "Libros")
    XCTAssertEqual(vm.icon, .book)

    vm.name = "Libros 2026"
    let saved = await vm.save()

    XCTAssertTrue(saved)
    XCTAssertEqual(repo.updated.first?.id, "c1")
    XCTAssertEqual(repo.updated.first?.name, "Libros 2026")
    XCTAssertTrue(repo.created.isEmpty)
  }

  func testAFailedSaveShowsTheError() async {
    let repo = RecordingCollectionsRepo()
    repo.fails = true
    let vm = CollectionEditorViewModel(target: .new, repo: repo)
    vm.name = "Discos"

    let saved = await vm.save()

    XCTAssertFalse(saved)
    XCTAssertEqual(vm.errorMessage, "Falló la prueba")
  }
}

@MainActor
final class CollectionDetailViewModelTests: XCTestCase {
  func testDeleteIsImmediateAndRolledBackOnFailure() async {
    let repo = RecordingCollectionsRepo()
    repo.items = [RecordingCollectionsRepo.item("i1"), RecordingCollectionsRepo.item("i2")]
    let vm = CollectionDetailViewModel(collection: RecordingCollectionsRepo.collection, repo: repo)
    await vm.load()
    XCTAssertEqual(vm.items.map(\.id), ["i1", "i2"])

    let deleted = await vm.delete(RecordingCollectionsRepo.item("i1"))
    XCTAssertTrue(deleted)
    XCTAssertEqual(vm.items.map(\.id), ["i2"])

    repo.fails = true
    let failed = await vm.delete(RecordingCollectionsRepo.item("i2"))
    XCTAssertFalse(failed)
    XCTAssertEqual(vm.items.map(\.id), ["i2"])
    XCTAssertEqual(vm.errorMessage, "No se pudo eliminar.")
  }

  func testLoadError() async {
    let repo = RecordingCollectionsRepo()
    repo.fails = true
    let vm = CollectionDetailViewModel(collection: RecordingCollectionsRepo.collection, repo: repo)

    await vm.load()

    XCTAssertEqual(vm.errorMessage, "No se pudo cargar la colección.")
    XCTAssertFalse(vm.isLoading)
  }
}

@MainActor
final class NewCollectionItemViewModelTests: XCTestCase {
  func testAddsALink() async {
    let repo = RecordingCollectionsRepo()
    let vm = NewCollectionItemViewModel(collection: RecordingCollectionsRepo.collection, repo: repo)
    vm.draft.title = "Artículo"
    vm.draft.url = "https://example.com"

    let saved = await vm.save()

    XCTAssertTrue(saved)
    XCTAssertEqual(repo.added.first?.title, "Artículo")
    XCTAssertFalse(vm.isSaving)
  }

  func testAFailedAddShowsTheError() async {
    let repo = RecordingCollectionsRepo()
    repo.fails = true
    let vm = NewCollectionItemViewModel(collection: RecordingCollectionsRepo.collection, repo: repo)
    vm.draft.title = "Artículo"

    let saved = await vm.save()

    XCTAssertFalse(saved)
    XCTAssertEqual(vm.errorMessage, "Falló la prueba")
  }
}

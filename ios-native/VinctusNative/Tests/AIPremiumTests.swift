import XCTest
@testable import VinctusNative

@MainActor
final class AIPremiumTests: XCTestCase {
  func testNewDebateGoesBackToTheFormKeepingTopicAndPersonas() async {
    let repo = FakeAIRepo()
    let vm = ArenaViewModel(repo: repo)
    await vm.load()
    vm.topic = "La energía nuclear es clave para el clima"
    vm.personaA = "scientist"
    vm.personaB = "skeptic"

    await vm.createNow()
    XCTAssertNotNil(vm.result)
    XCTAssertEqual(vm.resultNames["B"], "Escéptico")

    vm.newDebate()

    XCTAssertNil(vm.result)
    XCTAssertNil(vm.resultDebate)
    XCTAssertTrue(vm.resultNames.isEmpty)
    XCTAssertFalse(vm.isResultSaved)
    XCTAssertEqual(vm.topic, "La energía nuclear es clave para el clima")
    XCTAssertEqual(vm.personaA, "scientist")
    XCTAssertEqual(vm.personaB, "skeptic")
    XCTAssertTrue(vm.canCreate, "The same debate can be started again")
  }

  func testEveryServerPersonaHasTheWebsEmoji() {
    let expected = [
      "scientist": "🔬", "philosopher": "🤔", "pragmatist": "⚙️",
      "skeptic": "🧐", "optimist": "🌟", "devil": "😈",
    ]
    for (id, emoji) in expected {
      XCTAssertEqual(ArenaPersonaStyle.emoji(for: id), emoji, id)
    }
    XCTAssertEqual(ArenaPersonaStyle.emoji(for: "unknown"), "🎙️")
  }

  func testChatSuggestionsMatchTheWeb() {
    XCTAssertEqual(AIChatView.suggestions, [
      "Explícame un tema difícil en palabras simples",
      "Ideas para un proyecto de fin de semana",
      "Crea un grupo sobre astronomía",
      "Recomiéndame libros de ciencia ficción",
    ])
  }
}

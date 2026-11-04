import Foundation
@testable import VinctusNative

final class FakeAIConsentRepo: AIConsentRepo {
  var state = AIConsentState.default
  var failsToLoad = false
  var failsToSave = false
  var savedSources: [AIConsentSource] = []

  func getConsent(uid: String) async throws -> AIConsentState {
    if failsToLoad { throw FakeError() }
    return state
  }

  func setConsent(uid: String, granted: Bool, source: AIConsentSource) async throws {
    if failsToSave { throw FakeError() }
    savedSources.append(source)
  }
}

import Foundation
@testable import VinctusNative

final class FakeAIConsentRepo: AIConsentRepo {
  var state = AIConsentState.default
  var stateByUID: [String: AIConsentState] = [:]
  var getHandler: ((String) async throws -> AIConsentState)?
  var failsToLoad = false
  var failsToSave = false
  var savedSources: [AIConsentSource] = []

  func getConsent(uid: String) async throws -> AIConsentState {
    if let getHandler { return try await getHandler(uid) }
    if failsToLoad { throw FakeError() }
    return stateByUID[uid] ?? state
  }

  func setConsent(uid: String, granted: Bool, source: AIConsentSource) async throws {
    if failsToSave { throw FakeError() }
    savedSources.append(source)
    stateByUID[uid] = AIConsentState(granted: granted, recorded: true, source: source, updatedAt: Date())
  }
}

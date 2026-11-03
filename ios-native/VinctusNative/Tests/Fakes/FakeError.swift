import Foundation

/// In-memory repos for view model tests live in this folder, one per repo: they record calls and
/// fail on request with this error.
struct FakeError: LocalizedError {
  var errorDescription: String? { "Falló la prueba" }
}

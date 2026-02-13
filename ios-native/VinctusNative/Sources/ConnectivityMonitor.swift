import Foundation
import Network

@MainActor
final class ConnectivityMonitor: ObservableObject {
  @Published private(set) var isOnline = true

  private let monitor = NWPathMonitor()
  private let queue = DispatchQueue(label: "app.vinctus.social.connectivity")

  init() {
    monitor.pathUpdateHandler = { [weak self] path in
      Task { @MainActor in
        self?.isOnline = path.status == .satisfied
      }
    }
    monitor.start(queue: queue)
  }

  deinit {
    monitor.cancel()
  }
}

import Foundation

final class VicallPictureInPictureEventStore {
  static let shared = VicallPictureInPictureEventStore()

  typealias Event = [String: Any]
  typealias Listener = (Event) -> Void

  private let lock = NSLock()
  private var pendingEvents: [Event] = []
  private var listener: Listener?

  private init() {}

  func attach(listener: @escaping Listener) {
    lock.lock()
    self.listener = listener
    lock.unlock()
  }

  func detach() {
    lock.lock()
    listener = nil
    lock.unlock()
  }

  func emit(type: String, active: Bool, error: String? = nil) {
    var event: Event = [
      "active": active,
      "eventId": UUID().uuidString.lowercased(),
      "timestamp": Int64(Date().timeIntervalSince1970 * 1_000),
      "type": type
    ]
    if let error {
      event["error"] = error
    }

    lock.lock()
    let currentListener = listener
    if currentListener == nil {
      pendingEvents.append(event)
    }
    lock.unlock()

    if let currentListener {
      DispatchQueue.main.async {
        currentListener(event)
      }
    }
  }

  func initialEvents() -> [Event] {
    lock.lock()
    defer { lock.unlock() }
    return pendingEvents
  }

  func clearInitialEvents() {
    lock.lock()
    pendingEvents.removeAll()
    lock.unlock()
  }
}

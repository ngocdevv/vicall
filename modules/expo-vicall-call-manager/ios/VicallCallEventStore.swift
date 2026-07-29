import Foundation

final class VicallCallEventStore {
  static let shared = VicallCallEventStore()

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

  func emit(type: String, fields: Event = [:]) {
    var event = fields
    event["eventId"] = UUID().uuidString.lowercased()
    event["type"] = type
    event["timestamp"] = Int64(Date().timeIntervalSince1970 * 1_000)

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

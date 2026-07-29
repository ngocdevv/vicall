import Foundation
import PushKit

final class VicallPushKitManager: NSObject {
  static let shared = VicallPushKitManager()
  private static let tokenKey = "ExpoVicallCallManager.voipPushToken"

  private var registry: PKPushRegistry?

  private override init() {
    super.init()
  }

  func start() {
    guard registry == nil else {
      return
    }

    let registry = PKPushRegistry(queue: .main)
    registry.delegate = self
    registry.desiredPushTypes = [.voIP]
    self.registry = registry
  }

  var currentToken: String? {
    UserDefaults.standard.string(forKey: Self.tokenKey)
  }

  private func store(token: String?) {
    UserDefaults.standard.set(token, forKey: Self.tokenKey)
  }
}

extension VicallPushKitManager: PKPushRegistryDelegate {
  func pushRegistry(
    _ registry: PKPushRegistry,
    didUpdate pushCredentials: PKPushCredentials,
    for type: PKPushType
  ) {
    guard type == .voIP else {
      return
    }

    let token = pushCredentials.token
      .map { String(format: "%02x", $0) }
      .joined()
    store(token: token)
    VicallCallEventStore.shared.emit(
      type: "voipTokenUpdated",
      fields: ["token": token]
    )
  }

  func pushRegistry(
    _ registry: PKPushRegistry,
    didInvalidatePushTokenFor type: PKPushType
  ) {
    guard type == .voIP else {
      return
    }

    store(token: nil)
    VicallCallEventStore.shared.emit(type: "voipTokenInvalidated")
  }

  func pushRegistry(
    _ registry: PKPushRegistry,
    didReceiveIncomingPushWith payload: PKPushPayload,
    for type: PKPushType,
    completion: @escaping () -> Void
  ) {
    guard type == .voIP else {
      completion()
      return
    }

    do {
      let dictionary = payload.dictionaryPayload.reduce(
        into: [String: Any]()
      ) { result, element in
        guard let key = element.key as? String else {
          return
        }
        result[key] = element.value
      }
      let descriptor = try VicallCallDescriptor.from(
        dictionary: dictionary,
        direction: .incoming
      )
      VicallCallKitManager.shared.reportIncomingCall(
        descriptor: descriptor
      ) { _ in
        completion()
      }
    } catch {
      VicallCallEventStore.shared.emit(
        type: "incomingCallFailed",
        fields: ["reason": error.localizedDescription]
      )
      completion()
    }
  }
}

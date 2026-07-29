import AVFoundation
import CallKit
import Foundation

final class VicallCallKitManager: NSObject {
  static let shared = VicallCallKitManager()

  private let provider: CXProvider
  private let callController = CXCallController()
  private let lock = NSLock()
  private var descriptors: [UUID: VicallCallDescriptor] = [:]

  private override init() {
    let settings = VicallProviderConfiguration.load()
    provider = CXProvider(configuration: settings.makeCallKitConfiguration())
    super.init()
    provider.setDelegate(self, queue: nil)
  }

  func reportIncomingCall(
    descriptor: VicallCallDescriptor,
    completion: ((Error?) -> Void)? = nil
  ) {
    remember(descriptor)

    let update = CXCallUpdate()
    update.remoteHandle = CXHandle(
      type: descriptor.handleType,
      value: descriptor.handle
    )
    update.localizedCallerName = descriptor.displayName
    update.hasVideo = descriptor.hasVideo
    update.supportsHolding = true
    update.supportsDTMF = false
    update.supportsGrouping = false
    update.supportsUngrouping = false

    provider.reportNewIncomingCall(with: descriptor.callId, update: update) {
      [weak self] error in
      if let error {
        self?.forget(descriptor.callId)
        VicallCallEventStore.shared.emit(
          type: "incomingCallFailed",
          fields: descriptor.eventFields.merging(
            ["reason": error.localizedDescription],
            uniquingKeysWith: { _, new in new }
          )
        )
      } else {
        VicallCallEventStore.shared.emit(
          type: "incomingCallDisplayed",
          fields: descriptor.eventFields
        )
      }
      completion?(error)
    }
  }

  func startCall(_ descriptor: VicallCallDescriptor) {
    remember(descriptor)
    let handle = CXHandle(
      type: descriptor.handleType,
      value: descriptor.handle
    )
    let action = CXStartCallAction(
      call: descriptor.callId,
      handle: handle
    )
    action.isVideo = descriptor.hasVideo
    action.contactIdentifier = descriptor.displayName
    request(CXTransaction(action: action), callId: descriptor.callId)
  }

  func answerCall(_ callId: UUID) {
    request(
      CXTransaction(action: CXAnswerCallAction(call: callId)),
      callId: callId
    )
  }

  func endCall(_ callId: UUID) {
    request(
      CXTransaction(action: CXEndCallAction(call: callId)),
      callId: callId
    )
  }

  func endAllCalls() {
    callController.callObserver.calls.forEach { call in
      endCall(call.uuid)
    }
  }

  func setMuted(_ callId: UUID, muted: Bool) {
    request(
      CXTransaction(
        action: CXSetMutedCallAction(call: callId, muted: muted)
      ),
      callId: callId
    )
  }

  func setHeld(_ callId: UUID, held: Bool) {
    request(
      CXTransaction(
        action: CXSetHeldCallAction(call: callId, onHold: held)
      ),
      callId: callId
    )
  }

  func reportOutgoingConnecting(_ callId: UUID) {
    provider.reportOutgoingCall(with: callId, startedConnectingAt: Date())
  }

  func reportOutgoingConnected(_ callId: UUID) {
    provider.reportOutgoingCall(with: callId, connectedAt: Date())
  }

  func markActive(_ callId: UUID) {
    guard descriptor(for: callId)?.direction == .outgoing else {
      return
    }
    reportOutgoingConnected(callId)
  }

  func reportEnded(_ callId: UUID, reason: VicallCallEndReason) {
    provider.reportCall(
      with: callId,
      endedAt: Date(),
      reason: reason.callKitReason
    )
    forget(callId)
  }

  func updateDisplay(
    callId: UUID,
    displayName: String,
    handle: String?,
    hasVideo: Bool?
  ) {
    guard var descriptor = descriptor(for: callId) else {
      return
    }

    descriptor = VicallCallDescriptor(
      callId: descriptor.callId,
      handle: handle ?? descriptor.handle,
      displayName: displayName,
      handleType: descriptor.handleType,
      hasVideo: hasVideo ?? descriptor.hasVideo,
      metadata: descriptor.metadata,
      direction: descriptor.direction
    )
    remember(descriptor)

    let update = CXCallUpdate()
    update.localizedCallerName = descriptor.displayName
    update.remoteHandle = CXHandle(
      type: descriptor.handleType,
      value: descriptor.handle
    )
    update.hasVideo = descriptor.hasVideo
    provider.reportCall(with: callId, updated: update)
  }

  func calls() -> [[String: Any]] {
    let observedCalls = callController.callObserver.calls
    return observedCalls.map { call in
      let descriptor = descriptor(for: call.uuid)
      return [
        "callId": call.uuid.uuidString.lowercased(),
        "direction": descriptor?.direction.rawValue ?? "incoming",
        "handle": descriptor?.handle ?? "",
        "displayName": descriptor?.displayName ?? "",
        "hasVideo": descriptor?.hasVideo ?? false,
        "state": call.hasEnded
          ? "ended"
          : call.isOnHold
            ? "held"
            : call.hasConnected
              ? "active"
              : "connecting"
      ]
    }
  }

  private func request(_ transaction: CXTransaction, callId: UUID) {
    callController.request(transaction) { error in
      guard let error else {
        return
      }
      VicallCallEventStore.shared.emit(
        type: "incomingCallFailed",
        fields: [
          "callId": callId.uuidString.lowercased(),
          "reason": error.localizedDescription
        ]
      )
    }
  }

  private func remember(_ descriptor: VicallCallDescriptor) {
    lock.lock()
    descriptors[descriptor.callId] = descriptor
    lock.unlock()
  }

  private func forget(_ callId: UUID) {
    lock.lock()
    descriptors.removeValue(forKey: callId)
    lock.unlock()
  }

  private func descriptor(for callId: UUID) -> VicallCallDescriptor? {
    lock.lock()
    defer { lock.unlock() }
    return descriptors[callId]
  }

  private func fields(for callId: UUID) -> [String: Any] {
    descriptor(for: callId)?.eventFields ?? [
      "callId": callId.uuidString.lowercased()
    ]
  }
}

extension VicallCallKitManager: CXProviderDelegate {
  func providerDidReset(_ provider: CXProvider) {
    lock.lock()
    descriptors.removeAll()
    lock.unlock()
    VicallCallEventStore.shared.emit(type: "providerReset")
  }

  func provider(
    _ provider: CXProvider,
    perform action: CXStartCallAction
  ) {
    let descriptor = descriptor(for: action.callUUID)
    let update = CXCallUpdate()
    update.remoteHandle = action.handle
    update.localizedCallerName = descriptor?.displayName
    update.hasVideo = action.isVideo
    provider.reportCall(with: action.callUUID, updated: update)
    action.fulfill()

    VicallCallEventStore.shared.emit(
      type: "start",
      fields: fields(for: action.callUUID)
    )
  }

  func provider(
    _ provider: CXProvider,
    perform action: CXAnswerCallAction
  ) {
    action.fulfill()
    VicallCallEventStore.shared.emit(
      type: "answer",
      fields: fields(for: action.callUUID)
    )
  }

  func provider(
    _ provider: CXProvider,
    perform action: CXEndCallAction
  ) {
    let eventFields = fields(for: action.callUUID)
    forget(action.callUUID)
    action.fulfill()
    VicallCallEventStore.shared.emit(type: "end", fields: eventFields)
  }

  func provider(
    _ provider: CXProvider,
    perform action: CXSetMutedCallAction
  ) {
    action.fulfill()
    VicallCallEventStore.shared.emit(
      type: "mute",
      fields: fields(for: action.callUUID).merging(
        ["muted": action.isMuted],
        uniquingKeysWith: { _, new in new }
      )
    )
  }

  func provider(
    _ provider: CXProvider,
    perform action: CXSetHeldCallAction
  ) {
    action.fulfill()
    VicallCallEventStore.shared.emit(
      type: "hold",
      fields: fields(for: action.callUUID).merging(
        ["held": action.isOnHold],
        uniquingKeysWith: { _, new in new }
      )
    )
  }

  func provider(
    _ provider: CXProvider,
    perform action: CXPlayDTMFCallAction
  ) {
    action.fulfill()
    VicallCallEventStore.shared.emit(
      type: "dtmf",
      fields: fields(for: action.callUUID).merging(
        ["digits": action.digits],
        uniquingKeysWith: { _, new in new }
      )
    )
  }

  func provider(
    _ provider: CXProvider,
    timedOutPerforming action: CXAction
  ) {
    let callId = (action as? CXCallAction)?.callUUID ?? action.uuid
    VicallCallEventStore.shared.emit(
      type: "incomingCallFailed",
      fields: [
        "callId": callId.uuidString.lowercased(),
        "reason": "CallKit action timed out"
      ]
    )
  }

  func provider(
    _ provider: CXProvider,
    didActivate audioSession: AVAudioSession
  ) {
    VicallCallEventStore.shared.emit(type: "audioSessionActivated")
  }

  func provider(
    _ provider: CXProvider,
    didDeactivate audioSession: AVAudioSession
  ) {
    VicallCallEventStore.shared.emit(type: "audioSessionDeactivated")
  }
}

import ExpoModulesCore
import Foundation

public final class ExpoVicallCallManagerModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ExpoVicallCallManager")

    Events("onCallEvent")

    OnStartObserving("onCallEvent") {
      VicallCallEventStore.shared.attach { [weak self] event in
        self?.sendEvent("onCallEvent", event)
      }
    }

    OnStopObserving("onCallEvent") {
      VicallCallEventStore.shared.detach()
    }

    OnDestroy {
      VicallCallEventStore.shared.detach()
    }

    AsyncFunction("setup") {
      _ = VicallCallKitManager.shared
      if VicallProviderConfiguration.load().enableVoipPush {
        VicallPushKitManager.shared.start()
      }
    }.runOnQueue(.main)

    AsyncFunction("displayIncomingCall") { (call: [String: Any]) in
      let descriptor = try VicallCallDescriptor.from(
        dictionary: call,
        direction: .incoming
      )
      VicallCallKitManager.shared.reportIncomingCall(descriptor: descriptor)
    }.runOnQueue(.main)

    AsyncFunction("startCall") { (call: [String: Any]) in
      let descriptor = try VicallCallDescriptor.from(
        dictionary: call,
        direction: .outgoing
      )
      VicallCallKitManager.shared.startCall(descriptor)
    }.runOnQueue(.main)

    AsyncFunction("answerCall") { (callId: String) in
      VicallCallKitManager.shared.answerCall(try parseUuid(callId))
    }.runOnQueue(.main)

    AsyncFunction("endCall") { (callId: String) in
      VicallCallKitManager.shared.endCall(try parseUuid(callId))
    }.runOnQueue(.main)

    AsyncFunction("endAllCalls") {
      VicallCallKitManager.shared.endAllCalls()
    }.runOnQueue(.main)

    AsyncFunction("setMuted") { (callId: String, muted: Bool) in
      VicallCallKitManager.shared.setMuted(try parseUuid(callId), muted: muted)
    }.runOnQueue(.main)

    AsyncFunction("setHeld") { (callId: String, held: Bool) in
      VicallCallKitManager.shared.setHeld(try parseUuid(callId), held: held)
    }.runOnQueue(.main)

    AsyncFunction("setCallActive") { (callId: String) in
      VicallCallKitManager.shared.markActive(try parseUuid(callId))
    }.runOnQueue(.main)

    AsyncFunction("reportOutgoingCallConnecting") { (callId: String) in
      VicallCallKitManager.shared.reportOutgoingConnecting(
        try parseUuid(callId)
      )
    }.runOnQueue(.main)

    AsyncFunction("reportOutgoingCallConnected") { (callId: String) in
      VicallCallKitManager.shared.reportOutgoingConnected(try parseUuid(callId))
    }.runOnQueue(.main)

    AsyncFunction("reportCallEnded") {
      (callId: String, reason: String) in
      let nativeReason = VicallCallEndReason(rawValue: reason) ?? .failed
      VicallCallKitManager.shared.reportEnded(
        try parseUuid(callId),
        reason: nativeReason
      )
    }.runOnQueue(.main)

    AsyncFunction("updateCallDisplay") {
      (
        callId: String,
        displayName: String,
        handle: String?,
        hasVideo: Bool?
      ) in
      VicallCallKitManager.shared.updateDisplay(
        callId: try parseUuid(callId),
        displayName: displayName,
        handle: handle,
        hasVideo: hasVideo
      )
    }.runOnQueue(.main)

    AsyncFunction("getCalls") {
      VicallCallKitManager.shared.calls()
    }.runOnQueue(.main)

    AsyncFunction("getInitialEvents") {
      VicallCallEventStore.shared.initialEvents()
    }

    AsyncFunction("clearInitialEvents") {
      VicallCallEventStore.shared.clearInitialEvents()
    }

    AsyncFunction("getVoipPushToken") {
      VicallPushKitManager.shared.currentToken
    }

    AsyncFunction("canUseFullScreenIntent") {
      true
    }

    AsyncFunction("openFullScreenIntentSettings") {
      // iOS does not expose an equivalent setting.
    }
  }
}

private func parseUuid(_ value: String) throws -> UUID {
  guard let uuid = UUID(uuidString: value) else {
    throw VicallCallManagerError.invalidCallId
  }
  return uuid
}

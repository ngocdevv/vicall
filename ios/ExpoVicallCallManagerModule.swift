import AVKit
import ExpoModulesCore
import Foundation
import UIKit

public final class ExpoVicallCallManagerModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ExpoVicallCallManager")

    Events("onCallEvent", "onPictureInPictureEvent")

    OnStartObserving("onCallEvent") {
      VicallCallEventStore.shared.attach { [weak self] event in
        self?.sendEvent("onCallEvent", event)
      }
    }

    OnStartObserving("onPictureInPictureEvent") {
      VicallPictureInPictureEventStore.shared.attach { [weak self] event in
        self?.sendEvent("onPictureInPictureEvent", event)
      }
    }

    OnStopObserving("onCallEvent") {
      VicallCallEventStore.shared.detach()
    }

    OnStopObserving("onPictureInPictureEvent") {
      VicallPictureInPictureEventStore.shared.detach()
    }

    OnDestroy {
      VicallCallEventStore.shared.detach()
      VicallPictureInPictureEventStore.shared.detach()
      DispatchQueue.main.async {
        VicallPictureInPictureManager.shared.dispose()
      }
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

    AsyncFunction("isPictureInPictureSupported") {
      AVPictureInPictureController.isPictureInPictureSupported()
    }

    AsyncFunction("isPictureInPictureActive") {
      VicallPictureInPictureManager.shared.isActive
    }.runOnQueue(.main)

    AsyncFunction("preparePictureInPicture") {
      (
        videoViewTag: Int,
        localVideoViewTag: Int?,
        options: [String: Any]?
      ) in
      guard let sourceView = appContext?.findView(
        withTag: videoViewTag,
        ofType: UIView.self
      ) else {
        throw VicallPictureInPictureError.sourceViewNotFound
      }
      let localVideoView = localVideoViewTag.flatMap { tag in
        appContext?.findView(withTag: tag, ofType: UIView.self)
      }
      try VicallPictureInPictureManager.shared.prepare(
        sourceView: sourceView,
        localVideoView: localVideoView,
        options: options
      )
    }.runOnQueue(.main)

    AsyncFunction("setPictureInPictureAutoEnterEnabled") { (enabled: Bool) in
      try VicallPictureInPictureManager.shared.setAutoEnterEnabled(enabled)
    }.runOnQueue(.main)

    AsyncFunction("startPictureInPicture") {
      try VicallPictureInPictureManager.shared.start()
    }.runOnQueue(.main)

    AsyncFunction("stopPictureInPicture") {
      VicallPictureInPictureManager.shared.stop()
    }.runOnQueue(.main)

    AsyncFunction("updatePictureInPictureState") { (state: [String: Any]) in
      VicallPictureInPictureManager.shared.updateVisualState(state)
    }.runOnQueue(.main)

    AsyncFunction("completePictureInPictureRestore") { (restored: Bool) in
      VicallPictureInPictureManager.shared.completeRestore(restored)
    }.runOnQueue(.main)

    AsyncFunction("disposePictureInPicture") {
      VicallPictureInPictureManager.shared.dispose()
    }.runOnQueue(.main)

    AsyncFunction("getInitialPictureInPictureEvents") {
      VicallPictureInPictureEventStore.shared.initialEvents()
    }

    AsyncFunction("clearInitialPictureInPictureEvents") {
      VicallPictureInPictureEventStore.shared.clearInitialEvents()
    }
  }
}

private func parseUuid(_ value: String) throws -> UUID {
  guard let uuid = UUID(uuidString: value) else {
    throw VicallCallManagerError.invalidCallId
  }
  return uuid
}

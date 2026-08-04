import type {
  CallEndReason,
  IncomingCall,
  OutgoingCall,
} from "../ExpoVicallCallManager.types";
import CallManager from "../ExpoVicallCallManagerModule";
import {
  createCallEventRouter as createCallEventRouterCore,
  type CreateCallEventRouterOptions,
} from "./call-event-router";

/**
 * Imperative helpers for app/service code that needs to drive native call UI
 * without re-learning platform differences.
 */
export const NativeCallController = {
  setup: () => CallManager.setup(),
  displayIncomingCall: (call: IncomingCall) =>
    CallManager.displayIncomingCall(call),
  startCall: (call: OutgoingCall) => CallManager.startCall(call),
  answerCall: (callId: string) => CallManager.answerCall(callId),
  endCall: (callId: string) => CallManager.endCall(callId),
  endAllCalls: () => CallManager.endAllCalls(),
  setMuted: (callId: string, muted: boolean) =>
    CallManager.setMuted(callId, muted),
  setHeld: (callId: string, held: boolean) => CallManager.setHeld(callId, held),
  setCallActive: (callId: string) => CallManager.setCallActive(callId),
  reportOutgoingCallConnecting: (callId: string) =>
    CallManager.reportOutgoingCallConnecting(callId),
  reportOutgoingCallConnected: (callId: string) =>
    CallManager.reportOutgoingCallConnected(callId),
  reportCallEnded: (callId: string, reason: CallEndReason) =>
    CallManager.reportCallEnded(callId, reason),
  updateCallDisplay: (
    callId: string,
    displayName: string,
    handle: string | null = null,
    hasVideo: boolean | null = null,
  ) => CallManager.updateCallDisplay(callId, displayName, handle, hasVideo),
  getCalls: () => CallManager.getCalls(),
  getVoipPushToken: () => CallManager.getVoipPushToken(),
  canUseFullScreenIntent: () => CallManager.canUseFullScreenIntent(),
  openFullScreenIntentSettings: () =>
    CallManager.openFullScreenIntentSettings(),
} as const;

/**
 * RN-host convenience wrapper around {@link createCallEventRouter} that defaults
 * `setCallActive` to the native module.
 */
export function createNativeCallEventRouter(
  options: Omit<CreateCallEventRouterOptions, "setCallActive"> & {
    setCallActive?: CreateCallEventRouterOptions["setCallActive"];
  },
) {
  return createCallEventRouterCore({
    ...options,
    setCallActive:
      options.setCallActive ??
      ((callId) => NativeCallController.setCallActive(callId)),
  });
}

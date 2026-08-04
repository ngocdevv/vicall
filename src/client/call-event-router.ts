import type { CallEvent } from "../ExpoVicallCallManager.types";

/**
 * Media-layer actions the React Native host must perform when native events arrive.
 * Wire these to RealtimeKit / your SFU SDK. This module never transports media.
 */
export interface MediaCallActions {
  /** Accept an answered call: validate with backend, mint token, join media room. */
  accept(callId: string, event: CallEvent): void | Promise<void>;
  /** Leave media and notify backend that the call ended. */
  end(callId: string, event: CallEvent): void | Promise<void>;
  /** Apply mute to the local media track. */
  setMicrophoneEnabled?(
    enabled: boolean,
    event: CallEvent,
  ): void | Promise<void>;
  /** Apply hold / resume to media senders. */
  setHeld?(held: boolean, event: CallEvent): void | Promise<void>;
  /** Optional: react to iOS audio session activation before capturing/playing audio. */
  onAudioSessionActivated?(event: CallEvent): void | Promise<void>;
  /** Optional: release or pause audio when CallKit deactivates the session. */
  onAudioSessionDeactivated?(event: CallEvent): void | Promise<void>;
  /** Optional: handle DTMF digits from the system UI. */
  onDtmf?(digits: string, event: CallEvent): void | Promise<void>;
  /** Optional: persist rotated iOS VoIP tokens on the backend. */
  onVoipTokenUpdated?(token: string, event: CallEvent): void | Promise<void>;
  /** Optional: mark the backend VoIP token as invalid. */
  onVoipTokenInvalidated?(event: CallEvent): void | Promise<void>;
  /** Optional: surface native failures to app telemetry. */
  onIncomingCallFailed?(event: CallEvent): void | Promise<void>;
}

export interface CreateCallEventRouterOptions {
  media: MediaCallActions;
  /**
   * When true (default), `setCallActive` is invoked after a successful media.accept.
   * Required on Android so Telecom / foreground service move to the ongoing state.
   */
  markActiveAfterAccept?: boolean;
  /**
   * Marks the native call active after media accept.
   * Host apps normally pass `CallManager.setCallActive` / `NativeCallController.setCallActive`.
   */
  setCallActive?: (callId: string) => void | Promise<void>;
}

/**
 * Routes native `CallEvent`s into media-layer callbacks with a stable contract
 * for any React Native host service.
 *
 * This helper is framework-agnostic and safe to unit test without loading Expo native modules.
 */
export function createCallEventRouter(options: CreateCallEventRouterOptions) {
  const { media, markActiveAfterAccept = true, setCallActive } = options;

  return async function handleCallEvent(event: CallEvent): Promise<void> {
    switch (event.type) {
      case "answer": {
        if (event.callId == null) return;
        await media.accept(event.callId, event);
        if (markActiveAfterAccept) {
          if (setCallActive == null) {
            throw new Error(
              "createCallEventRouter requires setCallActive when markActiveAfterAccept is true",
            );
          }
          await setCallActive(event.callId);
        }
        return;
      }
      case "end": {
        if (event.callId == null) return;
        await media.end(event.callId, event);
        return;
      }
      case "mute": {
        if (event.muted == null) return;
        await media.setMicrophoneEnabled?.(!event.muted, event);
        return;
      }
      case "hold": {
        if (event.held == null) return;
        await media.setHeld?.(event.held, event);
        return;
      }
      case "dtmf": {
        if (event.digits == null) return;
        await media.onDtmf?.(event.digits, event);
        return;
      }
      case "audioSessionActivated":
        await media.onAudioSessionActivated?.(event);
        return;
      case "audioSessionDeactivated":
        await media.onAudioSessionDeactivated?.(event);
        return;
      case "voipTokenUpdated":
        if (event.token == null) return;
        await media.onVoipTokenUpdated?.(event.token, event);
        return;
      case "voipTokenInvalidated":
        await media.onVoipTokenInvalidated?.(event);
        break;
      case "incomingCallFailed":
        await media.onIncomingCallFailed?.(event);
        break;
      default:
        break;
    }
  };
}

import { requireNativeModule } from "expo";

import type {
  CallEndReason,
  CallEvent,
  ExpoVicallCallManagerEvents,
  IncomingCall,
  NativeCall,
  OutgoingCall,
  PictureInPictureEvent,
  PictureInPictureOptions,
  PictureInPictureVisualState,
} from "./ExpoVicallCallManager.types";

type ExpoVicallCallManagerModule = {
  setup(): Promise<void>;
  displayIncomingCall(call: IncomingCall): Promise<void>;
  startCall(call: OutgoingCall): Promise<void>;
  answerCall(callId: string): Promise<void>;
  endCall(callId: string): Promise<void>;
  endAllCalls(): Promise<void>;
  setMuted(callId: string, muted: boolean): Promise<void>;
  setHeld(callId: string, held: boolean): Promise<void>;
  setCallActive(callId: string): Promise<void>;
  reportOutgoingCallConnecting(callId: string): Promise<void>;
  reportOutgoingCallConnected(callId: string): Promise<void>;
  reportCallEnded(callId: string, reason: CallEndReason): Promise<void>;
  updateCallDisplay(
    callId: string,
    displayName: string,
    handle: string | null,
    hasVideo: boolean | null,
  ): Promise<void>;
  getCalls(): Promise<NativeCall[]>;
  getInitialEvents(): Promise<CallEvent[]>;
  clearInitialEvents(): Promise<void>;
  getVoipPushToken(): Promise<string | null>;
  canUseFullScreenIntent(): Promise<boolean>;
  openFullScreenIntentSettings(): Promise<void>;
  isPictureInPictureSupported(): Promise<boolean>;
  isPictureInPictureActive(): Promise<boolean>;
  preparePictureInPicture(
    videoViewTag: number,
    localVideoViewTag: number | null,
    options?: PictureInPictureOptions,
  ): Promise<void>;
  refreshPictureInPictureVideoTracks(
    videoViewTag: number,
    localVideoViewTag: number | null,
  ): Promise<void>;
  setPictureInPictureAutoEnterEnabled(enabled: boolean): Promise<void>;
  startPictureInPicture(): Promise<void>;
  stopPictureInPicture(): Promise<void>;
  updatePictureInPictureState(
    state: PictureInPictureVisualState,
  ): Promise<void>;
  completePictureInPictureRestore(restored: boolean): Promise<void>;
  disposePictureInPicture(): Promise<void>;
  getInitialPictureInPictureEvents(): Promise<PictureInPictureEvent[]>;
  clearInitialPictureInPictureEvents(): Promise<void>;
  addListener<EventName extends keyof ExpoVicallCallManagerEvents>(
    eventName: EventName,
    listener: ExpoVicallCallManagerEvents[EventName],
  ): { remove(): void };
};

let cachedModule: ExpoVicallCallManagerModule | undefined;

/**
 * Lazily resolve the native module so importing pure JS helpers
 * (protocol / lifecycle) does not crash before the Expo runtime is ready.
 * Still throws a clear error when native APIs are actually invoked without
 * a development build that autolinks ExpoVicallCallManager.
 */
function getNativeModule(): ExpoVicallCallManagerModule {
  if (cachedModule) return cachedModule;
  try {
    cachedModule = requireNativeModule<ExpoVicallCallManagerModule>(
      "ExpoVicallCallManager",
    );
    return cachedModule;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error);
    throw new Error(
      [
        "Native module ExpoVicallCallManager is unavailable.",
        "Ensure expo-vicall-call-manager is autolinked (not nested under another package's node_modules)",
        "and rebuild the dev client after prebuild/pod install.",
        `Underlying error: ${message}`,
      ].join(" "),
    );
  }
}

const CallManager = new Proxy({} as ExpoVicallCallManagerModule, {
  get(_target, property, receiver) {
    const mod = getNativeModule();
    const value = Reflect.get(mod as object, property, receiver);
    return typeof value === "function" ? value.bind(mod) : value;
  },
});

export default CallManager;

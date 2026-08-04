export type CallDirection = "incoming" | "outgoing";

export type CallHandleType = "generic" | "phoneNumber" | "email";

/**
 * Reasons a remote/server-side termination should report to the system UI.
 * Prefer these over a bare local `endCall` when the peer/backend ended the call.
 */
export type CallEndReason =
  | "failed"
  | "remoteEnded"
  | "unanswered"
  | "answeredElsewhere"
  | "declinedElsewhere"
  | "missed";

/**
 * Native → JS call lifecycle events emitted by CallKit / Android Telecom / Push.
 * See `CALL_EVENT_OWNERSHIP` in the protocol package for directionality.
 */
export type CallEventType =
  | "answer"
  | "end"
  | "start"
  | "mute"
  | "hold"
  | "dtmf"
  | "audioSessionActivated"
  | "audioSessionDeactivated"
  | "audioRouteChanged"
  | "incomingCallDisplayed"
  | "incomingCallFailed"
  | "providerReset"
  | "showIncomingCallUi"
  | "voipTokenUpdated"
  | "voipTokenInvalidated";

export type PictureInPictureEventType =
  | "willStart"
  | "didStart"
  | "failedToStart"
  | "willStop"
  | "didStop"
  | "restoreRequested"
  | "stateChanged";

/** Opaque service metadata echoed on native events. Keep JSON-safe. */
export type CallMetadata = Record<string, string | number | boolean | null>;

/**
 * Payload used by `displayIncomingCall` and verified push → native UI paths.
 * `callId` must be a shared RFC 4122 UUID across backend, native UI, and media.
 */
export interface IncomingCall {
  /**
   * Stable RFC 4122 UUID. The same identifier must be used by Worker,
   * Supabase, PushKit/FCM, and RealtimeKit orchestration.
   */
  callId: string;
  handle: string;
  displayName: string;
  handleType?: CallHandleType;
  hasVideo?: boolean;
  metadata?: CallMetadata;
}

export interface OutgoingCall extends IncomingCall {}

/** Snapshot of a call known to the native process. */
export interface NativeCall {
  callId: string;
  direction: CallDirection;
  handle: string;
  displayName: string;
  hasVideo: boolean;
  state: string;
}

/**
 * Event delivered to JS via `onCallEvent` or `getInitialEvents()`.
 * Cold-start events are buffered natively until the host clears them.
 */
export interface CallEvent {
  eventId: string;
  type: CallEventType;
  timestamp: number;
  callId?: string;
  direction?: CallDirection;
  handle?: string;
  displayName?: string;
  hasVideo?: boolean;
  muted?: boolean;
  held?: boolean;
  digits?: string;
  output?: string;
  reason?: string;
  token?: string;
  metadata?: CallMetadata;
}

export interface PictureInPictureSourceRect {
  height: number;
  width: number;
  x: number;
  y: number;
}

export interface PictureInPictureOptions {
  /** Preferred PiP aspect ratio. Defaults to 9:16. */
  aspectRatioHeight?: number;
  aspectRatioWidth?: number;
  /** Automatically enter PiP when the user sends the app to the background. */
  autoEnterEnabled?: boolean;
  /** Android 12+: use seamless resizing for video content. */
  seamlessResizeEnabled?: boolean;
  /** Optional Android screen-space transition source rectangle. */
  sourceRect?: PictureInPictureSourceRect;
  /** @internal Native tag of the Hybrid presentation surface on Android. */
  androidPresentationViewTag?: number;
}

export interface PictureInPictureEvent {
  eventId: string;
  type: PictureInPictureEventType;
  timestamp: number;
  active: boolean;
  error?: string;
}

export interface PictureInPictureVisualState {
  displayName?: string;
  localMuted?: boolean;
  remoteMuted?: boolean;
  remoteCameraEnabled?: boolean;
}

export interface ExpoVicallCallManagerEvents {
  [event: string]: (...args: any[]) => void;
  onCallEvent(event: CallEvent): void;
  onPictureInPictureEvent(event: PictureInPictureEvent): void;
}

/** Options accepted by the Expo config plugin in `app.config`. */
export interface VicallCallManagerPluginOptions {
  appName?: string;
  supportsVideo?: boolean;
  enablePictureInPicture?: boolean;
  includesCallsInRecents?: boolean;
  maximumCallGroups?: number;
  maximumCallsPerCallGroup?: number;
  ringtoneSound?: string;
  enableVoipPush?: boolean;
  androidNotificationChannelId?: string;
  androidNotificationChannelName?: string;
  /**
   * Android resource name without @drawable/ or @mipmap/.
   */
  androidNotificationIcon?: string;
}

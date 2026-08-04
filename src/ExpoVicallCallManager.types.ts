export type CallDirection = "incoming" | "outgoing";

export type CallHandleType = "generic" | "phoneNumber" | "email";

export type CallEndReason =
  | "failed"
  | "remoteEnded"
  | "unanswered"
  | "answeredElsewhere"
  | "declinedElsewhere"
  | "missed";

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

export type CallMetadata = Record<string, string | number | boolean | null>;

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

export interface NativeCall {
  callId: string;
  direction: CallDirection;
  handle: string;
  displayName: string;
  hasVideo: boolean;
  state: string;
}

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

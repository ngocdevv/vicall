import type { ReactNode } from "react";
import type { PictureInPictureOptions } from "../ExpoVicallCallManager.types";
export type CallPresentationMode = "idle" | "fullscreen" | "minimizing" | "inAppMini" | "systemPip" | "restoring";
export type CallConnectionState = "ringing" | "connecting" | "connected" | "reconnecting";
export type CallControlName = "camera" | "microphone" | "switchCamera" | "more" | "addParticipant" | "end";
export interface HybridPictureInPictureSource {
    /** Resolve the mounted native remote RTCView tag at call time. */
    getRemoteViewTag(): number | null;
    /** Resolve the mounted local RTCView tag when iOS should keep capturing. */
    getLocalViewTag?(): number | null;
    /** Increment when the underlying remote WebRTC track is replaced. */
    revision?: string | number;
    options?: PictureInPictureOptions;
}
export interface HybridCallSession {
    callId: string;
    displayName: string;
    connectionState: CallConnectionState;
    statusText?: string;
    /** Keep these elements stable while the call is active to avoid remounting RTCView. */
    remoteVideo?: ReactNode;
    localVideo?: ReactNode;
    avatar?: ReactNode;
    localMuted?: boolean;
    remoteMuted?: boolean;
    localCameraEnabled?: boolean;
    remoteCameraEnabled?: boolean;
    canMinimize?: boolean;
    pictureInPicture?: HybridPictureInPictureSource;
    renderAccessoryControls?: () => ReactNode;
    renderControlIcon?: (control: CallControlName, active: boolean) => ReactNode;
    onToggleMicrophone?(): void | Promise<void>;
    onToggleCamera?(): void | Promise<void>;
    onSwitchCamera?(): void | Promise<void>;
    onMore?(): void | Promise<void>;
    onAddParticipant?(): void | Promise<void>;
    onEndCall(): void | Promise<void>;
}
export interface CallPresentationTheme {
    backgroundColor: string;
    chromeColor: string;
    chromeMutedColor: string;
    controlColor: string;
    controlActiveColor: string;
    controlActiveContentColor: string;
    destructiveColor: string;
    contentColor: string;
    mutedContentColor: string;
    miniBorderColor: string;
    miniShadow: string;
}
export interface CallPresentationProviderProps {
    children: ReactNode;
    session: HybridCallSession | null;
    theme?: Partial<CallPresentationTheme>;
    /** Called after any recoverable PiP or presentation failure. */
    onError?: (error: Error) => void;
    onModeChange?: (mode: CallPresentationMode) => void;
}
export interface CallOverlayHostProps {
    /** Landscape mini-player width. Defaults to 176. */
    miniWidth?: number;
    /** Landscape mini-player height. Defaults to 112. */
    miniHeight?: number;
    /** Distance between a snapped mini-player and a safe-area edge. */
    edgeInset?: number;
    /** Milliseconds before fullscreen controls hide. Set 0 to disable. */
    controlsAutoHideDelay?: number;
}
export interface CallPresentationContextValue {
    mode: CallPresentationMode;
    session: HybridCallSession | null;
    theme: CallPresentationTheme;
    minimize(): Promise<void>;
    restore(): Promise<void>;
    endCall(): Promise<void>;
    /** @internal Registered by CallOverlayHost for a synchronous Android PiP handoff. */
    setAndroidPresentationViewTag(tag: number | null): void;
}
//# sourceMappingURL=call-presentation.types.d.ts.map
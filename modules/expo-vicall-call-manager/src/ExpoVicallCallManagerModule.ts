import { NativeModule, requireNativeModule } from "expo";

import type {
  CallEndReason,
  CallEvent,
  ExpoVicallCallManagerEvents,
  IncomingCall,
  NativeCall,
  OutgoingCall,
} from "./ExpoVicallCallManager.types";

declare class ExpoVicallCallManagerModule extends NativeModule<ExpoVicallCallManagerEvents> {
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
}

export default requireNativeModule<ExpoVicallCallManagerModule>(
  "ExpoVicallCallManager",
);

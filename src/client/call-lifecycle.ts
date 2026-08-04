import type {
  CallDirection,
  CallEndReason,
  CallEvent,
  CallMetadata,
} from "../ExpoVicallCallManager.types";

/**
 * High-level call phase for host apps that own their own in-call UI
 * (X / social-network style: system UI for ring/lock screen, app UI for the
 * ongoing call canvas).
 */
export type CallLifecyclePhase =
  | "idle"
  | "ringing"
  | "dialing"
  | "connecting"
  | "active"
  | "held"
  | "ended";

/**
 * Synthetic lifecycle inputs that are not native CallEvents.
 * Hosts emit `callBecameActive` after media is joined and `setCallActive` succeeds.
 */
export type CallLifecycleInput =
  | CallEvent
  | {
      type: "callBecameActive";
      callId: string;
    }
  | {
      type: "reset";
    };

export interface CallLifecycleState {
  phase: CallLifecyclePhase;
  activeCallId: string | null;
  direction: CallDirection | null;
  displayName: string | null;
  handle: string | null;
  hasVideo: boolean;
  muted: boolean;
  held: boolean;
  metadata: CallMetadata;
  endReason: CallEndReason | string | null;
  /**
   * When true, the host app should mount its own audio/video call screen.
   * System incoming UI is owned by CallKit / Telecom, not by this flag.
   */
  shouldPresentAppCallUi: boolean;
  lastEventType: string | null;
  lastEventAt: number | null;
}

export function createInitialCallLifecycleState(): CallLifecycleState {
  return {
    phase: "idle",
    activeCallId: null,
    direction: null,
    displayName: null,
    handle: null,
    hasVideo: false,
    muted: false,
    held: false,
    metadata: {},
    endReason: null,
    shouldPresentAppCallUi: false,
    lastEventType: null,
    lastEventAt: null,
  };
}

function withEventMeta(
  state: CallLifecycleState,
  input: CallLifecycleInput,
): CallLifecycleState {
  if (input.type === "reset" || input.type === "callBecameActive") {
    return {
      ...state,
      lastEventType: input.type,
      lastEventAt: Date.now(),
    };
  }
  return {
    ...state,
    lastEventType: input.type,
    lastEventAt: input.timestamp,
  };
}

function identityFromEvent(
  state: CallLifecycleState,
  event: CallEvent,
): Partial<CallLifecycleState> {
  return {
    activeCallId: event.callId ?? state.activeCallId,
    direction: event.direction ?? state.direction,
    displayName: event.displayName ?? state.displayName,
    handle: event.handle ?? state.handle,
    hasVideo: event.hasVideo ?? state.hasVideo,
    metadata: event.metadata ?? state.metadata,
  };
}

/**
 * Pure reducer that turns system call events into UI-driving lifecycle state.
 * The module never renders screens; hosts use this to open/close their own UI.
 */
export function reduceCallLifecycle(
  state: CallLifecycleState,
  input: CallLifecycleInput,
): CallLifecycleState {
  if (input.type === "reset") {
    return createInitialCallLifecycleState();
  }

  if (input.type === "callBecameActive") {
    if (
      state.activeCallId != null &&
      input.callId !== state.activeCallId
    ) {
      return withEventMeta(state, input);
    }
    return withEventMeta(
      {
        ...state,
        phase: state.held ? "held" : "active",
        activeCallId: input.callId,
        shouldPresentAppCallUi: true,
      },
      input,
    );
  }

  const event = input;
  const base = {
    ...state,
    ...identityFromEvent(state, event),
  };

  switch (event.type) {
    case "incomingCallDisplayed":
    case "showIncomingCallUi":
      return withEventMeta(
        {
          ...base,
          phase: "ringing",
          direction: event.direction ?? "incoming",
          // System UI is showing; app in-call canvas stays hidden until answer.
          shouldPresentAppCallUi: false,
          endReason: null,
        },
        event,
      );

    case "start":
      return withEventMeta(
        {
          ...base,
          phase: "dialing",
          direction: event.direction ?? "outgoing",
          shouldPresentAppCallUi: true,
          endReason: null,
        },
        event,
      );

    case "answer":
      return withEventMeta(
        {
          ...base,
          phase: "connecting",
          shouldPresentAppCallUi: true,
          endReason: null,
        },
        event,
      );

    case "mute":
      return withEventMeta(
        {
          ...base,
          muted: event.muted ?? state.muted,
        },
        event,
      );

    case "hold": {
      const held = event.held ?? state.held;
      return withEventMeta(
        {
          ...base,
          held,
          phase: held
            ? "held"
            : state.phase === "held"
              ? "active"
              : state.phase,
        },
        event,
      );
    }

    case "end":
      return withEventMeta(
        {
          ...createInitialCallLifecycleState(),
          phase: "ended",
          activeCallId: event.callId ?? state.activeCallId,
          direction: event.direction ?? state.direction,
          displayName: event.displayName ?? state.displayName,
          handle: event.handle ?? state.handle,
          hasVideo: event.hasVideo ?? state.hasVideo,
          metadata: event.metadata ?? state.metadata,
          endReason: event.reason ?? "remoteEnded",
          shouldPresentAppCallUi: false,
        },
        event,
      );

    case "providerReset":
      return withEventMeta(
        {
          ...createInitialCallLifecycleState(),
          phase: "ended",
          endReason: "failed",
          shouldPresentAppCallUi: false,
        },
        event,
      );

    case "incomingCallFailed":
      if (state.phase === "idle" || state.phase === "ended") {
        return withEventMeta(state, event);
      }
      return withEventMeta(
        {
          ...createInitialCallLifecycleState(),
          phase: "ended",
          activeCallId: event.callId ?? state.activeCallId,
          endReason: event.reason ?? "failed",
          shouldPresentAppCallUi: false,
        },
        event,
      );

    default:
      return withEventMeta(base, event);
  }
}

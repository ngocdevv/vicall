import type { CallEvent } from "../ExpoVicallCallManager.types";
import {
  createInitialCallLifecycleState,
  reduceCallLifecycle,
  type CallLifecycleState,
} from "./call-lifecycle";
import {
  createCallEventRouter,
  type CreateCallEventRouterOptions,
  type MediaCallActions,
} from "./call-event-router";

/**
 * Host-owned UI hooks. This module never mounts screens — the integrating app
 * renders audio/video call chrome the way X/social clients do.
 */
export interface HostCallUiActions {
  /**
   * Open the app's in-call screen (remote/local video, controls, etc.).
   * Fired on outgoing `start` and on `answer`.
   */
  presentInCallUi?(
    callId: string,
    event: CallEvent,
    state: CallLifecycleState,
  ): void | Promise<void>;
  /** Close the app's in-call screen after end / failure / reset. */
  dismissInCallUi?(
    callId: string | null,
    event: CallEvent,
    state: CallLifecycleState,
  ): void | Promise<void>;
  /** Optional: observe every lifecycle snapshot for custom stores/navigation. */
  onLifecycleChange?(
    state: CallLifecycleState,
    event: CallEvent,
  ): void | Promise<void>;
}

export interface CreateSocialCallSessionOptions {
  media: MediaCallActions;
  ui?: HostCallUiActions;
  markActiveAfterAccept?: boolean;
  setCallActive?: CreateCallEventRouterOptions["setCallActive"];
  /**
   * When true (default), move lifecycle to `active` after accept + setCallActive.
   */
  trackActivePhase?: boolean;
}

export interface SocialCallSession {
  /** Handle a native CallEvent (from initializeNativeCalls). */
  handleEvent(event: CallEvent): Promise<void>;
  /** Current pure lifecycle snapshot for rendering host UI. */
  getState(): CallLifecycleState;
  /** Force idle after the host fully tears down media + navigation. */
  reset(): void;
}

/**
 * X-style session bridge:
 * - native module owns system ring / lock-screen / Telecom / CallKit
 * - host app owns in-call UI + media SDK
 */
export function createSocialCallSession(
  options: CreateSocialCallSessionOptions,
): SocialCallSession {
  let state = createInitialCallLifecycleState();
  const trackActivePhase = options.trackActivePhase !== false;
  const ui = options.ui ?? {};

  const route = createCallEventRouter({
    media: options.media,
    markActiveAfterAccept: options.markActiveAfterAccept,
    setCallActive: options.setCallActive,
  });

  return {
    getState() {
      return state;
    },
    reset() {
      state = createInitialCallLifecycleState();
    },
    async handleEvent(event: CallEvent) {
      const previous = state;
      state = reduceCallLifecycle(state, event);
      await ui.onLifecycleChange?.(state, event);

      // Present host UI as soon as the system hands control to the app.
      if (
        !previous.shouldPresentAppCallUi &&
        state.shouldPresentAppCallUi &&
        state.activeCallId != null
      ) {
        await ui.presentInCallUi?.(state.activeCallId, event, state);
      }

      await route(event);

      if (
        trackActivePhase &&
        event.type === "answer" &&
        event.callId != null &&
        state.phase === "connecting"
      ) {
        state = reduceCallLifecycle(state, {
          type: "callBecameActive",
          callId: event.callId,
        });
        await ui.onLifecycleChange?.(state, event);
      }

      if (previous.shouldPresentAppCallUi && !state.shouldPresentAppCallUi) {
        await ui.dismissInCallUi?.(previous.activeCallId, event, state);
      }
    },
  };
}

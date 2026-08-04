import assert from "node:assert/strict";
import test from "node:test";

import {
  createInitialCallLifecycleState,
  reduceCallLifecycle,
  type CallLifecycleState,
} from "../src/client/call-lifecycle";
import type { CallEvent } from "../src/ExpoVicallCallManager.types";

function event(
  partial: Partial<CallEvent> & Pick<CallEvent, "type">,
): CallEvent {
  return {
    eventId: "evt",
    timestamp: 1,
    ...partial,
  };
}

test("incoming system UI moves lifecycle to ringing before answer", () => {
  let state = createInitialCallLifecycleState();
  state = reduceCallLifecycle(
    state,
    event({
      type: "incomingCallDisplayed",
      callId: "c8cc3ab6-3e1d-4f2b-aa49-f93ee9c75ff3",
      displayName: "Ngoc",
      hasVideo: true,
      direction: "incoming",
    }),
  );

  assert.equal(state.phase, "ringing");
  assert.equal(state.activeCallId, "c8cc3ab6-3e1d-4f2b-aa49-f93ee9c75ff3");
  assert.equal(state.hasVideo, true);
  assert.equal(state.shouldPresentAppCallUi, false);
});

test("answer asks the host app to present its own in-call UI", () => {
  let state = createInitialCallLifecycleState();
  state = reduceCallLifecycle(
    state,
    event({
      type: "incomingCallDisplayed",
      callId: "c8cc3ab6-3e1d-4f2b-aa49-f93ee9c75ff3",
      direction: "incoming",
      hasVideo: false,
    }),
  );
  state = reduceCallLifecycle(
    state,
    event({
      type: "answer",
      callId: "c8cc3ab6-3e1d-4f2b-aa49-f93ee9c75ff3",
      hasVideo: false,
    }),
  );

  assert.equal(state.phase, "connecting");
  assert.equal(state.shouldPresentAppCallUi, true);
});

test("outgoing start presents app UI while the media layer connects", () => {
  let state = createInitialCallLifecycleState();
  state = reduceCallLifecycle(
    state,
    event({
      type: "start",
      callId: "c8cc3ab6-3e1d-4f2b-aa49-f93ee9c75ff3",
      direction: "outgoing",
      hasVideo: true,
      displayName: "Minh",
    }),
  );

  assert.equal(state.phase, "dialing");
  assert.equal(state.shouldPresentAppCallUi, true);
  assert.equal(state.displayName, "Minh");
});

test("marking the call active moves to the ongoing phase", () => {
  let state: CallLifecycleState = {
    ...createInitialCallLifecycleState(),
    phase: "connecting",
    activeCallId: "c8cc3ab6-3e1d-4f2b-aa49-f93ee9c75ff3",
    shouldPresentAppCallUi: true,
  };
  state = reduceCallLifecycle(state, {
    type: "callBecameActive",
    callId: "c8cc3ab6-3e1d-4f2b-aa49-f93ee9c75ff3",
  });

  assert.equal(state.phase, "active");
  assert.equal(state.shouldPresentAppCallUi, true);
});

test("end dismisses app UI and clears the active call", () => {
  let state: CallLifecycleState = {
    ...createInitialCallLifecycleState(),
    phase: "active",
    activeCallId: "c8cc3ab6-3e1d-4f2b-aa49-f93ee9c75ff3",
    shouldPresentAppCallUi: true,
    muted: true,
  };
  state = reduceCallLifecycle(
    state,
    event({
      type: "end",
      callId: "c8cc3ab6-3e1d-4f2b-aa49-f93ee9c75ff3",
      reason: "remoteEnded",
    }),
  );

  assert.equal(state.phase, "ended");
  assert.equal(state.shouldPresentAppCallUi, false);
  assert.equal(state.endReason, "remoteEnded");
  assert.equal(state.muted, false);
});

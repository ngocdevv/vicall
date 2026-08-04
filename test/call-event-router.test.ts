import assert from "node:assert/strict";
import test from "node:test";

import { createCallEventRouter } from "../src/client/call-event-router";
import type { CallEvent } from "../src/ExpoVicallCallManager.types";

function event(partial: Partial<CallEvent> & Pick<CallEvent, "type">): CallEvent {
  return {
    eventId: "evt_1",
    timestamp: 1,
    ...partial,
  };
}

test("routes answer into media.accept and marks the native call active", async () => {
  const calls: string[] = [];
  const handle = createCallEventRouter({
    media: {
      async accept(callId) {
        calls.push(`accept:${callId}`);
      },
      async end() {},
    },
    setCallActive: async (callId) => {
      calls.push(`active:${callId}`);
    },
  });

  await handle(
    event({
      type: "answer",
      callId: "c8cc3ab6-3e1d-4f2b-aa49-f93ee9c75ff3",
    }),
  );

  assert.deepEqual(calls, [
    "accept:c8cc3ab6-3e1d-4f2b-aa49-f93ee9c75ff3",
    "active:c8cc3ab6-3e1d-4f2b-aa49-f93ee9c75ff3",
  ]);
});

test("maps mute events to microphone enablement for the media layer", async () => {
  const states: boolean[] = [];
  const handle = createCallEventRouter({
    media: {
      async accept() {},
      async end() {},
      async setMicrophoneEnabled(enabled) {
        states.push(enabled);
      },
    },
    setCallActive: async () => {},
  });

  await handle(event({ type: "mute", callId: "c8cc3ab6-3e1d-4f2b-aa49-f93ee9c75ff3", muted: true }));
  await handle(event({ type: "mute", callId: "c8cc3ab6-3e1d-4f2b-aa49-f93ee9c75ff3", muted: false }));

  assert.deepEqual(states, [false, true]);
});

import assert from "node:assert/strict";
import test from "node:test";

import { createSocialCallSession } from "../src/client/social-call-session";
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

test("social session presents host UI on answer then marks active after media accept", async () => {
  const calls: string[] = [];
  const session = createSocialCallSession({
    media: {
      async accept(callId) {
        calls.push(`accept:${callId}`);
      },
      async end() {
        calls.push("end");
      },
    },
    ui: {
      async presentInCallUi(callId) {
        calls.push(`present:${callId}`);
      },
      async dismissInCallUi(callId) {
        calls.push(`dismiss:${callId}`);
      },
    },
    setCallActive: async (callId) => {
      calls.push(`active:${callId}`);
    },
  });

  const callId = "c8cc3ab6-3e1d-4f2b-aa49-f93ee9c75ff3";
  await session.handleEvent(
    event({
      type: "incomingCallDisplayed",
      callId,
      direction: "incoming",
      hasVideo: true,
    }),
  );
  assert.equal(session.getState().shouldPresentAppCallUi, false);

  await session.handleEvent(event({ type: "answer", callId, hasVideo: true }));

  assert.deepEqual(calls, [
    `present:${callId}`,
    `accept:${callId}`,
    `active:${callId}`,
  ]);
  assert.equal(session.getState().phase, "active");
  assert.equal(session.getState().shouldPresentAppCallUi, true);

  await session.handleEvent(
    event({ type: "end", callId, reason: "remoteEnded" }),
  );
  assert.equal(calls.at(-1), `dismiss:${callId}`);
  assert.equal(session.getState().shouldPresentAppCallUi, false);
  assert.equal(session.getState().phase, "ended");
});

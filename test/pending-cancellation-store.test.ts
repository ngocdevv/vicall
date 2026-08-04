import assert from "node:assert/strict";
import test from "node:test";

import { PendingCancellationStore } from "../src/protocol/pending-cancellation-store";

test("buffers a cancel that arrives before the incoming call connection", () => {
  const store = new PendingCancellationStore<"remoteEnded" | "answeredElsewhere">(
    30_000,
  );
  const callId = "c8cc3ab6-3e1d-4f2b-aa49-f93ee9c75ff3";
  const now = 1_000;

  store.remember(callId, "answeredElsewhere", now);
  assert.equal(store.peek(callId, now + 1_000), "answeredElsewhere");
  assert.equal(store.consume(callId, now + 1_000), "answeredElsewhere");
  assert.equal(store.consume(callId, now + 1_000), null);
});

test("expires buffered cancels after the TTL window", () => {
  const store = new PendingCancellationStore(30_000);
  const callId = "c8cc3ab6-3e1d-4f2b-aa49-f93ee9c75ff3";
  store.remember(callId, "remoteEnded", 0);
  assert.equal(store.consume(callId, 30_001), null);
});

test("normalizes call ids when buffering cancels", () => {
  const store = new PendingCancellationStore(30_000);
  store.remember("C8CC3AB6-3E1D-4F2B-AA49-F93EE9C75FF3", "missed", 10);
  assert.equal(
    store.consume("c8cc3ab6-3e1d-4f2b-aa49-f93ee9c75ff3", 20),
    "missed",
  );
});

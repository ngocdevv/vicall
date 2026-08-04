import assert from "node:assert/strict";
import test from "node:test";

import { resolvePictureInPictureRevisionAction } from "../src/ui/call-presentation-state";

test("re-prepares an inline PiP source after its RTC track changes", () => {
  assert.equal(
    resolvePictureInPictureRevisionAction("fullscreen", true),
    "prepare",
  );
  assert.equal(
    resolvePictureInPictureRevisionAction("inAppMini", true),
    "prepare",
  );
});

test("refreshes an active system PiP renderer without recreating PiP", () => {
  assert.equal(
    resolvePictureInPictureRevisionAction("systemPip", true),
    "refresh",
  );
  assert.equal(
    resolvePictureInPictureRevisionAction("systemPip", false),
    "none",
  );
});

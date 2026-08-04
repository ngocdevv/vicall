import assert from "node:assert/strict";
import test from "node:test";

import { createNativeCallBootstrapOrder } from "../src/client/bootstrap-order";

test("bootstrap order keeps listeners subscribed before draining buffered events", () => {
  assert.deepEqual(createNativeCallBootstrapOrder(), [
    "setup",
    "addListener",
    "getInitialEvents",
    "handleInitialEvents",
    "clearInitialEvents",
  ]);
});

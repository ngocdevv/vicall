import assert from "node:assert/strict";
import test from "node:test";

import {
  clampCallOverlay,
  resolveKeyboardAwareBottom,
  resolveCallOverlayRelease,
  shouldMinimizeCall,
} from "../src/ui/call-geometry";

const bounds = {
  bottom: 700,
  left: 12,
  right: 202,
  top: 58,
  viewportHeight: 844,
  viewportWidth: 390,
};

test("clamps a dragged overlay to its allowed range", () => {
  assert.equal(clampCallOverlay(-20, 12, 202), 12);
  assert.equal(clampCallOverlay(99, 12, 202), 99);
  assert.equal(clampCallOverlay(250, 12, 202), 202);
});

test("keeps an in-app mini-player above the software keyboard", () => {
  assert.equal(resolveKeyboardAwareBottom(700, 58, 0), 700);
  assert.equal(resolveKeyboardAwareBottom(700, 58, 310), 390);
  assert.equal(resolveKeyboardAwareBottom(700, 58, 900), 58);
});

test("commits fullscreen minimization by distance or velocity", () => {
  assert.equal(shouldMinimizeCall(136, 0, 844), true);
  assert.equal(shouldMinimizeCall(20, 901, 844), true);
  assert.equal(shouldMinimizeCall(20, 400, 844), false);
});

test("snaps to the nearest safe-area corner", () => {
  assert.deepEqual(resolveCallOverlayRelease(20, 80, 176, 112, bounds, 30), {
    stashSide: 0,
    x: 12,
    y: 58,
  });
  assert.deepEqual(resolveCallOverlayRelease(190, 650, 176, 112, bounds, 30), {
    stashSide: 0,
    x: 202,
    y: 700,
  });
});
test("stashes beyond either horizontal edge and leaves a visible peek", () => {
  assert.deepEqual(resolveCallOverlayRelease(-40, 200, 176, 112, bounds, 30), {
    stashSide: -1,
    x: -146,
    y: 200,
  });
  assert.deepEqual(resolveCallOverlayRelease(250, 300, 176, 112, bounds, 30), {
    stashSide: 1,
    x: 360,
    y: 300,
  });
});

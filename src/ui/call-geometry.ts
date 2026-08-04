export interface CallOverlayBounds {
  bottom: number;
  left: number;
  right: number;
  top: number;
  viewportHeight: number;
  viewportWidth: number;
}

export interface CallOverlayRelease {
  stashSide: -1 | 0 | 1;
  x: number;
  y: number;
}

export function clampCallOverlay(
  value: number,
  minimum: number,
  maximum: number,
): number {
  "worklet";
  return Math.min(Math.max(value, minimum), maximum);
}

export function shouldMinimizeCall(
  translationY: number,
  velocityY: number,
  viewportHeight: number,
): boolean {
  "worklet";
  return translationY > viewportHeight * 0.16 || velocityY > 900;
}

export function resolveCallOverlayRelease(
  x: number,
  y: number,
  width: number,
  height: number,
  bounds: CallOverlayBounds,
  visiblePeek: number,
): CallOverlayRelease {
  "worklet";
  if (x < -width * 0.18) {
    return { stashSide: -1, x: -width + visiblePeek, y };
  }
  if (x > bounds.viewportWidth - width * 0.82) {
    return {
      stashSide: 1,
      x: bounds.viewportWidth - visiblePeek,
      y,
    };
  }

  return {
    stashSide: 0,
    x: x + width / 2 < bounds.viewportWidth / 2 ? bounds.left : bounds.right,
    y: y + height / 2 < bounds.viewportHeight / 2 ? bounds.top : bounds.bottom,
  };
}

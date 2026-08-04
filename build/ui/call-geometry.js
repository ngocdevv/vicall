export function clampCallOverlay(value, minimum, maximum) {
    "worklet";
    return Math.min(Math.max(value, minimum), maximum);
}
export function resolveKeyboardAwareBottom(restingBottom, top, keyboardHeight) {
    "worklet";
    return Math.max(top, restingBottom - Math.max(0, keyboardHeight));
}
export function shouldMinimizeCall(translationY, velocityY, viewportHeight) {
    "worklet";
    return translationY > viewportHeight * 0.16 || velocityY > 900;
}
export function resolveCallOverlayRelease(x, y, width, height, bounds, visiblePeek) {
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
        x: Math.abs(x - bounds.left) <= Math.abs(x - bounds.right)
            ? bounds.left
            : bounds.right,
        y: Math.abs(y - bounds.top) <= Math.abs(y - bounds.bottom)
            ? bounds.top
            : bounds.bottom,
    };
}
//# sourceMappingURL=call-geometry.js.map
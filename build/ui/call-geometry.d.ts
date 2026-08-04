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
export declare function clampCallOverlay(value: number, minimum: number, maximum: number): number;
export declare function resolveKeyboardAwareBottom(restingBottom: number, top: number, keyboardHeight: number): number;
export declare function shouldMinimizeCall(translationY: number, velocityY: number, viewportHeight: number): boolean;
export declare function resolveCallOverlayRelease(x: number, y: number, width: number, height: number, bounds: CallOverlayBounds, visiblePeek: number): CallOverlayRelease;
//# sourceMappingURL=call-geometry.d.ts.map
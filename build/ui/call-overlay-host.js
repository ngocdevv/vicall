import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useRef, useState } from "react";
import { StatusBar, Text, useWindowDimensions, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { interpolate, runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming, } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CallChrome } from "./call-chrome";
import { clampCallOverlay, resolveCallOverlayRelease, shouldMinimizeCall, } from "./call-geometry";
import { useCallPresentation } from "./call-presentation-context";
import { CallVideoContent, MuteBadge } from "./call-video-content";
const isIOS = process.env.EXPO_OS === "ios";
const MINI_PEEK = 30;
const SPRING = { damping: 24, stiffness: 260 };
export function CallOverlayHost({ miniWidth = 176, miniHeight = 112, edgeInset = 12, controlsAutoHideDelay = 4000, }) {
    const { mode, session, theme, minimize, restore, endCall } = useCallPresentation();
    const insets = useSafeAreaInsets();
    const window = useWindowDimensions();
    const [controlsVisible, setControlsVisible] = useState(true);
    const controlsTimerRef = useRef(null);
    const previousModeRef = useRef(mode);
    const miniInitializedRef = useRef(false);
    const resolvedMiniWidth = Math.min(miniWidth, Math.max(120, window.width - edgeInset * 2));
    const resolvedMiniHeight = Math.min(miniHeight, Math.max(88, window.height * 0.32));
    const topBound = Math.max(insets.top, edgeInset) + edgeInset;
    const bottomBound = Math.max(topBound, window.height -
        Math.max(insets.bottom, edgeInset) -
        edgeInset -
        resolvedMiniHeight);
    const leftBound = edgeInset;
    const rightBound = Math.max(leftBound, window.width - edgeInset - resolvedMiniWidth);
    const surfaceX = useSharedValue(0);
    const surfaceY = useSharedValue(0);
    const surfaceWidth = useSharedValue(window.width);
    const surfaceHeight = useSharedValue(window.height);
    const surfaceRadius = useSharedValue(0);
    const surfaceOpacity = useSharedValue(1);
    const controlsOpacity = useSharedValue(1);
    const gestureStartX = useSharedValue(0);
    const gestureStartY = useSharedValue(0);
    const modeCode = useSharedValue(0);
    const stashSide = useSharedValue(0);
    const localWidth = Math.min(112, window.width * 0.3);
    const localHeight = localWidth * 1.38;
    const localMinY = topBound + 54;
    const localMaxX = Math.max(leftBound, window.width - edgeInset - localWidth);
    const localMaxY = Math.max(localMinY, window.height -
        Math.max(insets.bottom, edgeInset) -
        edgeInset -
        localHeight -
        72);
    const localX = useSharedValue(localMaxX);
    const localY = useSharedValue(topBound + 64);
    const localStartX = useSharedValue(0);
    const localStartY = useSharedValue(0);
    const localOpacity = useSharedValue(1);
    const clearControlsTimer = useCallback(() => {
        if (controlsTimerRef.current != null) {
            clearTimeout(controlsTimerRef.current);
            controlsTimerRef.current = null;
        }
    }, []);
    const scheduleControlsAutoHide = useCallback(() => {
        clearControlsTimer();
        if (controlsAutoHideDelay <= 0 ||
            session?.connectionState !== "connected") {
            return;
        }
        controlsTimerRef.current = setTimeout(() => {
            setControlsVisible(false);
        }, controlsAutoHideDelay);
    }, [clearControlsTimer, controlsAutoHideDelay, session?.connectionState]);
    const showControls = useCallback(() => {
        setControlsVisible(true);
        scheduleControlsAutoHide();
    }, [scheduleControlsAutoHide]);
    const toggleControls = useCallback(() => {
        setControlsVisible((visible) => {
            const next = !visible;
            if (next)
                scheduleControlsAutoHide();
            else
                clearControlsTimer();
            return next;
        });
    }, [clearControlsTimer, scheduleControlsAutoHide]);
    useEffect(() => {
        if (mode === "fullscreen")
            showControls();
        else
            clearControlsTimer();
        return clearControlsTimer;
    }, [clearControlsTimer, mode, showControls]);
    useEffect(() => {
        controlsOpacity.value = withTiming(mode === "fullscreen" && controlsVisible ? 1 : 0, { duration: 180 });
    }, [controlsOpacity, controlsVisible, mode]);
    useEffect(() => {
        const previousMode = previousModeRef.current;
        previousModeRef.current = mode;
        if (mode === "fullscreen" || mode === "restoring") {
            modeCode.value = 0;
            stashSide.value = 0;
            surfaceOpacity.value = withTiming(1, { duration: 120 });
            surfaceX.value = withSpring(0, SPRING);
            surfaceY.value = withSpring(0, SPRING);
            surfaceWidth.value = withSpring(window.width, SPRING);
            surfaceHeight.value = withSpring(window.height, SPRING);
            surfaceRadius.value = withTiming(0, { duration: 220 });
            localOpacity.value = withTiming(1, { duration: 160 });
            return;
        }
        if (mode === "inAppMini") {
            modeCode.value = 1;
            localOpacity.value = withTiming(0, { duration: 120 });
            surfaceOpacity.value = withTiming(1, { duration: 120 });
            const shouldInitialize = !miniInitializedRef.current || previousMode === "fullscreen";
            if (shouldInitialize) {
                miniInitializedRef.current = true;
                surfaceX.value = withSpring(rightBound, SPRING);
                surfaceY.value = withSpring(bottomBound, SPRING);
            }
            else {
                const nextX = stashSide.value === -1
                    ? -resolvedMiniWidth + MINI_PEEK
                    : stashSide.value === 1
                        ? window.width - MINI_PEEK
                        : clampCallOverlay(surfaceX.value, leftBound, rightBound);
                surfaceX.value = withSpring(nextX, SPRING);
                surfaceY.value = withSpring(clampCallOverlay(surfaceY.value, topBound, bottomBound), SPRING);
            }
            surfaceWidth.value = withSpring(resolvedMiniWidth, SPRING);
            surfaceHeight.value = withSpring(resolvedMiniHeight, SPRING);
            surfaceRadius.value = withTiming(22, { duration: 200 });
            return;
        }
        if (mode === "systemPip") {
            modeCode.value = 2;
            localOpacity.value = withTiming(0, { duration: 80 });
            if (isIOS) {
                surfaceOpacity.value = withTiming(0, { duration: 100 });
            }
            else {
                surfaceOpacity.value = 1;
                surfaceX.value = 0;
                surfaceY.value = 0;
                surfaceWidth.value = window.width;
                surfaceHeight.value = window.height;
                surfaceRadius.value = 0;
            }
            return;
        }
        if (mode === "minimizing") {
            modeCode.value = 3;
            controlsOpacity.value = withTiming(0, { duration: 100 });
            localOpacity.value = withTiming(0, { duration: 100 });
        }
    }, [
        bottomBound,
        leftBound,
        localOpacity,
        mode,
        modeCode,
        resolvedMiniHeight,
        resolvedMiniWidth,
        rightBound,
        stashSide,
        surfaceHeight,
        surfaceOpacity,
        surfaceRadius,
        surfaceWidth,
        surfaceX,
        surfaceY,
        topBound,
        window.height,
        window.width,
        controlsOpacity,
    ]);
    useEffect(() => {
        localX.value = withSpring(clampCallOverlay(localX.value, leftBound, window.width - edgeInset - localWidth), SPRING);
        localY.value = withSpring(clampCallOverlay(localY.value, localMinY, localMaxY), SPRING);
    }, [leftBound, localMaxX, localMaxY, localMinY, localX, localY]);
    const requestMinimize = useCallback(() => {
        void minimize();
    }, [minimize]);
    const requestRestore = useCallback(() => {
        void restore();
    }, [restore]);
    const surfacePan = Gesture.Pan()
        .minDistance(6)
        .onBegin(() => {
        gestureStartX.value = surfaceX.value;
        gestureStartY.value = surfaceY.value;
    })
        .onUpdate((event) => {
        if (modeCode.value === 0) {
            const distance = Math.max(0, event.translationY);
            const progress = clampCallOverlay(distance / (window.height * 0.72), 0, 1);
            surfaceX.value = interpolate(progress, [0, 1], [0, rightBound]);
            surfaceY.value = interpolate(progress, [0, 1], [0, bottomBound]);
            surfaceWidth.value = interpolate(progress, [0, 1], [window.width, resolvedMiniWidth]);
            surfaceHeight.value = interpolate(progress, [0, 1], [window.height, resolvedMiniHeight]);
            surfaceRadius.value = interpolate(progress, [0, 1], [0, 22]);
            controlsOpacity.value = 1 - clampCallOverlay(progress * 2.4, 0, 1);
            localOpacity.value = 1 - clampCallOverlay(progress * 2.2, 0, 1);
            return;
        }
        if (modeCode.value !== 1)
            return;
        const rawX = gestureStartX.value + event.translationX;
        const rawY = gestureStartY.value + event.translationY;
        surfaceX.value = clampCallOverlay(rawX, -resolvedMiniWidth + MINI_PEEK, window.width - MINI_PEEK);
        surfaceY.value = clampCallOverlay(rawY, topBound, bottomBound);
    })
        .onEnd((event) => {
        if (modeCode.value === 0) {
            const shouldMinimize = shouldMinimizeCall(event.translationY, event.velocityY, window.height);
            if (shouldMinimize) {
                surfaceX.value = withTiming(rightBound, { duration: 160 });
                surfaceY.value = withTiming(bottomBound, { duration: 160 });
                surfaceWidth.value = withTiming(resolvedMiniWidth, { duration: 160 });
                surfaceHeight.value = withTiming(resolvedMiniHeight, {
                    duration: 160,
                });
                surfaceRadius.value = withTiming(22, { duration: 160 }, (finished) => {
                    if (finished)
                        runOnJS(requestMinimize)();
                });
            }
            else {
                surfaceX.value = withSpring(0, SPRING);
                surfaceY.value = withSpring(0, SPRING);
                surfaceWidth.value = withSpring(window.width, SPRING);
                surfaceHeight.value = withSpring(window.height, SPRING);
                surfaceRadius.value = withSpring(0, SPRING);
                controlsOpacity.value = withTiming(controlsVisible ? 1 : 0, {
                    duration: 140,
                });
                localOpacity.value = withTiming(1, { duration: 140 });
            }
            return;
        }
        if (modeCode.value !== 1)
            return;
        const release = resolveCallOverlayRelease(surfaceX.value, surfaceY.value, resolvedMiniWidth, resolvedMiniHeight, {
            bottom: bottomBound,
            left: leftBound,
            right: rightBound,
            top: topBound,
            viewportHeight: window.height,
            viewportWidth: window.width,
        }, MINI_PEEK);
        stashSide.value = release.stashSide;
        surfaceX.value = withSpring(release.x, SPRING);
        surfaceY.value = withSpring(release.y, SPRING);
    });
    const surfaceTap = Gesture.Tap()
        .maxDuration(240)
        .onEnd((_event, success) => {
        if (!success)
            return;
        if (modeCode.value === 0) {
            runOnJS(toggleControls)();
            return;
        }
        if (modeCode.value !== 1)
            return;
        if (stashSide.value === -1) {
            stashSide.value = 0;
            surfaceX.value = withSpring(leftBound, SPRING);
            return;
        }
        if (stashSide.value === 1) {
            stashSide.value = 0;
            surfaceX.value = withSpring(rightBound, SPRING);
            return;
        }
        runOnJS(requestRestore)();
    });
    const surfaceGesture = Gesture.Exclusive(surfacePan, surfaceTap);
    const localPan = Gesture.Pan()
        .minDistance(4)
        .onBegin(() => {
        localStartX.value = localX.value;
        localStartY.value = localY.value;
    })
        .onUpdate((event) => {
        localX.value = clampCallOverlay(localStartX.value + event.translationX, leftBound, localMaxX);
        localY.value = clampCallOverlay(localStartY.value + event.translationY, localMinY, localMaxY);
    })
        .onEnd(() => {
        localX.value = withSpring(localX.value + localWidth / 2 < window.width / 2
            ? leftBound
            : localMaxX, SPRING);
        localY.value = withSpring(localY.value + localHeight / 2 < window.height / 2
            ? localMinY
            : localMaxY, SPRING);
    });
    const surfaceStyle = useAnimatedStyle(() => ({
        borderRadius: surfaceRadius.value,
        height: surfaceHeight.value,
        left: surfaceX.value,
        opacity: surfaceOpacity.value,
        top: surfaceY.value,
        width: surfaceWidth.value,
    }));
    const chromeStyle = useAnimatedStyle(() => ({
        opacity: controlsOpacity.value,
    }));
    const localStyle = useAnimatedStyle(() => ({
        left: localX.value,
        opacity: localOpacity.value,
        top: localY.value,
    }));
    const leftPeekStyle = useAnimatedStyle(() => ({
        opacity: stashSide.value === -1 ? 1 : 0,
    }));
    const rightPeekStyle = useAnimatedStyle(() => ({
        opacity: stashSide.value === 1 ? 1 : 0,
    }));
    if (session == null || mode === "idle")
        return null;
    const fullscreenLike = mode === "fullscreen" || mode === "minimizing" || mode === "restoring";
    const pointerEvents = mode === "systemPip" ? "none" : fullscreenLike ? "auto" : "box-none";
    return (_jsxs(View, { pointerEvents: pointerEvents, style: {
            backgroundColor: fullscreenLike || (mode === "systemPip" && !isIOS)
                ? theme.backgroundColor
                : "transparent",
            bottom: 0,
            left: 0,
            position: "absolute",
            right: 0,
            top: 0,
            zIndex: 999,
        }, children: [fullscreenLike && (_jsx(StatusBar, { backgroundColor: "transparent", barStyle: "light-content" })), _jsx(GestureDetector, { gesture: surfaceGesture, children: _jsxs(Animated.View, { style: [
                        {
                            backgroundColor: theme.backgroundColor,
                            borderColor: theme.miniBorderColor,
                            borderCurve: "continuous",
                            borderWidth: mode === "inAppMini" ? 1 : 0,
                            boxShadow: mode === "inAppMini" ? theme.miniShadow : undefined,
                            overflow: "hidden",
                            position: "absolute",
                        },
                        surfaceStyle,
                    ], children: [_jsx(CallVideoContent, { compact: !fullscreenLike, session: session, theme: theme }), _jsx(Animated.View, { pointerEvents: "none", style: [
                                {
                                    alignItems: "center",
                                    backgroundColor: "rgba(34, 37, 43, 0.86)",
                                    bottom: 0,
                                    justifyContent: "center",
                                    left: 0,
                                    position: "absolute",
                                    top: 0,
                                    width: MINI_PEEK,
                                },
                                rightPeekStyle,
                            ], children: _jsx(Text, { style: { color: theme.contentColor, fontSize: 22 }, children: "\u2039" }) }), _jsx(Animated.View, { pointerEvents: "none", style: [
                                {
                                    alignItems: "center",
                                    backgroundColor: "rgba(34, 37, 43, 0.86)",
                                    bottom: 0,
                                    justifyContent: "center",
                                    position: "absolute",
                                    right: 0,
                                    top: 0,
                                    width: MINI_PEEK,
                                },
                                leftPeekStyle,
                            ], children: _jsx(Text, { style: { color: theme.contentColor, fontSize: 22 }, children: "\u203A" }) })] }) }), session.localVideo != null && (_jsx(GestureDetector, { gesture: localPan, children: _jsxs(Animated.View, { pointerEvents: mode === "fullscreen" ? "auto" : "none", style: [
                        {
                            backgroundColor: theme.backgroundColor,
                            borderColor: theme.miniBorderColor,
                            borderCurve: "continuous",
                            borderRadius: 20,
                            borderWidth: 1,
                            boxShadow: theme.miniShadow,
                            height: localHeight,
                            overflow: "hidden",
                            position: "absolute",
                            width: localWidth,
                        },
                        localStyle,
                    ], children: [_jsx(View, { style: { flex: 1 }, children: session.localVideo }), _jsx(MuteBadge, { muted: session.localMuted, side: "right", theme: theme })] }) })), _jsx(Animated.View, { pointerEvents: mode === "fullscreen" && controlsVisible ? "box-none" : "none", style: [
                    { bottom: 0, left: 0, position: "absolute", right: 0, top: 0 },
                    chromeStyle,
                ], children: _jsx(CallChrome, { insets: insets, onEndCall: () => void endCall(), onInteraction: showControls, onMinimize: () => void minimize(), session: session, theme: theme }) })] }));
}
//# sourceMappingURL=call-overlay-host.js.map
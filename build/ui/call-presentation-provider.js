import { jsx as _jsx } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import CallManager from "../ExpoVicallCallManagerModule";
import { CallPresentationContext } from "./call-presentation-context";
import { resolvePictureInPictureRevisionAction } from "./call-presentation-state";
import { defaultCallPresentationTheme } from "./call-presentation-theme";
const isIOS = process.env.EXPO_OS === "ios";
const isAndroid = process.env.EXPO_OS === "android";
function asError(value) {
    return value instanceof Error ? value : new Error(String(value));
}
function afterNextLayout(callback) {
    requestAnimationFrame(() => requestAnimationFrame(callback));
}
export function CallPresentationProvider({ children, session, theme: themeOverrides, onError, onModeChange, }) {
    const [mode, setMode] = useState(session == null ? "idle" : "fullscreen");
    const modeRef = useRef(mode);
    const sessionRef = useRef(session);
    const previousModeRef = useRef("fullscreen");
    const preparedCallIdRef = useRef(null);
    const preparePromiseRef = useRef(null);
    const androidPresentationViewTagRef = useRef(null);
    const pictureInPictureRevisionRef = useRef(session?.pictureInPicture?.revision);
    const minimizeTimeoutRef = useRef(null);
    const errorHandlerRef = useRef(onError);
    const theme = useMemo(() => ({ ...defaultCallPresentationTheme, ...themeOverrides }), [themeOverrides]);
    const updateMode = useCallback((nextMode) => {
        modeRef.current = nextMode;
        setMode(nextMode);
    }, []);
    useEffect(() => {
        modeRef.current = mode;
    }, [mode]);
    useEffect(() => {
        sessionRef.current = session;
    }, [session]);
    useEffect(() => {
        errorHandlerRef.current = onError;
    }, [onError]);
    const reportError = useCallback((value) => {
        errorHandlerRef.current?.(asError(value));
    }, []);
    const prepareSystemPictureInPicture = useCallback(async (activeSession, force = false) => {
        const source = activeSession.pictureInPicture;
        if (source == null)
            return false;
        if (!force && preparedCallIdRef.current === activeSession.callId) {
            return true;
        }
        if (preparePromiseRef.current != null) {
            return preparePromiseRef.current;
        }
        const task = (async () => {
            const supported = await CallManager.isPictureInPictureSupported();
            if (!supported)
                return false;
            const remoteViewTag = source.getRemoteViewTag();
            if (remoteViewTag == null)
                return false;
            const localViewTag = source.getLocalViewTag?.() ?? null;
            await CallManager.preparePictureInPicture(remoteViewTag, localViewTag, {
                aspectRatioWidth: 16,
                aspectRatioHeight: 9,
                autoEnterEnabled: true,
                seamlessResizeEnabled: true,
                ...source.options,
                ...(isAndroid && androidPresentationViewTagRef.current != null
                    ? {
                        androidPresentationViewTag: androidPresentationViewTagRef.current,
                    }
                    : {}),
            });
            preparedCallIdRef.current = activeSession.callId;
            return true;
        })();
        preparePromiseRef.current = task;
        try {
            return await task;
        }
        catch (error) {
            preparedCallIdRef.current = null;
            reportError(error);
            return false;
        }
        finally {
            preparePromiseRef.current = null;
        }
    }, [reportError]);
    const handlePictureInPictureEvent = useCallback((event) => {
        switch (event.type) {
            case "willStart":
                if (modeRef.current !== "minimizing") {
                    previousModeRef.current = modeRef.current;
                }
                break;
            case "didStart":
                if (minimizeTimeoutRef.current != null) {
                    clearTimeout(minimizeTimeoutRef.current);
                    minimizeTimeoutRef.current = null;
                }
                updateMode("systemPip");
                break;
            case "stateChanged":
                if (event.active) {
                    updateMode("systemPip");
                }
                else if (modeRef.current === "systemPip") {
                    updateMode(previousModeRef.current);
                }
                break;
            case "failedToStart":
                if (minimizeTimeoutRef.current != null) {
                    clearTimeout(minimizeTimeoutRef.current);
                    minimizeTimeoutRef.current = null;
                }
                reportError(new Error(event.error ?? "Unable to start Picture in Picture"));
                updateMode(modeRef.current === "minimizing"
                    ? "inAppMini"
                    : previousModeRef.current);
                break;
            case "restoreRequested":
                updateMode("restoring");
                afterNextLayout(() => {
                    updateMode("fullscreen");
                    void CallManager.completePictureInPictureRestore(true).catch(reportError);
                });
                break;
            case "didStop":
                if (modeRef.current === "systemPip" ||
                    modeRef.current === "restoring") {
                    updateMode(previousModeRef.current);
                }
                break;
            default:
                break;
        }
    }, [reportError, updateMode]);
    const refreshSystemPictureInPictureTracks = useCallback(async (activeSession) => {
        const source = activeSession.pictureInPicture;
        if (source == null)
            return false;
        const remoteViewTag = source.getRemoteViewTag();
        if (remoteViewTag == null)
            return false;
        const localViewTag = source.getLocalViewTag?.() ?? null;
        try {
            await CallManager.refreshPictureInPictureVideoTracks(remoteViewTag, localViewTag);
            return true;
        }
        catch (error) {
            reportError(error);
            return false;
        }
    }, [reportError]);
    useEffect(() => {
        const subscription = CallManager.addListener("onPictureInPictureEvent", handlePictureInPictureEvent);
        void CallManager.getInitialPictureInPictureEvents()
            .then((events) => {
            events.forEach(handlePictureInPictureEvent);
            return CallManager.clearInitialPictureInPictureEvents();
        })
            .catch(reportError);
        return () => subscription.remove();
    }, [handlePictureInPictureEvent, reportError]);
    useEffect(() => {
        onModeChange?.(mode);
    }, [mode, onModeChange]);
    useEffect(() => {
        const callId = session?.callId ?? null;
        preparedCallIdRef.current = null;
        preparePromiseRef.current = null;
        if (callId == null) {
            updateMode("idle");
            void CallManager.disposePictureInPicture().catch(reportError);
            return;
        }
        previousModeRef.current = "fullscreen";
        updateMode("fullscreen");
        afterNextLayout(() => {
            const activeSession = sessionRef.current;
            if (activeSession?.callId === callId) {
                void prepareSystemPictureInPicture(activeSession);
            }
        });
        return () => {
            if (minimizeTimeoutRef.current != null) {
                clearTimeout(minimizeTimeoutRef.current);
                minimizeTimeoutRef.current = null;
            }
            void CallManager.disposePictureInPicture().catch(reportError);
        };
    }, [session?.callId, prepareSystemPictureInPicture, reportError, updateMode]);
    useEffect(() => {
        if (session == null)
            return;
        void CallManager.updatePictureInPictureState({
            displayName: session.displayName,
            localMuted: session.localMuted,
            remoteMuted: session.remoteMuted,
            remoteCameraEnabled: session.remoteCameraEnabled,
        }).catch(reportError);
    }, [
        reportError,
        session?.callId,
        session?.displayName,
        session?.localMuted,
        session?.remoteCameraEnabled,
        session?.remoteMuted,
    ]);
    useEffect(() => {
        const revision = session?.pictureInPicture?.revision;
        const changed = pictureInPictureRevisionRef.current !== revision;
        pictureInPictureRevisionRef.current = revision;
        if (session == null)
            return;
        const action = resolvePictureInPictureRevisionAction(modeRef.current, changed);
        if (action === "none")
            return;
        afterNextLayout(() => {
            const activeSession = sessionRef.current;
            if (activeSession?.callId === session.callId) {
                if (action === "refresh") {
                    void refreshSystemPictureInPictureTracks(activeSession);
                }
                else {
                    void prepareSystemPictureInPicture(activeSession, true);
                }
            }
        });
    }, [
        prepareSystemPictureInPicture,
        refreshSystemPictureInPictureTracks,
        session?.callId,
        session?.pictureInPicture?.revision,
    ]);
    useEffect(() => {
        if (mode !== "inAppMini" || !isAndroid || session == null)
            return;
        afterNextLayout(() => {
            const activeSession = sessionRef.current;
            if (activeSession != null) {
                void prepareSystemPictureInPicture(activeSession, true);
            }
        });
    }, [mode, prepareSystemPictureInPicture, session]);
    useEffect(() => {
        const subscription = AppState.addEventListener("change", (state) => {
            if (state === "active")
                return;
            if (modeRef.current !== "systemPip" &&
                modeRef.current !== "minimizing" &&
                modeRef.current !== "idle") {
                previousModeRef.current = modeRef.current;
            }
        });
        return () => subscription.remove();
    }, []);
    const minimize = useCallback(async () => {
        const activeSession = sessionRef.current;
        if (activeSession == null ||
            activeSession.canMinimize === false ||
            modeRef.current !== "fullscreen") {
            return;
        }
        previousModeRef.current = "fullscreen";
        if (!isIOS) {
            updateMode("inAppMini");
            return;
        }
        updateMode("minimizing");
        const prepared = await prepareSystemPictureInPicture(activeSession, true);
        if (!prepared) {
            updateMode("inAppMini");
            return;
        }
        try {
            await CallManager.startPictureInPicture();
            minimizeTimeoutRef.current = setTimeout(() => {
                if (modeRef.current === "minimizing") {
                    updateMode("inAppMini");
                }
            }, 1800);
        }
        catch (error) {
            reportError(error);
            updateMode("inAppMini");
        }
    }, [prepareSystemPictureInPicture, reportError, updateMode]);
    const restore = useCallback(async () => {
        if (modeRef.current === "inAppMini") {
            updateMode("fullscreen");
            return;
        }
        if (modeRef.current !== "systemPip")
            return;
        updateMode("restoring");
        afterNextLayout(() => {
            updateMode("fullscreen");
            void CallManager.completePictureInPictureRestore(true).catch(reportError);
            void CallManager.stopPictureInPicture().catch(reportError);
        });
    }, [reportError, updateMode]);
    const endCall = useCallback(async () => {
        const activeSession = sessionRef.current;
        if (activeSession == null)
            return;
        updateMode("idle");
        try {
            await activeSession.onEndCall();
        }
        catch (error) {
            reportError(error);
        }
        finally {
            preparedCallIdRef.current = null;
            await CallManager.disposePictureInPicture().catch(reportError);
        }
    }, [reportError, updateMode]);
    const setAndroidPresentationViewTag = useCallback((tag) => {
        androidPresentationViewTagRef.current = tag;
    }, []);
    const value = useMemo(() => ({
        mode,
        session,
        theme,
        minimize,
        restore,
        endCall,
        setAndroidPresentationViewTag,
    }), [
        endCall,
        minimize,
        mode,
        restore,
        session,
        setAndroidPresentationViewTag,
        theme,
    ]);
    return (_jsx(CallPresentationContext, { value: value, children: children }));
}
//# sourceMappingURL=call-presentation-provider.js.map
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Pressable, Text, View } from "react-native";
import { CallControlButton } from "./call-control-button";
function invoke(action) {
    if (action == null)
        return;
    void action();
}
export function CallChrome({ insets, session, theme, onMinimize, onInteraction, onEndCall, }) {
    const status = session.statusText ??
        (session.connectionState === "connected"
            ? "Ongoing call"
            : session.connectionState === "reconnecting"
                ? "Reconnecting…"
                : session.connectionState === "connecting"
                    ? "Connecting…"
                    : "Calling…");
    return (_jsxs(View, { pointerEvents: "box-none", style: { bottom: 0, left: 0, position: "absolute", right: 0, top: 0 }, children: [_jsxs(View, { style: {
                    alignItems: "center",
                    flexDirection: "row",
                    gap: 12,
                    left: 16,
                    paddingTop: Math.max(insets.top, 12),
                    position: "absolute",
                    right: 16,
                    top: 0,
                }, children: [_jsx(Pressable, { accessibilityLabel: "Minimize call", accessibilityRole: "button", hitSlop: 10, onPress: () => {
                            onInteraction();
                            onMinimize();
                        }, style: ({ pressed }) => ({
                            alignItems: "center",
                            backgroundColor: theme.chromeMutedColor,
                            borderRadius: 21,
                            height: 42,
                            justifyContent: "center",
                            opacity: pressed ? 0.7 : 1,
                            width: 42,
                        }), children: _jsx(Text, { style: { color: theme.contentColor, fontSize: 28, lineHeight: 30 }, children: "\u2304" }) }), _jsxs(View, { style: {
                            backgroundColor: theme.chromeColor,
                            borderCurve: "continuous",
                            borderRadius: 18,
                            flex: 1,
                            gap: 1,
                            minHeight: 54,
                            paddingHorizontal: 16,
                            paddingVertical: 8,
                        }, children: [_jsx(Text, { numberOfLines: 1, style: {
                                    color: theme.contentColor,
                                    fontSize: 17,
                                    fontWeight: "700",
                                }, children: session.displayName }), _jsx(Text, { numberOfLines: 1, style: { color: theme.mutedContentColor, fontSize: 12 }, children: status })] }), session.onAddParticipant != null && (_jsx(CallControlButton, { accessibilityLabel: "Add participant", compact: true, control: "addParticipant", icon: session.renderControlIcon?.("addParticipant", false), onPress: () => {
                            onInteraction();
                            invoke(session.onAddParticipant);
                        }, theme: theme })), session.onMore != null && (_jsx(CallControlButton, { accessibilityLabel: "More call options", compact: true, control: "more", icon: session.renderControlIcon?.("more", false), onPress: () => {
                            onInteraction();
                            invoke(session.onMore);
                        }, theme: theme }))] }), _jsxs(View, { style: {
                    alignItems: "center",
                    bottom: Math.max(insets.bottom, 16) + 8,
                    gap: 12,
                    left: 16,
                    position: "absolute",
                    right: 16,
                }, children: [session.renderAccessoryControls?.(), _jsxs(View, { style: {
                            alignItems: "center",
                            flexDirection: "row",
                            gap: 12,
                            justifyContent: "center",
                        }, children: [_jsx(CallControlButton, { accessibilityLabel: session.localCameraEnabled === false
                                    ? "Turn camera on"
                                    : "Turn camera off", active: session.localCameraEnabled === false, control: "camera", disabled: session.onToggleCamera == null, icon: session.renderControlIcon?.("camera", session.localCameraEnabled === false), onPress: () => {
                                    onInteraction();
                                    invoke(session.onToggleCamera);
                                }, theme: theme }), _jsx(CallControlButton, { accessibilityLabel: session.localMuted ? "Unmute" : "Mute", active: session.localMuted, control: "microphone", disabled: session.onToggleMicrophone == null, icon: session.renderControlIcon?.("microphone", session.localMuted === true), onPress: () => {
                                    onInteraction();
                                    invoke(session.onToggleMicrophone);
                                }, theme: theme }), _jsx(CallControlButton, { accessibilityLabel: "Switch camera", control: "switchCamera", disabled: session.onSwitchCamera == null, icon: session.renderControlIcon?.("switchCamera", false), onPress: () => {
                                    onInteraction();
                                    invoke(session.onSwitchCamera);
                                }, theme: theme }), _jsx(CallControlButton, { accessibilityLabel: "End call", control: "end", destructive: true, icon: session.renderControlIcon?.("end", false), onPress: onEndCall, theme: theme })] })] })] }));
}
//# sourceMappingURL=call-chrome.js.map
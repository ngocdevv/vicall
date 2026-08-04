import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { Text, View } from "react-native";
export function MuteBadge({ muted, side, theme }) {
    if (!muted)
        return null;
    return (_jsx(View, { pointerEvents: "none", style: {
            alignItems: "center",
            backgroundColor: "rgba(32, 34, 39, 0.72)",
            borderRadius: 12,
            bottom: 8,
            height: 24,
            justifyContent: "center",
            position: "absolute",
            [side]: 8,
            width: 24,
        }, children: _jsx(Text, { style: { color: theme.contentColor, fontSize: 11 }, children: "\u2571" }) }));
}
function FallbackIdentity({ avatar, displayName, status, theme, compact, }) {
    return (_jsxs(View, { style: {
            alignItems: "center",
            flex: 1,
            gap: compact ? 6 : 12,
            justifyContent: "center",
            padding: 16,
        }, children: [avatar, !compact && (_jsxs(_Fragment, { children: [_jsx(Text, { numberOfLines: 1, style: {
                            color: theme.contentColor,
                            fontSize: 24,
                            fontWeight: "700",
                        }, children: displayName }), _jsx(Text, { style: { color: theme.mutedContentColor, fontSize: 15 }, children: status })] }))] }));
}
export function CallVideoContent({ session, theme, compact, }) {
    const showRemoteVideo = session.remoteVideo != null && session.remoteCameraEnabled !== false;
    const status = session.statusText ??
        (session.connectionState === "connected"
            ? "Ongoing call"
            : session.connectionState === "ringing"
                ? "Calling…"
                : session.connectionState === "reconnecting"
                    ? "Reconnecting…"
                    : "Connecting…");
    return (_jsxs(View, { style: {
            backgroundColor: theme.backgroundColor,
            flex: 1,
            overflow: "hidden",
        }, children: [session.remoteVideo != null && (_jsx(View, { pointerEvents: "none", style: {
                    bottom: 0,
                    left: 0,
                    opacity: showRemoteVideo ? 1 : 0,
                    position: "absolute",
                    right: 0,
                    top: 0,
                }, children: session.remoteVideo })), !showRemoteVideo && (_jsx(FallbackIdentity, { avatar: session.avatar, compact: compact, displayName: session.displayName, status: status, theme: theme })), _jsx(MuteBadge, { muted: session.localMuted, side: "left", theme: theme }), _jsx(MuteBadge, { muted: session.remoteMuted, side: "right", theme: theme })] }));
}
//# sourceMappingURL=call-video-content.js.map
import type { ReactNode } from "react";
import { Text, View } from "react-native";

import type {
  CallPresentationTheme,
  HybridCallSession,
} from "./call-presentation.types";

interface MuteBadgeProps {
  muted: boolean | undefined;
  side: "left" | "right";
  theme: CallPresentationTheme;
}

export function MuteBadge({ muted, side, theme }: MuteBadgeProps) {
  if (!muted) return null;
  return (
    <View
      pointerEvents="none"
      style={{
        alignItems: "center",
        backgroundColor: "rgba(32, 34, 39, 0.72)",
        borderRadius: 12,
        bottom: 8,
        height: 24,
        justifyContent: "center",
        position: "absolute",
        [side]: 8,
        width: 24,
      }}
    >
      <Text style={{ color: theme.contentColor, fontSize: 11 }}>╱</Text>
    </View>
  );
}

interface CallVideoContentProps {
  session: HybridCallSession;
  theme: CallPresentationTheme;
  compact: boolean;
}

function FallbackIdentity({
  avatar,
  displayName,
  status,
  theme,
  compact,
}: {
  avatar: ReactNode;
  displayName: string;
  status: string;
  theme: CallPresentationTheme;
  compact: boolean;
}) {
  return (
    <View
      style={{
        alignItems: "center",
        flex: 1,
        gap: compact ? 6 : 12,
        justifyContent: "center",
        padding: 16,
      }}
    >
      {avatar}
      {!compact && (
        <>
          <Text
            numberOfLines={1}
            style={{
              color: theme.contentColor,
              fontSize: 24,
              fontWeight: "700",
            }}
          >
            {displayName}
          </Text>
          <Text style={{ color: theme.mutedContentColor, fontSize: 15 }}>
            {status}
          </Text>
        </>
      )}
    </View>
  );
}

export function CallVideoContent({
  session,
  theme,
  compact,
}: CallVideoContentProps) {
  const showRemoteVideo =
    session.remoteVideo != null && session.remoteCameraEnabled !== false;
  const status =
    session.statusText ??
    (session.connectionState === "connected"
      ? "Ongoing call"
      : session.connectionState === "ringing"
        ? "Calling…"
        : session.connectionState === "reconnecting"
          ? "Reconnecting…"
          : "Connecting…");

  return (
    <View
      style={{
        backgroundColor: theme.backgroundColor,
        flex: 1,
        overflow: "hidden",
      }}
    >
      {session.remoteVideo != null && (
        <View
          pointerEvents="none"
          style={{
            bottom: 0,
            left: 0,
            opacity: showRemoteVideo ? 1 : 0,
            position: "absolute",
            right: 0,
            top: 0,
          }}
        >
          {session.remoteVideo}
        </View>
      )}
      {!showRemoteVideo && (
        <FallbackIdentity
          avatar={session.avatar}
          compact={compact}
          displayName={session.displayName}
          status={status}
          theme={theme}
        />
      )}
      <MuteBadge muted={session.localMuted} side="left" theme={theme} />
      <MuteBadge muted={session.remoteMuted} side="right" theme={theme} />
    </View>
  );
}

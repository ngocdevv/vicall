import { Pressable, Text, View } from "react-native";
import type { EdgeInsets } from "react-native-safe-area-context";

import { CallControlButton } from "./call-control-button";
import type {
  CallPresentationTheme,
  HybridCallSession,
} from "./call-presentation.types";

interface CallChromeProps {
  insets: EdgeInsets;
  session: HybridCallSession;
  theme: CallPresentationTheme;
  onMinimize(): void;
  onInteraction(): void;
  onEndCall(): void;
}

function invoke(action: (() => void | Promise<void>) | undefined): void {
  if (action == null) return;
  void action();
}

export function CallChrome({
  insets,
  session,
  theme,
  onMinimize,
  onInteraction,
  onEndCall,
}: CallChromeProps) {
  const status =
    session.statusText ??
    (session.connectionState === "connected"
      ? "Ongoing call"
      : session.connectionState === "reconnecting"
        ? "Reconnecting…"
        : session.connectionState === "connecting"
          ? "Connecting…"
          : "Calling…");

  return (
    <View
      pointerEvents="box-none"
      style={{ bottom: 0, left: 0, position: "absolute", right: 0, top: 0 }}
    >
      <View
        style={{
          alignItems: "center",
          flexDirection: "row",
          gap: 12,
          left: 16,
          paddingTop: Math.max(insets.top, 12),
          position: "absolute",
          right: 16,
          top: 0,
        }}
      >
        <Pressable
          accessibilityLabel="Minimize call"
          accessibilityRole="button"
          hitSlop={10}
          onPress={() => {
            onInteraction();
            onMinimize();
          }}
          style={({ pressed }) => ({
            alignItems: "center",
            backgroundColor: theme.chromeMutedColor,
            borderRadius: 21,
            height: 42,
            justifyContent: "center",
            opacity: pressed ? 0.7 : 1,
            width: 42,
          })}
        >
          <Text
            style={{ color: theme.contentColor, fontSize: 28, lineHeight: 30 }}
          >
            ⌄
          </Text>
        </Pressable>

        <View
          style={{
            backgroundColor: theme.chromeColor,
            borderCurve: "continuous",
            borderRadius: 18,
            flex: 1,
            gap: 1,
            minHeight: 54,
            paddingHorizontal: 16,
            paddingVertical: 8,
          }}
        >
          <Text
            numberOfLines={1}
            style={{
              color: theme.contentColor,
              fontSize: 17,
              fontWeight: "700",
            }}
          >
            {session.displayName}
          </Text>
          <Text
            numberOfLines={1}
            style={{ color: theme.mutedContentColor, fontSize: 12 }}
          >
            {status}
          </Text>
        </View>

        {session.onAddParticipant != null && (
          <CallControlButton
            accessibilityLabel="Add participant"
            compact
            control="addParticipant"
            icon={session.renderControlIcon?.("addParticipant", false)}
            onPress={() => {
              onInteraction();
              invoke(session.onAddParticipant);
            }}
            theme={theme}
          />
        )}
        {session.onMore != null && (
          <CallControlButton
            accessibilityLabel="More call options"
            compact
            control="more"
            icon={session.renderControlIcon?.("more", false)}
            onPress={() => {
              onInteraction();
              invoke(session.onMore);
            }}
            theme={theme}
          />
        )}
      </View>

      <View
        style={{
          alignItems: "center",
          bottom: Math.max(insets.bottom, 16) + 8,
          gap: 12,
          left: 16,
          position: "absolute",
          right: 16,
        }}
      >
        {session.renderAccessoryControls?.()}
        <View
          style={{
            alignItems: "center",
            flexDirection: "row",
            gap: 12,
            justifyContent: "center",
          }}
        >
          <CallControlButton
            accessibilityLabel={
              session.localCameraEnabled === false
                ? "Turn camera on"
                : "Turn camera off"
            }
            active={session.localCameraEnabled === false}
            control="camera"
            disabled={session.onToggleCamera == null}
            icon={session.renderControlIcon?.(
              "camera",
              session.localCameraEnabled === false,
            )}
            onPress={() => {
              onInteraction();
              invoke(session.onToggleCamera);
            }}
            theme={theme}
          />
          <CallControlButton
            accessibilityLabel={session.localMuted ? "Unmute" : "Mute"}
            active={session.localMuted}
            control="microphone"
            disabled={session.onToggleMicrophone == null}
            icon={session.renderControlIcon?.(
              "microphone",
              session.localMuted === true,
            )}
            onPress={() => {
              onInteraction();
              invoke(session.onToggleMicrophone);
            }}
            theme={theme}
          />
          <CallControlButton
            accessibilityLabel="Switch camera"
            control="switchCamera"
            disabled={session.onSwitchCamera == null}
            icon={session.renderControlIcon?.("switchCamera", false)}
            onPress={() => {
              onInteraction();
              invoke(session.onSwitchCamera);
            }}
            theme={theme}
          />
          <CallControlButton
            accessibilityLabel="End call"
            control="end"
            destructive
            icon={session.renderControlIcon?.("end", false)}
            onPress={onEndCall}
            theme={theme}
          />
        </View>
      </View>
    </View>
  );
}

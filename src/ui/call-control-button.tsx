import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

import type {
  CallControlName,
  CallPresentationTheme,
} from "./call-presentation.types";

const fallbackGlyphs: Record<CallControlName, string> = {
  camera: "▰",
  microphone: "●",
  switchCamera: "↻",
  more: "•••",
  addParticipant: "+",
  end: "⌢",
};

interface CallControlButtonProps {
  control: CallControlName;
  accessibilityLabel: string;
  theme: CallPresentationTheme;
  active?: boolean;
  destructive?: boolean;
  compact?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
  onPress?: () => void;
}

export function CallControlButton({
  control,
  accessibilityLabel,
  theme,
  active = false,
  destructive = false,
  compact = false,
  disabled = false,
  icon,
  onPress,
}: CallControlButtonProps) {
  const size = compact ? 42 : 56;
  const backgroundColor = destructive
    ? theme.destructiveColor
    : active
      ? theme.controlActiveColor
      : theme.controlColor;
  const color = active ? theme.controlActiveContentColor : theme.contentColor;

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled, selected: active }}
      disabled={disabled}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => ({
        alignItems: "center",
        backgroundColor,
        borderCurve: "continuous",
        borderRadius: size / 2,
        height: size,
        justifyContent: "center",
        opacity: disabled ? 0.4 : pressed ? 0.72 : 1,
        transform: [{ scale: pressed ? 0.94 : 1 }],
        width: size,
      })}
    >
      {icon ?? (
        <View
          style={{
            alignItems: "center",
            justifyContent: "center",
            transform: control === "end" ? [{ rotate: "180deg" }] : undefined,
          }}
        >
          <Text
            style={{
              color,
              fontSize: compact ? 18 : 21,
              fontWeight: "700",
              letterSpacing: control === "more" ? 1 : 0,
            }}
          >
            {fallbackGlyphs[control]}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

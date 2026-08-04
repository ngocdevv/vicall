import type { ReactNode } from "react";
import type { CallControlName, CallPresentationTheme } from "./call-presentation.types";
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
export declare function CallControlButton({ control, accessibilityLabel, theme, active, destructive, compact, disabled, icon, onPress, }: CallControlButtonProps): import("react").JSX.Element;
export {};
//# sourceMappingURL=call-control-button.d.ts.map
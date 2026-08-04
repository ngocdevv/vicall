import type { CallPresentationTheme, HybridCallSession } from "./call-presentation.types";
interface MuteBadgeProps {
    muted: boolean | undefined;
    side: "left" | "right";
    theme: CallPresentationTheme;
}
export declare function MuteBadge({ muted, side, theme }: MuteBadgeProps): import("react").JSX.Element | null;
interface CallVideoContentProps {
    session: HybridCallSession;
    theme: CallPresentationTheme;
    compact: boolean;
}
export declare function CallVideoContent({ session, theme, compact, }: CallVideoContentProps): import("react").JSX.Element;
export {};
//# sourceMappingURL=call-video-content.d.ts.map
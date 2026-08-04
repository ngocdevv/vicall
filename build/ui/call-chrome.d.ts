import type { EdgeInsets } from "react-native-safe-area-context";
import type { CallPresentationTheme, HybridCallSession } from "./call-presentation.types";
interface CallChromeProps {
    insets: EdgeInsets;
    session: HybridCallSession;
    theme: CallPresentationTheme;
    onMinimize(): void;
    onInteraction(): void;
    onEndCall(): void;
}
export declare function CallChrome({ insets, session, theme, onMinimize, onInteraction, onEndCall, }: CallChromeProps): import("react").JSX.Element;
export {};
//# sourceMappingURL=call-chrome.d.ts.map
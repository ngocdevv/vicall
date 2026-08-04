import { createContext, use } from "react";
export const CallPresentationContext = createContext(null);
export function useCallPresentation() {
    const value = use(CallPresentationContext);
    if (value == null) {
        throw new Error("useCallPresentation must be used within CallPresentationProvider");
    }
    return value;
}
//# sourceMappingURL=call-presentation-context.js.map
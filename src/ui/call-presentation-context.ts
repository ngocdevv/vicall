import { createContext, use } from "react";

import type { CallPresentationContextValue } from "./call-presentation.types";

export const CallPresentationContext =
  createContext<CallPresentationContextValue | null>(null);

export function useCallPresentation(): CallPresentationContextValue {
  const value = use(CallPresentationContext);
  if (value == null) {
    throw new Error(
      "useCallPresentation must be used within CallPresentationProvider",
    );
  }
  return value;
}

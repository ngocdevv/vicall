/**
 * Canonical bootstrap sequence for React Native hosts.
 *
 * Native call events can arrive before the JS runtime is ready. Subscribing
 * before draining the buffer prevents races where a live event is both
 * buffered and missed by a late listener.
 */
export const NATIVE_CALL_BOOTSTRAP_ORDER = [
  "setup",
  "addListener",
  "getInitialEvents",
  "handleInitialEvents",
  "clearInitialEvents",
] as const;

export type NativeCallBootstrapStep =
  (typeof NATIVE_CALL_BOOTSTRAP_ORDER)[number];

export function createNativeCallBootstrapOrder(): readonly NativeCallBootstrapStep[] {
  return NATIVE_CALL_BOOTSTRAP_ORDER;
}

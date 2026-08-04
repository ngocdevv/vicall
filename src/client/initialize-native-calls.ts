import type { CallEvent } from "../ExpoVicallCallManager.types";
import CallManager from "../ExpoVicallCallManagerModule";
import {
  NATIVE_CALL_BOOTSTRAP_ORDER,
  createNativeCallBootstrapOrder,
  type NativeCallBootstrapStep,
} from "./bootstrap-order";

export { NATIVE_CALL_BOOTSTRAP_ORDER, createNativeCallBootstrapOrder };
export type { NativeCallBootstrapStep };

export type NativeCallEventHandler = (event: CallEvent) => void | Promise<void>;

export interface InitializeNativeCallsOptions {
  /**
   * Invoked for every buffered event and every live event after subscription.
   * Keep this handler idempotent for `callId` + `type` when possible.
   */
  onEvent: NativeCallEventHandler;
  /**
   * When false, skips `CallManager.setup()`. Default true.
   * Useful in tests or when setup already ran at app launch.
   */
  setup?: boolean;
}

export interface NativeCallSubscription {
  remove(): void;
}

/**
 * Initializes native call integration for a React Native application.
 *
 * Recommended call site: root layout / app bootstrap, once per process.
 *
 * Order is fixed by {@link NATIVE_CALL_BOOTSTRAP_ORDER}:
 * setup → addListener → getInitialEvents → handleInitialEvents → clearInitialEvents.
 */
export async function initializeNativeCalls(
  options: InitializeNativeCallsOptions | NativeCallEventHandler,
): Promise<NativeCallSubscription> {
  const normalized: InitializeNativeCallsOptions =
    typeof options === "function" ? { onEvent: options } : options;
  const { onEvent, setup = true } = normalized;

  if (setup) {
    await CallManager.setup();
  }

  const subscription = CallManager.addListener(
    "onCallEvent",
    (event: CallEvent) => {
      Promise.resolve(onEvent(event)).catch(() => {
        // Host apps should wrap onEvent with their own error reporting.
      });
    },
  );

  const initialEvents = await CallManager.getInitialEvents();
  for (const event of initialEvents) {
    await onEvent(event);
  }
  await CallManager.clearInitialEvents();

  return {
    remove() {
      subscription.remove();
    },
  };
}

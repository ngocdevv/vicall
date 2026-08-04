export { default } from "./ExpoVicallCallManagerModule";
export * from "./ExpoVicallCallManager.types";

// Service protocol contracts (also available via "expo-vicall-call-manager/protocol").
export * from "./protocol";

// Pure helpers safe for unit tests / host UI state machines.
export {
  NATIVE_CALL_BOOTSTRAP_ORDER,
  createCallEventRouter,
  createInitialCallLifecycleState,
  createNativeCallBootstrapOrder,
  createSocialCallSession,
  reduceCallLifecycle,
} from "./client/bootstrap-and-router";
export type {
  CallLifecycleInput,
  CallLifecyclePhase,
  CallLifecycleState,
  CreateCallEventRouterOptions,
  CreateSocialCallSessionOptions,
  HostCallUiActions,
  MediaCallActions,
  NativeCallBootstrapStep,
  SocialCallSession,
} from "./client/bootstrap-and-router";

// React Native host helpers (require Expo native runtime).
export {
  NativeCallController,
  createNativeCallEventRouter,
  initializeNativeCalls,
} from "./client/native-host";
export type {
  InitializeNativeCallsOptions,
  NativeCallEventHandler,
  NativeCallSubscription,
} from "./client/initialize-native-calls";

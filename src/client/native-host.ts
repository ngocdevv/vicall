/**
 * React Native host entry helpers that touch the Expo native module.
 * Imported by app runtime code, not by pure Node protocol tests.
 */
export { initializeNativeCalls } from "./initialize-native-calls";
export {
  NativeCallController,
  createNativeCallEventRouter,
} from "./native-call-controller";

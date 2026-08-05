import { requireNativeModule } from "expo";
let cachedModule;
/**
 * Lazily resolve the native module so importing pure JS helpers
 * (protocol / lifecycle) does not crash before the Expo runtime is ready.
 * Still throws a clear error when native APIs are actually invoked without
 * a development build that autolinks ExpoVicallCallManager.
 */
function getNativeModule() {
    if (cachedModule)
        return cachedModule;
    try {
        cachedModule = requireNativeModule("ExpoVicallCallManager");
        return cachedModule;
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error([
            "Native module ExpoVicallCallManager is unavailable.",
            "Ensure expo-vicall-call-manager is autolinked (not nested under another package's node_modules)",
            "and rebuild the dev client after prebuild/pod install.",
            `Underlying error: ${message}`,
        ].join(" "));
    }
}
const CallManager = new Proxy({}, {
    get(_target, property, receiver) {
        const mod = getNativeModule();
        const value = Reflect.get(mod, property, receiver);
        return typeof value === "function" ? value.bind(mod) : value;
    },
});
export default CallManager;
//# sourceMappingURL=ExpoVicallCallManagerModule.js.map
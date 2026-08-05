# iOS Installation

This module targets **Expo development builds** (Expo Modules + config plugin). It does not run in Expo Go.

Minimum iOS version: **16.4** (see `ExpoVicallCallManager.podspec`).

## Expo / automatic setup (recommended)

1. Install dependencies:

```sh
npx expo install expo-notifications
npm install expo-vicall-call-manager
```

2. Add the config plugin after `expo-notifications` (see [README — Expo config plugin](../README.md#Expo-config-plugin)).

3. Prebuild and run on a **physical device**:

```sh
npx expo prebuild --clean
npx expo run:ios --device
```

The plugin writes CallKit settings into `Info.plist` under `VicallCallManager` and, when enabled, adds background modes:

```xml
<key>UIBackgroundModes</key>
<array>
  <string>voip</string>
  <string>remote-notification</string>
  <string>audio</string>
</array>
```

(`audio` is added when Picture in Picture is enabled.)

## CocoaPods

Expo prebuild links the pod automatically via Expo Modules. If you maintain a bare workflow `Podfile`, ensure Expo autolinking is enabled (default for Expo projects):

```ruby
# ios/Podfile — Expo template already includes use_expo_modules!
use_expo_modules!
```

Then:

```sh
cd ios
pod install
```

The native pod `ExpoVicallCallManager` depends on:

- `ExpoModulesCore`
- `react-native-webrtc` (CocoaPod name used by `@cloudflare/react-native-webrtc`)
- Frameworks: `AVFoundation`, `AVKit`, `CallKit`, `CoreImage`, `PushKit`

## Common installation steps

### 1. Background modes

Required for VoIP wake-ups when `enableVoipPush: true`:

- `voip`
- `remote-notification` (optional companion)

Required for continuous audio / PiP when `enablePictureInPicture: true`:

- `audio`

The config plugin manages these keys. If you edit `Info.plist` manually, keep them in sync.

### 2. Push Notifications capability

In Apple Developer / Xcode:

1. Enable **Push Notifications**.
2. Enable **Background Modes → Voice over IP**.
3. Create an APNs key (or certificate) that can send **VoIP** pushes to topic `<bundle-id>.voip`.

### 3. VoIP services certificate / key

Your backend must send APNs payloads with:

- `apns-push-type: voip`
- `apns-topic: <bundle-id>.voip`
- `apns-priority: 10`
- short expiration

See [README — PushKit](../README.md#PushKit-iOS-VoIP) and [SERVICE_INTEGRATION.md](./SERVICE_INTEGRATION.md).

### 4. AppDelegate / early setup

Unlike `react-native-callkeep`, you do **not** need to call setup from `AppDelegate` for PushKit reporting. This module:

- registers PushKit natively when `enableVoipPush` is true
- reports the incoming call to CallKit **before** completing the PushKit callback
- buffers `CallEvent`s until JS subscribes via `initializeNativeCalls` / `getInitialEvents`

Still call JS bootstrap early in app launch:

```ts
await initializeNativeCalls((event) => session.handleEvent(event));
```

### 5. Microphone / camera usage descriptions

If your product uses audio/video calls, ensure `Info.plist` includes:

- `NSMicrophoneUsageDescription`
- `NSCameraUsageDescription` (video)

These are usually provided by your app or media SDK config plugins, not by this module alone.

## Manual bare verification checklist

After `prebuild`, confirm:

| Item | Expected |
| --- | --- |
| Pod | `ExpoVicallCallManager` present in `Podfile.lock` |
| Frameworks | CallKit + PushKit linked via the podspec |
| `Info.plist` | `VicallCallManager` dictionary with `appName`, etc. |
| `UIBackgroundModes` | includes `voip` when VoIP is enabled |
| Device | physical iPhone (CallKit does not work on Simulator) |

## Related

- [README](../README.md)
- [Architecture](./ARCHITECTURE.md)
- [Service integration](./SERVICE_INTEGRATION.md)

# Android Installation

This module targets **Expo development builds** (Expo Modules + config plugin). It does not run in Expo Go.

Android always runs in **self-managed** Telecom mode (`ConnectionService` + CallStyle + `phoneCall` foreground service).

## Expo / automatic setup (recommended)

1. Install dependencies:

```sh
npx expo install expo-notifications
npm install expo-vicall-call-manager
```

2. Add the config plugin **after** `expo-notifications` (see [README — Expo config plugin](../README.md#Expo-config-plugin)).

Important plugin fields:

- `androidNotificationChannelId` / `androidNotificationChannelName`
- `androidNotificationIcon` — resource name only (white monochrome drawable/mipmap). **Do not** include `@drawable/`.

Example icon asset: place a white monochrome PNG as `android/app/src/main/res/drawable/notification_call.png` (or provide it via your app’s resource pipeline before prebuild), then set:

```ts
androidNotificationIcon: 'notification_call'
```

3. Prebuild and run on a **physical device**:

```sh
npx expo prebuild --clean
npx expo run:android --device
```

## What the config plugin configures

### 1. Manifest metadata

Writes application meta-data used by the native module:

- `expo.modules.vicallcallmanager.APP_NAME`
- `expo.modules.vicallcallmanager.SUPPORTS_VIDEO`
- `expo.modules.vicallcallmanager.CHANNEL_ID`
- `expo.modules.vicallcallmanager.CHANNEL_NAME`
- `expo.modules.vicallcallmanager.NOTIFICATION_ICON`

### 2. FCM service swap

Replaces Expo’s default Firebase messaging service with:

`expo.modules.vicallcallmanager.VicallFirebaseMessagingService`

so incoming-call data messages can be intercepted **natively** while all other FCM messages are forwarded to `expo-notifications`.

### 3. Picture in Picture (optional)

When `enablePictureInPicture: true`:

- sets `android:supportsPictureInPicture="true"` on the main activity
- expands `android:configChanges` for PiP-safe configuration changes
- injects `onPictureInPictureModeChanged`, `onUserLeaveHint`, and `onPause` handoffs into `MainActivity`

## Permissions and services (module manifest)

The library ships these entries in its AndroidManifest (merged into the app):

```xml
<uses-permission android:name="android.permission.MANAGE_OWN_CALLS" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
<uses-permission android:name="android.permission.USE_FULL_SCREEN_INTENT" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_PHONE_CALL" />

<application>
  <service
    android:name="expo.modules.vicallcallmanager.VicallConnectionService"
    android:exported="true"
    android:permission="android.permission.BIND_TELECOM_CONNECTION_SERVICE">
    <intent-filter>
      <action android:name="android.telecom.ConnectionService" />
    </intent-filter>
  </service>

  <service
    android:name="expo.modules.vicallcallmanager.VicallCallForegroundService"
    android:exported="false"
    android:foregroundServiceType="phoneCall" />

  <receiver
    android:name="expo.modules.vicallcallmanager.VicallCallActionReceiver"
    android:exported="false" />
</application>
```

Your media SDK / app is still responsible for microphone (and camera) capture permissions used by WebRTC.

## Runtime permissions

### Notification permission (Android 13+)

Request via `expo-notifications` before relying on CallStyle UI:

```ts
import * as Notifications from 'expo-notifications';

await Notifications.requestPermissionsAsync();
```

### Full-screen intent (Android 14+)

```ts
import CallManager from 'expo-vicall-call-manager';

if (!(await CallManager.canUseFullScreenIntent())) {
  await CallManager.openFullScreenIntentSettings();
}
```

## FCM token registration

Use the **native FCM device token**, not the Expo push token:

```ts
import * as Notifications from 'expo-notifications';

const nativeFcmToken = (await Notifications.getDevicePushTokenAsync()).data;
```

Send call wake-ups through **FCM HTTP v1** with high priority. See [README — Android FCM](../README.md#Android-FCM).

## Bare / manual verification checklist

After `prebuild`, confirm:

| Item | Expected |
| --- | --- |
| Autolinking | `expo-vicall-call-manager` present in native project |
| ConnectionService | `VicallConnectionService` in merged manifest |
| FGS | `VicallCallForegroundService` with `phoneCall` type |
| FCM | `VicallFirebaseMessagingService` registered; Expo default service removed/replaced |
| Icon | monochrome notification icon resource resolves |
| Device | physical phone (Telecom self-managed UX is not reliable on emulators) |

## Self-managed notes

- This library is **always** self-managed on Android (no managed ConnectionService UI path).
- On incoming FCM `vicallType=incoming_call`, native code displays Telecom + CallStyle UI even if JS is dead.
- After the user answers and your media session is live, call `setCallActive(callId)` (or use `createNativeCallEventRouter` / `createSocialCallSession`, which do this after `media.accept`).
- Cancel races (`cancel_call` before connection create) are buffered natively for ~30s.

## Related

- [README](../README.md)
- [Architecture](./ARCHITECTURE.md)
- [Service integration](./SERVICE_INTEGRATION.md)

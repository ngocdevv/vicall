# expo-vicall-call-manager

Native **system-call** engine for audio/video calls on Expo SDK 56 and React Native 0.85
(New Architecture only).

Designed like large social clients (e.g. X): this module owns **OS call UX**
(CallKit / Telecom / VoIP wake-ups). **Your app owns the in-call UI** and media
SDK. It does not force a product call screen.

- iOS: CallKit, PushKit, optional system PiP APIs, early native event buffering.
- Android: self-managed `ConnectionService`, `CallStyle` notification,
  full-screen intent, optional system PiP APIs, `phoneCall` foreground service.
- Notifications: incoming-call FCM data is intercepted natively; every other
  FCM message is forwarded to `expo-notifications`.
- Service protocol + lifecycle helpers so backends and RN hosts share one contract.

**Architecture (X-style split):** [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)  
**Service ↔ RN contract:** [docs/SERVICE_INTEGRATION.md](./docs/SERVICE_INTEGRATION.md)

CallKit and Android Telecom must be tested on physical devices.

## Package entry points

| Import | Purpose |
| --- | --- |
| `expo-vicall-call-manager` | **Core**: native module + protocol + lifecycle/session helpers |
| `expo-vicall-call-manager/protocol` | Backend-safe payload builders/parsers (no native) |
| `expo-vicall-call-manager/client` | RN bootstrap, router, social session, controller |

## Install

Core system-call integration (recommended for product apps that own UI):

```sh
npx expo install expo-notifications
npm install expo-vicall-call-manager
```

WebRTC is optional for the core bridge; install `@cloudflare/react-native-webrtc`
when you bind tracks or use system PiP APIs.

Add the plugin after `expo-notifications`:

```ts
// app.config.ts
export default {
  expo: {
    name: "Vicall",
    plugins: [
      "expo-notifications",
      [
        "expo-vicall-call-manager",
        {
          appName: "Vicall",
          supportsVideo: true,
          enablePictureInPicture: true,
          includesCallsInRecents: false,
          maximumCallGroups: 1,
          maximumCallsPerCallGroup: 1,
          enableVoipPush: true,
          androidNotificationChannelId: "vicall_calls",
          androidNotificationChannelName: "Calls",
          androidNotificationIcon: "notification_call"
        }
      ]
    ]
  }
};
```

`androidNotificationIcon` must be the name of a white monochrome drawable or
mipmap resource. Do not include `@drawable/` in the value.

Generate and install a development build. This module cannot run in Expo Go.

```sh
npx expo prebuild --clean
npx expo run:ios --device
npx expo run:android --device
```

## Initialize (React Native host — X-style)

The host app owns in-call screens. The module only drives system call UX and
emits lifecycle events:

```ts
import {
  initializeNativeCalls,
  createSocialCallSession,
  NativeCallController,
} from "expo-vicall-call-manager";

const session = createSocialCallSession({
  media: {
    async accept(callId) {
      const credentials = await acceptCallOnWorker(callId);
      await joinRealtimeKit(credentials);
    },
    async end(callId) {
      await leaveRealtimeKit();
      await endCallOnWorker(callId);
    },
    async setMicrophoneEnabled(enabled) {
      await setRealtimeKitMicrophoneEnabled(enabled);
    },
    async setHeld(held) {
      await setRealtimeKitAudioEnabled(!held);
    },
    async onVoipTokenUpdated(token) {
      await registerVoipToken(token);
    },
  },
  ui: {
    presentInCallUi(callId, _event, state) {
      // YOUR screen — audio or video based on state.hasVideo
      navigation.navigate("CallScreen", {
        callId,
        hasVideo: state.hasVideo,
        displayName: state.displayName,
      });
    },
    dismissInCallUi() {
      navigation.navigate("Home");
    },
  },
  setCallActive: (callId) => NativeCallController.setCallActive(callId),
});

const subscription = await initializeNativeCalls((event) =>
  session.handleEvent(event),
);
// later: subscription.remove();
```

Lower-level alternative (manual event routing):

```ts
import {
  initializeNativeCalls,
  createNativeCallEventRouter,
  NativeCallController,
  reduceCallLifecycle,
  createInitialCallLifecycleState,
} from "expo-vicall-call-manager";

let lifecycle = createInitialCallLifecycleState();
const handleEvent = createNativeCallEventRouter({
  media: {
    async accept(callId) {
      const credentials = await acceptCallOnWorker(callId);
      await joinRealtimeKit(credentials);
    },
    async end(callId) {
      await leaveRealtimeKit();
      await endCallOnWorker(callId);
    },
    async setMicrophoneEnabled(enabled) {
      await setRealtimeKitMicrophoneEnabled(enabled);
    },
    async setHeld(held) {
      await setRealtimeKitAudioEnabled(!held);
    },
    async onVoipTokenUpdated(token) {
      await registerVoipToken(token);
    },
  },
  setCallActive: (callId) => NativeCallController.setCallActive(callId),
});

const subscription = await initializeNativeCalls(async (event) => {
  lifecycle = reduceCallLifecycle(lifecycle, event);
  if (lifecycle.shouldPresentAppCallUi) {
    // open YOUR call UI
  }
  await handleEvent(event);
});
```

Equivalent manual bootstrap (must preserve order):

```ts
import CallManager from "expo-vicall-call-manager";

await CallManager.setup();
const subscription = CallManager.addListener("onCallEvent", handleEvent);
for (const event of await CallManager.getInitialEvents()) {
  await handleEvent(event);
}
await CallManager.clearInitialEvents();
```

Use the same RFC 4122 UUID for the Supabase `calls.id`, native call UI,
Cloudflare Worker signaling, and the RealtimeKit meeting mapping.

```ts
await NativeCallController.startCall({
  callId,
  handle: calleeUserId,
  displayName: calleeDisplayName,
  hasVideo: true,
  metadata: {
    conversationId,
  },
});
```

## Backend / service payloads

Share validators with the mobile app:

```ts
import {
  buildAndroidIncomingCallFcmData,
  buildAndroidCancelCallFcmData,
  buildIosVoipPushPayload,
  parseAndroidIncomingCallData,
  validateCallId,
} from "expo-vicall-call-manager/protocol";

validateCallId(callId);

const iosBody = buildIosVoipPushPayload({
  callId,
  handle: callerUserId,
  displayName: callerName,
  hasVideo: true,
  metadata: { conversationId },
});

const androidData = buildAndroidIncomingCallFcmData({
  callId,
  handle: callerUserId,
  displayName: callerName,
  hasVideo: true,
  metadata: { conversationId },
});

const cancelData = buildAndroidCancelCallFcmData(callId, "answeredElsewhere");
```

Never put RealtimeKit participant tokens, Supabase JWTs, or media URLs in push
payloads. The app must fetch short-lived media credentials from the Worker after
the user accepts.

See [docs/SERVICE_INTEGRATION.md](./docs/SERVICE_INTEGRATION.md) for the full
ownership matrix, sequence diagram, and event catalog.

## iOS VoIP push

`getVoipPushToken()` returns the APNs VoIP device token. It is not an Expo push
token and must be stored separately on the server.

```ts
const voipToken = await CallManager.getVoipPushToken();
```

Token rotations are also emitted as:

```ts
{
  type: "voipTokenUpdated",
  token: "..."
}
```

Worker sends this JSON through APNs with push type `voip`, topic
`<bundle-id>.voip`, priority `10`, and a short expiration:

```json
{
  "aps": {
    "content-available": 1
  },
  "callId": "c8cc3ab6-3e1d-4f2b-aa49-f93ee9c75ff3",
  "handle": "user_01",
  "callerName": "Ngoc",
  "hasVideo": true,
  "metadata": {
    "conversationId": "5dc50ea7-31cd-457d-bb75-0310c9124a9c"
  }
}
```

The PushKit delegate reports the call to CallKit before completing the native
push callback, even when React Native has not started.

## Android FCM

Normal notifications still use `expo-notifications`. The config plugin replaces
Expo's FCM service with a subclass that intercepts only these call data
messages:

Register the native FCM token separately from the Expo push token:

```ts
import * as Notifications from "expo-notifications";

const nativeFcmToken = (await Notifications.getDevicePushTokenAsync()).data;
```

```json
{
  "message": {
    "token": "<native-fcm-token>",
    "android": {
      "priority": "high",
      "ttl": "30s"
    },
    "data": {
      "vicallType": "incoming_call",
      "callId": "c8cc3ab6-3e1d-4f2b-aa49-f93ee9c75ff3",
      "handle": "user_01",
      "displayName": "Ngoc",
      "hasVideo": "true",
      "metadata": "{\"conversationId\":\"5dc50ea7-31cd-457d-bb75-0310c9124a9c\"}"
    }
  }
}
```

Cancel a ringing call or report that it was answered elsewhere:

```json
{
  "data": {
    "vicallType": "cancel_call",
    "callId": "c8cc3ab6-3e1d-4f2b-aa49-f93ee9c75ff3",
    "reason": "answeredElsewhere"
  }
}
```

All FCM `data` values must be strings. Worker should send incoming-call
messages directly through FCM HTTP v1 rather than Expo Push Service.

On Android 13+, request notification permission through `expo-notifications`.
On Android 14+, call `canUseFullScreenIntent()` and offer
`openFullScreenIntentSettings()` when the user has disabled full-screen call
notifications.

## Video-call Picture in Picture

This package exposes system PiP on iOS 16.4+ and Android 8.0+ when the device
reports support. Pass the native tag of the remote `RTCView`; both platforms
attach a second renderer to the same WebRTC track, while its view bounds are
used as the transition source hint.

```tsx
import type { ComponentRef } from "react";
import { useEffect, useRef } from "react";
import { findNodeHandle } from "react-native";
import { RTCView } from "@cloudflare/react-native-webrtc";
import CallManager, {
  type PictureInPictureEvent,
} from "expo-vicall-call-manager";

export function RemoteVideo({ streamURL }: { streamURL: string }) {
  const remoteVideoRef = useRef<ComponentRef<typeof RTCView>>(null);

  useEffect(() => {
    const subscription = CallManager.addListener(
      "onPictureInPictureEvent",
      (event: PictureInPictureEvent) => {
        // Hide controls while Android PiP is active. On iOS, restore the call
        // route when event.type === "restoreRequested".
        console.log(event);
      },
    );
    return () => subscription.remove();
  }, []);

  async function preparePiP() {
    const remoteTag = findNodeHandle(remoteVideoRef.current);
    if (remoteTag == null) throw new Error("Remote RTCView is not mounted");

    await CallManager.preparePictureInPicture(remoteTag, null, {
      aspectRatioWidth: 9,
      aspectRatioHeight: 16,
      autoEnterEnabled: true,
      seamlessResizeEnabled: true,
    });
  }

  return (
    <RTCView
      ref={remoteVideoRef}
      streamURL={streamURL}
      objectFit="cover"
      style={{ flex: 1 }}
      onLayout={preparePiP}
    />
  );
}
```

If the local camera must remain active on iOS while the app is in PiP, pass its
native `RTCView` tag as the second argument. The module enables multitasking
camera access when the capture session supports it:

```ts
await CallManager.preparePictureInPicture(remoteTag, localTag, {
  autoEnterEnabled: true,
});
```

Do not disable the camera or leave RealtimeKit merely because React Native's
`AppState` changes to `inactive` or `background`; first check
`isPictureInPictureActive()`. When RealtimeKit replaces the remote track, call
`refreshPictureInPictureVideoTracks()` with the current tags (or increment the
Hybrid session's `pictureInPicture.revision`). Call
`disposePictureInPicture()` only when the call ends.

Manual controls are also available:

```ts
if (await CallManager.isPictureInPictureSupported()) {
  await CallManager.startPictureInPicture();
}

await CallManager.refreshPictureInPictureVideoTracks(remoteTag, localTag);
await CallManager.stopPictureInPicture();
await CallManager.disposePictureInPicture();
```

On Android, `stopPictureInPicture()` brings the existing single-task Activity
back to the foreground because Android has no direct "exit PiP" method. The
module places its dedicated native video surface above the Activity before the
PiP transition; consumers using the low-level API should still hide custom
controls while the `stateChanged` event is active to support the compatibility
fallback. On iOS, the system video-call PiP window is intentionally
non-interactive.

## Public API

### RN host helpers

| API | Purpose |
| --- | --- |
| `initializeNativeCalls(onEvent \| options)` | Correct cold-start bootstrap: setup → listen → drain buffer → clear |
| `createCallEventRouter({ media, setCallActive })` | Pure router from native events → media callbacks (testable) |
| `createNativeCallEventRouter({ media })` | Same router with default `CallManager.setCallActive` |
| `NativeCallController.*` | Imperative native call UI helpers without platform branching |
| Protocol builders/parsers | `buildIosVoipPushPayload`, `buildAndroidIncomingCallFcmData`, `parse*`, `validateCallId` |

### Native module methods

| Method | Purpose |
| --- | --- |
| `setup()` | Initializes CallKit or registers the self-managed phone account. |
| `displayIncomingCall(call)` | Displays a verified incoming call from an in-app signaling path. |
| `startCall(call)` | Starts an outgoing system call. |
| `answerCall(callId)` | Answers from the app UI. |
| `endCall(callId)` / `endAllCalls()` | Ends local calls. |
| `setMuted(callId, muted)` | Synchronizes native mute state and emits a media command event. |
| `setHeld(callId, held)` | Synchronizes native hold state. |
| `setCallActive(callId)` | Marks Android active; reports an outgoing iOS call connected. |
| `reportCallEnded(callId, reason)` | Reports a server/remote termination reason. |
| `updateCallDisplay(...)` | Updates caller information in the system UI. |
| `getCalls()` | Returns native calls known to this process. |
| `getInitialEvents()` | Reads events raised before JS subscribed. |
| `isPictureInPictureSupported()` / `isPictureInPictureActive()` | Reads native PiP capability and state. |
| `preparePictureInPicture(remoteTag, localTag, options)` | Connects system PiP to the active WebRTC video view. |
| `refreshPictureInPictureVideoTracks(remoteTag, localTag)` | Rebinds active native PiP renderers after RealtimeKit replaces a video track. |
| `startPictureInPicture()` / `stopPictureInPicture()` | Controls system PiP. |
| `setPictureInPictureAutoEnterEnabled(enabled)` | Controls automatic entry when leaving the app. |
| `updatePictureInPictureState(state)` | Updates native PiP camera/mute badges and display fallback. |
| `completePictureInPictureRestore(restored)` | Completes iOS restoration after the React call layout is ready. |
| `disposePictureInPicture()` | Detaches the frame renderer and releases native PiP resources. |
| `getInitialPictureInPictureEvents()` | Reads PiP events raised before JS subscribed. |

Full backend/service contract: [docs/SERVICE_INTEGRATION.md](./docs/SERVICE_INTEGRATION.md).

## Integration contract

The module owns system integration only:

1. Worker creates the Supabase call record and RealtimeKit meeting.
2. Worker sends APNs VoIP or high-priority FCM data.
3. This module displays the native incoming-call UI.
4. On `answer`, mobile calls Worker to validate the call and obtain the
   RealtimeKit participant token.
5. RealtimeKit owns media; Supabase owns durable call state.
6. Worker sends Android `cancel_call`; iOS receives hang-up and
   answered-elsewhere changes over the network connection established after
   the initial PushKit wake-up. Do not use an additional VoIP push as a
   cancellation signal.

Production acceptance tests must include: locked device, app foreground,
background and terminated, declined call, missed call, answered elsewhere,
token rotation, offline accept, Bluetooth route changes, PiP enter/restore/close,
camera on/off while in PiP, rotation and Android OEM battery restrictions.

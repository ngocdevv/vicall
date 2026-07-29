# expo-vicall-call-manager

Native system-call integration for Vicall on Expo SDK 56 and React Native 0.85.
The module is written with Expo Modules API and targets React Native's New
Architecture only.

- iOS: CallKit, PushKit, early native event buffering.
- Android: self-managed `ConnectionService`, `CallStyle` notification,
  full-screen intent, and a `phoneCall` foreground service.
- Notifications: incoming-call FCM data is intercepted natively; every other
  FCM message is forwarded to `expo-notifications`.
- Media: deliberately not included. RealtimeKit remains responsible for
  microphone, camera, and WebRTC media.

CallKit and Android Telecom must be tested on physical devices.

## Install

In the mobile application:

```sh
npx expo install expo-notifications
npm install expo-vicall-call-manager
```

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

## Initialize

Register the event listener before reading early events. Events received while
the JS runtime was unavailable remain in memory until `clearInitialEvents()` is
called.

```ts
import CallManager, {
  type CallEvent,
} from "expo-vicall-call-manager";

export async function initializeNativeCalls(
  handleEvent: (event: CallEvent) => Promise<void> | void,
) {
  await CallManager.setup();

  const subscription = CallManager.addListener(
    "onCallEvent",
    handleEvent,
  );

  const initialEvents = await CallManager.getInitialEvents();
  for (const event of initialEvents) {
    await handleEvent(event);
  }
  await CallManager.clearInitialEvents();

  return () => subscription.remove();
}
```

Use the same RFC 4122 UUID for the Supabase `calls.id`, native call UI,
Cloudflare Worker signaling, and the RealtimeKit meeting mapping.

```ts
await CallManager.startCall({
  callId,
  handle: calleeUserId,
  displayName: calleeDisplayName,
  hasVideo: true,
  metadata: {
    conversationId,
  },
});
```

Typical event handling:

```ts
async function handleCallEvent(event: CallEvent) {
  switch (event.type) {
    case "answer": {
      // Ask Worker to atomically validate the still-ringing call and mint a
      // short-lived RealtimeKit participant token.
      const credentials = await acceptCallOnWorker(event.callId!);
      await joinRealtimeKit(credentials);
      await CallManager.setCallActive(event.callId!);
      break;
    }
    case "mute":
      await setRealtimeKitMicrophoneEnabled(!event.muted);
      break;
    case "hold":
      await setRealtimeKitAudioEnabled(!event.held);
      break;
    case "end":
      await leaveRealtimeKit();
      await endCallOnWorker(event.callId!);
      break;
  }
}
```

Do not place a RealtimeKit participant token, Supabase JWT, or R2 URL in a push
payload. The app must fetch short-lived media credentials from Worker after the
user accepts.

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

## Public API

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
token rotation, offline accept, Bluetooth route changes, and Android OEM
battery restrictions.

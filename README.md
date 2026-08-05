# Expo Vicall Call Manager

[![npm version](https://badge.fury.io/js/expo-vicall-call-manager.svg)](https://badge.fury.io/js/expo-vicall-call-manager)
[![npm downloads](https://img.shields.io/npm/dm/expo-vicall-call-manager.svg?maxAge=2592000)](https://www.npmjs.com/package/expo-vicall-call-manager)

**expo-vicall-call-manager** is a native **system-call** engine for Expo / React Native VoIP apps. It uses **CallKit** on iOS and self-managed **ConnectionService** on Android so you can show OS incoming/outgoing call UI, wake from killed state, and keep an ongoing-call session healthy.

This module owns **OS call UX only**. Your app owns the **in-call product UI** and the media SDK (RealtimeKit / WebRTC). That split matches large social clients (for example X).

For more information about **CallKit** on iOS, see [CallKit](https://developer.apple.com/documentation/callkit) and [PushKit](https://developer.apple.com/documentation/pushkit).

For more information about **ConnectionService** on Android, see [Android Telecom](https://developer.android.com/reference/android/telecom/ConnectionService) and [Build a calling app](https://developer.android.com/guide/topics/connectivity/telecom/selfManaged).

⚠️ **CallKit** and **ConnectionService** are only available on real devices. This library will not work on simulators/emulators for system call UI.

**Requirements:** Expo SDK 56+, React Native 0.85+ (New Architecture), development builds (not Expo Go).

**Architecture (X-style split):** [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)  
**Service ↔ RN contract:** [docs/SERVICE_INTEGRATION.md](./docs/SERVICE_INTEGRATION.md)

# Summary

- [Installation](#Installation)
- [Usage](#Usage)
  - [Package entry points](#Package-entry-points)
  - [Expo config plugin](#Expo-config-plugin)
  - [Setup](#Setup)
  - [Recommended host wiring](#Recommended-host-wiring)
  - [Constants / types](#Constants--types)
  - [Android self-managed mode](#Android-self-managed-mode)
  - [API](#Api)
  - [Events](#Events)
  - [Example](#Example)
- [PushKit (iOS VoIP)](#PushKit-iOS-VoIP)
- [Android FCM](#Android-FCM)
- [Picture in Picture](#Picture-in-Picture)
- [Debug](#Debug)
- [Troubleshooting](#Troubleshooting)
- [Contributing](#Contributing)
- [License](#License)

# Installation

```sh
npx expo install expo-notifications
npm install expo-vicall-call-manager
# or
yarn add expo-vicall-call-manager
```

WebRTC is optional for the core bridge. Install it when you bind tracks or use system PiP APIs:

```sh
npm install @cloudflare/react-native-webrtc
```

- [iOS](docs/ios-installation.md)
- [Android](docs/android-installation.md)

Generate and install a development build:

```sh
npx expo prebuild --clean
npx expo run:ios --device
npx expo run:android --device
```

# Usage

## Package entry points

| Import | Purpose | Loads native? |
| --- | --- | :---: |
| `expo-vicall-call-manager` | Core native module + protocol + host helpers | ✅ |
| `expo-vicall-call-manager/protocol` | Backend-safe payload builders/parsers | ❌ |
| `expo-vicall-call-manager/client` | Bootstrap, router, social session, controller | ✅ |

Use `/protocol` from Cloudflare Workers, Node services, or shared packages that must not depend on Expo runtime.

## Expo config plugin

Add the plugin **after** `expo-notifications` in `app.config.ts` / `app.json`:

```ts
// app.config.ts
export default {
  expo: {
    name: 'Vicall',
    plugins: [
      'expo-notifications',
      [
        'expo-vicall-call-manager',
        {
          appName: 'Vicall',
          supportsVideo: true,
          enablePictureInPicture: true,
          includesCallsInRecents: false,
          maximumCallGroups: 1,
          maximumCallsPerCallGroup: 1,
          enableVoipPush: true,
          androidNotificationChannelId: 'vicall_calls',
          androidNotificationChannelName: 'Calls',
          androidNotificationIcon: 'notification_call',
        },
      ],
    ],
  },
};
```

- `options`: Object
  - `appName`: string (optional, default: Expo app `name`)
    Display name used by system call UI / Android phone account.
  - `supportsVideo`: boolean (optional, default: `true`)
    Whether the application supports video calling.
  - `enablePictureInPicture`: boolean (optional, default: `true`)
    Wires Android PiP activity flags / MainActivity callbacks and iOS `audio` background mode when needed.
  - `includesCallsInRecents`: boolean (optional, default: `false`)
    iOS 11+: show calls in Recents when `true`.
  - `maximumCallGroups`: number (optional, default: `1`)
    Maximum CallKit call groups.
  - `maximumCallsPerCallGroup`: number (optional, default: `1`)
    Maximum calls in a single group (conferencing).
  - `ringtoneSound`: string (optional)
    iOS ringtone resource name. System default when omitted.
  - `enableVoipPush`: boolean (optional, default: `true`)
    Registers PushKit and adds `voip` / `remote-notification` background modes.
  - `androidNotificationChannelId`: string (optional, default: `vicall_calls`)
    Channel id for CallStyle / ongoing call notifications.
  - `androidNotificationChannelName`: string (optional, default: `Calls`)
    Human-readable channel name.
  - `androidNotificationIcon`: string (optional)
    Android resource name of a white monochrome drawable/mipmap. **Do not** include `@drawable/` in the value.

`setup()` reads the values written by the config plugin. There is no JS options object equivalent to CallKeep's `RNCallKeep.setup(options)` — configure once in Expo config, then call `setup()` / `initializeNativeCalls()`.

## Setup

```js
import CallManager from 'expo-vicall-call-manager';

await CallManager.setup();
```

`setup` initializes CallKit (iOS) or registers the self-managed phone account (Android).

Recommended cold-start order (do not skip steps):

1. `setup()`
2. `addListener('onCallEvent', …)`
3. `getInitialEvents()` → handle buffered events
4. `clearInitialEvents()`

Prefer the helper that always preserves that order:

```js
import { initializeNativeCalls } from 'expo-vicall-call-manager';

const subscription = await initializeNativeCalls(async (event) => {
  // handle CallEvent
});

// later
subscription.remove();
```

Equivalent manual bootstrap:

```js
import CallManager from 'expo-vicall-call-manager';

await CallManager.setup();
const subscription = CallManager.addListener('onCallEvent', handleEvent);
for (const event of await CallManager.getInitialEvents()) {
  await handleEvent(event);
}
await CallManager.clearInitialEvents();
```

Use the same **RFC 4122 UUID** for the durable call record, native call UI, push payload, and media meeting mapping.

## Recommended host wiring

The host app owns in-call screens. The module only drives system call UX and emits lifecycle events:

```ts
import {
  initializeNativeCalls,
  createSocialCallSession,
  NativeCallController,
} from 'expo-vicall-call-manager';

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
      navigation.navigate('CallScreen', {
        callId,
        hasVideo: state.hasVideo,
        displayName: state.displayName,
      });
    },
    dismissInCallUi() {
      navigation.navigate('Home');
    },
  },
  setCallActive: (callId) => NativeCallController.setCallActive(callId),
});

const subscription = await initializeNativeCalls((event) =>
  session.handleEvent(event),
);
```

Lower-level alternative (manual event routing):

```ts
import {
  initializeNativeCalls,
  createNativeCallEventRouter,
  NativeCallController,
  reduceCallLifecycle,
  createInitialCallLifecycleState,
} from 'expo-vicall-call-manager';

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

Outgoing call:

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

## Constants / types

End reasons are string unions (not integer constants):

```ts
import type { CallEndReason } from 'expo-vicall-call-manager';

// CallEndReason:
// 'failed' | 'remoteEnded' | 'unanswered' | 'answeredElsewhere' | 'declinedElsewhere' | 'missed'

await CallManager.reportCallEnded(callId, 'remoteEnded');
```

Common types:

```ts
import type {
  CallEvent,
  CallEventType,
  IncomingCall,
  OutgoingCall,
  NativeCall,
  CallHandleType,
  CallMetadata,
  PictureInPictureEvent,
  PictureInPictureOptions,
} from 'expo-vicall-call-manager';
```

- `CallHandleType`: `'generic' | 'phoneNumber' | 'email'`
- `CallMetadata`: `Record<string, string | number | boolean | null>` (JSON-safe; never put media tokens here)
- `CallEventType`: see [Events](#Events)

## Android self-managed mode

_This library always runs Android in self-managed Telecom mode._

Android self-managed calling apps must provide their own UI for managing calls. Vicall implements the system pieces:

- self-managed `ConnectionService`
- `CallStyle` notification + full-screen intent
- `phoneCall` foreground service

Your app still owns the **in-call product screen** after answer (video layout, chrome, reactions, etc.).

Things to keep in mind:

- Incoming-call FCM data is intercepted **natively** (see [Android FCM](#Android-FCM)).
- Call `setCallActive(callId)` after media is ready so the ongoing notification / FGS enter the in-call state.
- On Android 13+, request notification permission through `expo-notifications`.
- On Android 14+, call `canUseFullScreenIntent()` and offer `openFullScreenIntentSettings()` when the user disabled full-screen call notifications.

## API

| Method | Return Type | iOS | Android |
| --- | --- | :---: | :---: |
| [setup()](#setup) | `Promise<void>` | ✅ | ✅ |
| [displayIncomingCall()](#displayIncomingCall) | `Promise<void>` | ✅ | ✅ |
| [startCall()](#startCall) | `Promise<void>` | ✅ | ✅ |
| [answerCall()](#answerCall) | `Promise<void>` | ✅ | ✅ |
| [endCall()](#endCall) | `Promise<void>` | ✅ | ✅ |
| [endAllCalls()](#endAllCalls) | `Promise<void>` | ✅ | ✅ |
| [setMuted()](#setMuted) | `Promise<void>` | ✅ | ✅ |
| [setHeld()](#setHeld) | `Promise<void>` | ✅ | ✅ |
| [setCallActive()](#setCallActive) | `Promise<void>` | ✅ | ✅ |
| [reportOutgoingCallConnecting()](#reportOutgoingCallConnecting) | `Promise<void>` | ✅ | ❌\* |
| [reportOutgoingCallConnected()](#reportOutgoingCallConnected) | `Promise<void>` | ✅ | ❌\* |
| [reportCallEnded()](#reportCallEnded) | `Promise<void>` | ✅ | ✅ |
| [updateCallDisplay()](#updateCallDisplay) | `Promise<void>` | ✅ | ✅ |
| [getCalls()](#getCalls) | `Promise<NativeCall[]>` | ✅ | ✅ |
| [getInitialEvents()](#getInitialEvents) | `Promise<CallEvent[]>` | ✅ | ✅ |
| [clearInitialEvents()](#clearInitialEvents) | `Promise<void>` | ✅ | ✅ |
| [getVoipPushToken()](#getVoipPushToken) | `Promise<string \| null>` | ✅ | ❌ |
| [canUseFullScreenIntent()](#canUseFullScreenIntent) | `Promise<boolean>` | ❌ | ✅ |
| [openFullScreenIntentSettings()](#openFullScreenIntentSettings) | `Promise<void>` | ❌ | ✅ |
| [isPictureInPictureSupported()](#isPictureInPictureSupported) | `Promise<boolean>` | ✅ | ✅ |
| [isPictureInPictureActive()](#isPictureInPictureActive) | `Promise<boolean>` | ✅ | ✅ |
| [preparePictureInPicture()](#preparePictureInPicture) | `Promise<void>` | ✅ | ✅ |
| [refreshPictureInPictureVideoTracks()](#refreshPictureInPictureVideoTracks) | `Promise<void>` | ✅ | ✅ |
| [setPictureInPictureAutoEnterEnabled()](#setPictureInPictureAutoEnterEnabled) | `Promise<void>` | ✅ | ✅ |
| [startPictureInPicture()](#startPictureInPicture) | `Promise<void>` | ✅ | ✅ |
| [stopPictureInPicture()](#stopPictureInPicture) | `Promise<void>` | ✅ | ✅ |
| [updatePictureInPictureState()](#updatePictureInPictureState) | `Promise<void>` | ✅ | ✅ |
| [completePictureInPictureRestore()](#completePictureInPictureRestore) | `Promise<void>` | ✅ | ✅ |
| [disposePictureInPicture()](#disposePictureInPicture) | `Promise<void>` | ✅ | ✅ |
| [getInitialPictureInPictureEvents()](#getInitialPictureInPictureEvents) | `Promise<PictureInPictureEvent[]>` | ✅ | ✅ |
| [clearInitialPictureInPictureEvents()](#clearInitialPictureInPictureEvents) | `Promise<void>` | ✅ | ✅ |

\* On Android, `setCallActive` covers the “call is live” transition used by Telecom / CallStyle. Prefer `setCallActive` after media join on both platforms when using the host helpers.

`NativeCallController.*` mirrors the imperative call methods above without platform branching.

Host helpers (JS, no direct Telecom calls beyond the module):

| API | Purpose |
| --- | --- |
| `initializeNativeCalls(onEvent \| options)` | Cold-start bootstrap: setup → listen → drain → clear |
| `createCallEventRouter({ media, setCallActive })` | Pure router native events → media callbacks (testable) |
| `createNativeCallEventRouter({ media })` | Same router with default `setCallActive` |
| `createSocialCallSession({ media, ui })` | X-style session: lifecycle + UI present/dismiss + media route |
| `reduceCallLifecycle` / `createInitialCallLifecycleState` | Pure lifecycle state machine for host UI |
| Protocol builders/parsers | `buildIosVoipPushPayload`, `buildAndroidIncomingCallFcmData`, `parse*`, `validateCallId` |

### setup

Initializes CallKit or registers the self-managed Android phone account.

```js
await CallManager.setup();
// or
await NativeCallController.setup();
```

### displayIncomingCall

Display system UI for an incoming call from an in-app signaling path (when the call was not already raised by PushKit / FCM).

```js
await CallManager.displayIncomingCall({
  callId: 'c8cc3ab6-3e1d-4f2b-aa49-f93ee9c75ff3',
  handle: 'user_01',
  displayName: 'Ngoc',
  handleType: 'generic', // optional: 'generic' | 'phoneNumber' | 'email'
  hasVideo: true,
  metadata: { conversationId: '…' }, // optional, JSON-safe only
});
```

- `callId`: string (**required**, RFC 4122 UUID)
  Stable id shared by backend, native UI, and media orchestration.
- `handle`: string (**required**)
  Caller identity shown / associated with the OS call.
- `displayName`: string (**required**)
  Name displayed on the native UI.
- `handleType`: string (optional)
  - `generic` (default when omitted on most paths)
  - `phoneNumber`
  - `email`
- `hasVideo`: boolean (optional, default `false` when omitted by callers)
- `metadata`: object (optional)
  Opaque service metadata echoed on native events. **Never** include media credentials.

### startCall

Tell the device that an outgoing call is occurring.

```js
await CallManager.startCall({
  callId,
  handle: calleeUserId,
  displayName: calleeDisplayName,
  hasVideo: true,
  metadata: { conversationId },
});
```

- Same shape as [`displayIncomingCall`](#displayIncomingCall) (`OutgoingCall` extends `IncomingCall`).

### answerCall

Tell the SDK the user answered from **your app UI** (not only from the system UI).

```js
await CallManager.answerCall(callId);
```

- `callId`: string
  The UUID used for `startCall` or `displayIncomingCall`.

### endCall

Finish an incoming/outgoing call when the user actively ends it from your app UI.

```js
await CallManager.endCall(callId);
```

- `callId`: string

### endAllCalls

End all ongoing calls known to this process.

```js
await CallManager.endAllCalls();
```

### setMuted

Switch the mic on/off in the system UI and emit a media command event.

```js
await CallManager.setMuted(callId, true);
```

- `callId`: string
- `muted`: boolean

### setHeld

Set a call on/off hold.

```js
await CallManager.setHeld(callId, true);
```

- `callId`: string
- `held`: boolean

### setCallActive

Mark the call as active after two-way media is ready.

- **Android:** moves Telecom / CallStyle / FGS into the ongoing in-call state.
- **iOS:** reports the outgoing call as connected when applicable.

```js
await CallManager.setCallActive(callId);
```

- `callId`: string

Call this **after** a successful media join. `createNativeCallEventRouter` / `createSocialCallSession` do this automatically after `media.accept` when `markActiveAfterAccept` is true (default).

### reportOutgoingCallConnecting

_iOS-focused._ Report that an outgoing call is connecting.

```js
await CallManager.reportOutgoingCallConnecting(callId);
```

### reportOutgoingCallConnected

_iOS-focused._ Report that an outgoing call connected. Prefer `setCallActive` for cross-platform host code.

```js
await CallManager.reportOutgoingCallConnected(callId);
```

### reportCallEnded

Report that the call ended without the local user initiating hang-up (remote end, missed, answered elsewhere, …).

```js
await CallManager.reportCallEnded(callId, 'remoteEnded');
```

- `callId`: string
- `reason`: `CallEndReason`
  - `failed`
  - `remoteEnded`
  - `unanswered`
  - `answeredElsewhere`
  - `declinedElsewhere`
  - `missed`

Prefer `reportCallEnded` over a bare `endCall` when the peer/backend ended the call.

### updateCallDisplay

Update caller information in the system UI after a call has started.

```js
await CallManager.updateCallDisplay(callId, displayName, handle, hasVideo);
```

- `callId`: string
- `displayName`: string
- `handle`: string | null
- `hasVideo`: boolean | null

### getCalls

Returns native calls known to this process.

```js
const calls = await CallManager.getCalls();
// [{ callId, direction, handle, displayName, hasVideo, state }]
```

### getInitialEvents

If the user performed actions before the JS context subscribed, this returns early-fired events. Prefer `initializeNativeCalls`, which drains and clears them for you.

```js
const events = await CallManager.getInitialEvents();
```

### clearInitialEvents

Clear pending actions returned by `getInitialEvents()`.

```js
await CallManager.clearInitialEvents();
```

### getVoipPushToken

_This feature is available only on iOS._

Returns the APNs **VoIP** device token (not an Expo push token). Store it separately on the server.

```js
const token = await CallManager.getVoipPushToken();
```

Token rotations are also emitted as `voipTokenUpdated` events.

### canUseFullScreenIntent

_This feature is available only on Android._

```js
const allowed = await CallManager.canUseFullScreenIntent();
```

### openFullScreenIntentSettings

_This feature is available only on Android._

Opens system settings so the user can allow full-screen incoming-call notifications (Android 14+).

```js
await CallManager.openFullScreenIntentSettings();
```

### isPictureInPictureSupported

```js
const supported = await CallManager.isPictureInPictureSupported();
```

### isPictureInPictureActive

```js
const active = await CallManager.isPictureInPictureActive();
```

Check this before tearing down media on `AppState` `inactive` / `background`.

### preparePictureInPicture

Connect system PiP to the active WebRTC video view. Pass the native tag of the remote `RTCView`.

```js
import { findNodeHandle } from 'react-native';

const remoteTag = findNodeHandle(remoteVideoRef.current);
await CallManager.preparePictureInPicture(remoteTag, null, {
  aspectRatioWidth: 9,
  aspectRatioHeight: 16,
  autoEnterEnabled: true,
  seamlessResizeEnabled: true,
});
```

- `videoViewTag`: number — remote `RTCView` native tag
- `localVideoViewTag`: number | null — optional local camera view (iOS multitasking camera)
- `options`: object (optional)
  - `aspectRatioWidth` / `aspectRatioHeight`: number (default 9:16)
  - `autoEnterEnabled`: boolean
  - `seamlessResizeEnabled`: boolean (Android 12+)
  - `sourceRect`: `{ x, y, width, height }` (optional Android transition hint)

### refreshPictureInPictureVideoTracks

Rebind native PiP renderers after the media SDK replaces a track.

```js
await CallManager.refreshPictureInPictureVideoTracks(remoteTag, localTag);
```

### setPictureInPictureAutoEnterEnabled

```js
await CallManager.setPictureInPictureAutoEnterEnabled(true);
```

### startPictureInPicture / stopPictureInPicture

```js
if (await CallManager.isPictureInPictureSupported()) {
  await CallManager.startPictureInPicture();
}
await CallManager.stopPictureInPicture();
```

On Android, `stopPictureInPicture()` brings the existing single-task Activity back to the foreground (Android has no direct “exit PiP” API).

### updatePictureInPictureState

Update native PiP camera/mute badges and display fallback.

```js
await CallManager.updatePictureInPictureState({
  displayName: 'Ngoc',
  localMuted: false,
  remoteMuted: false,
  remoteCameraEnabled: true,
});
```

### completePictureInPictureRestore

_iOS._ Complete restoration after the React call layout is ready.

```js
await CallManager.completePictureInPictureRestore(true);
```

### disposePictureInPicture

Detach the frame renderer and release native PiP resources. Call when the call ends.

```js
await CallManager.disposePictureInPicture();
```

### getInitialPictureInPictureEvents

```js
const events = await CallManager.getInitialPictureInPictureEvents();
```

### clearInitialPictureInPictureEvents

```js
await CallManager.clearInitialPictureInPictureEvents();
```

## Events

Call lifecycle events are delivered on a **single channel**: `onCallEvent` with a typed `CallEvent` payload (`event.type`).

| Event `type` | iOS | Android | Typical app action |
| --- | :---: | :---: | --- |
| [answer](#answer) | ✅ | ✅ | Fetch media token, join media, `setCallActive` |
| [end](#end) | ✅ | ✅ | Leave media, notify backend if local end |
| [start](#start) | ✅ | ✅ | Outgoing started / system confirmed start |
| [mute](#mute) | ✅ | ✅ | Apply mute to media track |
| [hold](#hold) | ✅ | ✅ | Apply hold to media senders |
| [dtmf](#dtmf) | ✅ | ✅ | Optional DTMF handling |
| [audioSessionActivated](#audioSessionActivated) | ✅ | ❌\* | Safe point to start audio IO with CallKit |
| [audioSessionDeactivated](#audioSessionDeactivated) | ✅ | ❌\* | Pause/release audio IO |
| [audioRouteChanged](#audioRouteChanged) | ✅ | ✅ | Optional UI for earpiece/speaker/BT |
| [incomingCallDisplayed](#incomingCallDisplayed) | ✅ | ✅ | Telemetry |
| [incomingCallFailed](#incomingCallFailed) | ✅ | ✅ | Telemetry / user recovery |
| [providerReset](#providerReset) | ✅ | ✅ | Reset local call state |
| [showIncomingCallUi](#showIncomingCallUi) | ❌ | ✅ | Optional in-app incoming UI |
| [voipTokenUpdated](#voipTokenUpdated) | ✅ | ❌ | Upload VoIP token to backend |
| [voipTokenInvalidated](#voipTokenInvalidated) | ✅ | ❌ | Mark backend token invalid |

\* Audio session events are CallKit-driven on iOS. Android audio is primarily managed via Telecom / your media SDK.

PiP events use a separate channel: `onPictureInPictureEvent`.

```js
import CallManager from 'expo-vicall-call-manager';

const sub = CallManager.addListener('onCallEvent', (event) => {
  switch (event.type) {
    case 'answer':
      // …
      break;
    case 'end':
      // …
      break;
    default:
      break;
  }
});

// later
sub.remove();
```

`CallEvent` shape:

```ts
{
  eventId: string;
  type: CallEventType;
  timestamp: number;
  callId?: string;
  direction?: 'incoming' | 'outgoing';
  handle?: string;
  displayName?: string;
  hasVideo?: boolean;
  muted?: boolean;
  held?: boolean;
  digits?: string;
  output?: string;
  reason?: string;
  token?: string;
  metadata?: CallMetadata;
}
```

### answer

User answered the incoming call (system UI or app-driven answer path).

```js
CallManager.addListener('onCallEvent', (event) => {
  if (event.type !== 'answer') return;
  const { callId } = event;
  // Fetch short-lived media credentials, join media, then setCallActive(callId)
});
```

- `callId` (string)

### end

User finished the call, or the system/backend ended it.

```js
CallManager.addListener('onCallEvent', (event) => {
  if (event.type !== 'end') return;
  // Leave media, dismiss host UI, optionally notify backend
});
```

- `callId` (string)
- `reason` (string, optional)

### start

Outgoing call started / system confirmed start.

```js
CallManager.addListener('onCallEvent', (event) => {
  if (event.type !== 'start') return;
});
```

- `callId` (string)
- `handle` / `displayName` / `hasVideo` (optional)

### mute

A call was muted/unmuted by the system or the user.

```js
CallManager.addListener('onCallEvent', (event) => {
  if (event.type !== 'mute') return;
  // event.muted === true means microphone should be disabled
});
```

- `muted` (boolean)
- `callId` (string)

### hold

A call was held or unheld.

```js
CallManager.addListener('onCallEvent', (event) => {
  if (event.type !== 'hold') return;
});
```

- `held` (boolean)
- `callId` (string)

### dtmf

DTMF digits from the system UI.

```js
CallManager.addListener('onCallEvent', (event) => {
  if (event.type !== 'dtmf') return;
  console.log(event.digits);
});
```

- `digits` (string)
- `callId` (string)

### audioSessionActivated

_iOS._ The `AudioSession` has been activated by CallKit.

```js
CallManager.addListener('onCallEvent', (event) => {
  if (event.type !== 'audioSessionActivated') return;
  // Start audio IO / ringback when appropriate
});
```

### audioSessionDeactivated

_iOS._ The `AudioSession` has been deactivated by CallKit.

```js
CallManager.addListener('onCallEvent', (event) => {
  if (event.type !== 'audioSessionDeactivated') return;
});
```

### audioRouteChanged

Triggered when the audio route changes.

```js
CallManager.addListener('onCallEvent', (event) => {
  if (event.type !== 'audioRouteChanged') return;
  console.log(event.output);
});
```

- `output` (string)
- `callId` (string, optional)

### incomingCallDisplayed

Fired after the native incoming UI is shown (including PushKit / FCM paths).

```js
CallManager.addListener('onCallEvent', (event) => {
  if (event.type !== 'incomingCallDisplayed') return;
});
```

### incomingCallFailed

Native failed to display or create the incoming connection.

```js
CallManager.addListener('onCallEvent', (event) => {
  if (event.type !== 'incomingCallFailed') return;
  // Telemetry / reject invite on backend
});
```

### providerReset

Call provider was reset; drop local call state.

```js
CallManager.addListener('onCallEvent', (event) => {
  if (event.type !== 'providerReset') return;
});
```

### showIncomingCallUi

_Android only._ Signals that the app may show an additional in-app incoming UI. System CallStyle UI is already owned by the module.

```js
CallManager.addListener('onCallEvent', (event) => {
  if (event.type !== 'showIncomingCallUi') return;
});
```

### voipTokenUpdated

_iOS only._ PushKit token issued or rotated.

```js
CallManager.addListener('onCallEvent', (event) => {
  if (event.type !== 'voipTokenUpdated') return;
  await registerVoipToken(event.token);
});
```

- `token` (string)

### voipTokenInvalidated

_iOS only._ PushKit token invalidated; mark it invalid on the backend.

```js
CallManager.addListener('onCallEvent', (event) => {
  if (event.type !== 'voipTokenInvalidated') return;
});
```

### Picture in Picture events

```js
CallManager.addListener('onPictureInPictureEvent', (event) => {
  // event.type:
  // 'willStart' | 'didStart' | 'failedToStart' | 'willStop' | 'didStop'
  // | 'restoreRequested' | 'stateChanged'
  // event.active: boolean
});
```

On iOS, restore the call route when `event.type === 'restoreRequested'`. On Android, hide custom controls while PiP `stateChanged` is active.

## Example

```js
import {
  initializeNativeCalls,
  createSocialCallSession,
  NativeCallController,
} from 'expo-vicall-call-manager';
import { randomUUID } from 'expo-crypto';

const session = createSocialCallSession({
  media: {
    async accept(callId, event) {
      const credentials = await api.acceptCall(callId);
      await media.join(credentials);
    },
    async end(callId, event) {
      await media.leave();
      await api.endCall(callId);
    },
    async setMicrophoneEnabled(enabled) {
      await media.setMicEnabled(enabled);
    },
    async setHeld(held) {
      await media.setHeld(held);
    },
    async onVoipTokenUpdated(token) {
      await api.registerVoipToken(token);
    },
  },
  ui: {
    presentInCallUi(callId, _event, state) {
      navigation.navigate('Call', {
        callId,
        hasVideo: state.hasVideo,
        displayName: state.displayName,
      });
    },
    dismissInCallUi() {
      navigation.navigate('Home');
    },
  },
  setCallActive: (callId) => NativeCallController.setCallActive(callId),
});

await initializeNativeCalls((event) => session.handleEvent(event));

async function startOutgoingCall({ handle, displayName, hasVideo }) {
  const callId = randomUUID();
  await api.createCall({ callId, handle, hasVideo });
  await NativeCallController.startCall({
    callId,
    handle,
    displayName,
    hasVideo,
  });
}

async function hangUp(callId) {
  await NativeCallController.endCall(callId);
}
```

# PushKit (iOS VoIP)

Since iOS 13, you must report incoming calls that wake the app with a VoIP push. This module registers PushKit natively (when `enableVoipPush: true`) and reports the call to CallKit **before** completing the push callback, even when React Native has not started.

1. Read the token:

```js
const voipToken = await CallManager.getVoipPushToken();
// also listen for event.type === 'voipTokenUpdated'
```

2. Backend sends APNs with:
   - push type: `voip`
   - topic: `<bundle-id>.voip`
   - priority: `10`
   - short expiration (for example 30s)
   - body built with `buildIosVoipPushPayload()`

```ts
import { buildIosVoipPushPayload } from 'expo-vicall-call-manager/protocol';

const body = buildIosVoipPushPayload({
  callId,
  handle: callerUserId,
  displayName: callerName,
  hasVideo: true,
  metadata: { conversationId },
});
```

Example payload:

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

Do **not** send a second VoIP push purely as a hang-up signal. After the initial wake-up, cancel/end over the app’s established network channel.

Never put RealtimeKit participant tokens, Supabase JWTs, or media URLs in push payloads. Mint short-lived media credentials only after `answer`.

# Android FCM

Normal notifications still use `expo-notifications`. The config plugin replaces Expo’s FCM service with a subclass that intercepts only call data messages.

Register the **native FCM token** (not the Expo push token) for call wake-ups:

```js
import * as Notifications from 'expo-notifications';

const nativeFcmToken = (await Notifications.getDevicePushTokenAsync()).data;
```

Send through **FCM HTTP v1** (not Expo Push Service):

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

Builder helpers:

```ts
import {
  buildAndroidIncomingCallFcmData,
  buildAndroidCancelCallFcmData,
} from 'expo-vicall-call-manager/protocol';

const data = buildAndroidIncomingCallFcmData({
  callId,
  handle: callerUserId,
  displayName: callerName,
  hasVideo: true,
  metadata: { conversationId },
});

const cancel = buildAndroidCancelCallFcmData(callId, 'answeredElsewhere');
```

| `vicallType` | Action |
| --- | --- |
| `incoming_call` | Display Telecom incoming UI + CallStyle full-screen notification |
| `cancel_call` | End the local ringing connection with the provided reason |
| _(anything else)_ | Forwarded to `expo-notifications` |

All FCM `data` values must be strings.

**Cancel-before-create race:** if `cancel_call` arrives before Telecom creates the connection, native buffers the cancel for ~30s, emits a single `end` event, and suppresses the later incoming UI. Duplicate `incoming_call` payloads for an already-known `callId` are ignored.

# Picture in Picture

System PiP is available on iOS 16.4+ and Android 8.0+ when the device reports support. Pass the native tag of the remote `RTCView`; both platforms attach a second renderer to the same WebRTC track.

```tsx
import type { ComponentRef } from 'react';
import { useEffect, useRef } from 'react';
import { findNodeHandle } from 'react-native';
import { RTCView } from '@cloudflare/react-native-webrtc';
import CallManager, {
  type PictureInPictureEvent,
} from 'expo-vicall-call-manager';

export function RemoteVideo({ streamURL }: { streamURL: string }) {
  const remoteVideoRef = useRef<ComponentRef<typeof RTCView>>(null);

  useEffect(() => {
    const subscription = CallManager.addListener(
      'onPictureInPictureEvent',
      (event: PictureInPictureEvent) => {
        // Hide controls while Android PiP is active.
        // On iOS, restore the call route when event.type === 'restoreRequested'.
        console.log(event);
      },
    );
    return () => subscription.remove();
  }, []);

  async function preparePiP() {
    const remoteTag = findNodeHandle(remoteVideoRef.current);
    if (remoteTag == null) throw new Error('Remote RTCView is not mounted');

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

If the local camera must remain active on iOS while the app is in PiP, pass its native `RTCView` tag as the second argument:

```js
await CallManager.preparePictureInPicture(remoteTag, localTag, {
  autoEnterEnabled: true,
});
```

Do not disable the camera or leave the media room merely because React Native’s `AppState` changes to `inactive` or `background`; first check `isPictureInPictureActive()`. When the media SDK replaces the remote track, call `refreshPictureInPictureVideoTracks()`. Call `disposePictureInPicture()` only when the call ends.

On iOS, the system video-call PiP window is intentionally non-interactive.

# Debug

### Android

```sh
adb logcat *:S ExpoVicallCallManager:V Vicall:V
```

### iOS

Use Xcode console filters for `Vicall`, `CallKit`, and `PushKit`.

# Troubleshooting

- Ensure `callId` is a valid RFC 4122 UUID (`validateCallId()`). Custom non-UUID strings will break CallKit reporting.
- Always run `initializeNativeCalls` (or the manual bootstrap order). Skipping `getInitialEvents` / `clearInitialEvents` can drop cold-start answer/end actions.
- Test CallKit and Android Telecom on **physical devices** only.
- Android 14+: if full-screen incoming UI never appears, check `canUseFullScreenIntent()`.
- Do not put media credentials in VoIP/FCM payloads — parsers reject forbidden keys.
- After answer, call `setCallActive(callId)` once media is ready (or use the built-in routers).
- iOS cancel/end after the initial PushKit wake-up must use your network channel — not a second VoIP push used only as hang-up.
- Production acceptance should include: locked device, foreground/background/terminated, decline, miss, answered elsewhere, token rotation, offline accept, Bluetooth routes, PiP enter/restore/close, camera on/off in PiP, Android OEM battery restrictions.

Full backend/service contract: [docs/SERVICE_INTEGRATION.md](./docs/SERVICE_INTEGRATION.md).

# Contributing

Pull requests, issue reports, and suggestions are welcome.

# License

MIT © Vicall

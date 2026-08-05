# Service ↔ React Native integration contract

This document is the authoritative integration guide for **backend/edge services**
and **React Native host applications** that connect through
`expo-vicall-call-manager`.

> Public JS/native API is documented CallKeep-style in the root [README](../README.md)
> (method tables, per-method params, event catalog). This file owns the **service contract**.

## Summary

- [1. Shared call identity](#1-shared-call-identity)
- [2. Responsibility split](#2-responsibility-split-do-not-blur)
- [3. Backend push contracts](#3-backend-push-contracts)
- [4. React Native host bootstrap](#4-react-native-host-bootstrap)
- [5. End-to-end sequence](#5-end-to-end-sequence)
- [6. Token registration](#6-token-registration)
- [7. Validation helpers](#7-validation-helpers-for-services)
- [8. Production acceptance matrix](#8-production-acceptance-matrix)
- [9. Package entry points](#9-package-entry-points)

The module is **not** a media SDK. It is the system-call bridge:

| Layer | Owns |
| --- | --- |
| Backend / Worker | Call records, push fan-out, media meeting creation, short-lived media tokens after answer |
| `expo-vicall-call-manager` | CallKit / PushKit, Android Telecom + CallStyle + FGS, event buffering, system PiP |
| React Native app | Event subscription, host-owned in-call UI, media join/leave (RealtimeKit) |
| RealtimeKit / WebRTC | Audio/video transport only |

Import the protocol from either entry point:

```ts
import {
  MODULE_RESPONSIBILITIES,
  SERVICE_RESPONSIBILITIES,
  APP_RESPONSIBILITIES,
  CALL_EVENT_OWNERSHIP,
  buildAndroidIncomingCallFcmData,
  buildAndroidCancelCallFcmData,
  buildIosVoipPushPayload,
  parseAndroidIncomingCallData,
  parseIosVoipPushPayload,
  validateCallId,
} from "expo-vicall-call-manager/protocol";
// or: "expo-vicall-call-manager"
```

---

## 1. Shared call identity

Every hop must reuse **one RFC 4122 UUID** as `callId`:

- durable DB row (`calls.id`)
- native CallKit / Telecom UUID
- iOS VoIP push / Android FCM payload
- media meeting / participant mapping key

```ts
validateCallId(callId); // throws ServiceProtocolError when invalid
```

Metadata must stay JSON-safe (`string | number | boolean | null`) and **must never**
include media credentials (participant tokens, Supabase JWTs, RealtimeKit tokens).

---

## 2. Responsibility split (do not blur)

### Backend / service (`SERVICE_RESPONSIBILITIES`)

1. Create the durable call record and media meeting.
2. Send iOS APNs VoIP push **or** Android high-priority FCM data.
3. After the callee answers, atomically validate the still-ringing call and mint a
   short-lived media participant token.
4. Signal cancel / answered-elsewhere / remote end.
5. Own durable call state transitions.

### This module (`MODULE_RESPONSIBILITIES`)

1. Show system incoming/outgoing call UI.
2. Register iOS VoIP push and intercept Android call FCM natively.
3. Buffer call/PiP events until JS subscribes.
4. Drive Android `phoneCall` foreground service + CallStyle notifications.
5. Attach system PiP to the existing WebRTC track (second renderer).

### React Native app (`APP_RESPONSIBILITIES`)

1. Bootstrap native listeners in the correct order.
2. On `answer`, call the backend, join media, then mark the native call active.
3. Present the host app in-call screen and bind media tracks to host video views.
4. Upload VoIP / FCM device tokens to the backend.
5. End media + notify backend when native `end` arrives.

---

## 3. Backend push contracts

### 3.1 iOS VoIP (APNs `push-type: voip`)

Requirements:

- Topic: `<bundle-id>.voip`
- Priority: `10`
- Short expiration (for example 30s)
- Body built with `buildIosVoipPushPayload()`

```ts
import { buildIosVoipPushPayload } from "expo-vicall-call-manager/protocol";

const body = buildIosVoipPushPayload({
  callId,
  handle: callerUserId,
  displayName: callerName,
  hasVideo: true,
  metadata: { conversationId },
});
// -> { aps: { "content-available": 1 }, callId, handle, callerName, hasVideo, metadata }
```

Native behavior: PushKit reports the call to CallKit **before** completing the
push callback, even when React Native has not started.

Do **not** send a second VoIP push purely as a hang-up signal. After the initial
wake-up, cancel/end over the app's established network channel.

### 3.2 Android FCM data (high priority)

Send through FCM HTTP v1 (not Expo Push Service) with:

```json
{
  "message": {
    "token": "<native-fcm-token>",
    "android": { "priority": "high", "ttl": "30s" },
    "data": {
      "vicallType": "incoming_call",
      "callId": "...",
      "handle": "...",
      "displayName": "...",
      "hasVideo": "true",
      "metadata": "{\"conversationId\":\"...\"}"
    }
  }
}
```

Builder helper:

```ts
import {
  buildAndroidIncomingCallFcmData,
  buildAndroidCancelCallFcmData,
} from "expo-vicall-call-manager/protocol";

const data = buildAndroidIncomingCallFcmData({
  callId,
  handle: callerUserId,
  displayName: callerName,
  hasVideo: true,
  metadata: { conversationId },
});

const cancel = buildAndroidCancelCallFcmData(callId, "answeredElsewhere");
```

All FCM `data` values must be strings. The native service intercepts only:

| `vicallType` | Action |
| --- | --- |
| `incoming_call` | Display Telecom incoming UI + CallStyle full-screen notification |
| `cancel_call` | End the local ringing connection with the provided reason |
| _(anything else)_ | Forwarded to `expo-notifications` |

**Cancel-before-create race:** if `cancel_call` arrives before Telecom creates
the connection, native buffers the cancel for ~30s (`VicallPendingCancellationStore`),
emits a single `end` event, and suppresses the later incoming UI. Duplicate
`incoming_call` payloads for an already-known `callId` are ignored.

### 3.3 Forbidden push fields

Parsers reject payloads that include media credentials, including:

`participantToken`, `realtimeKitToken`, `mediaToken`, `accessToken`,
`supabaseJwt`, `authToken` (and snake_case variants).

Mint those only after `answer`.

---

## 4. React Native host bootstrap

### 4.1 Required order

```ts
import {
  initializeNativeCalls,
  createNativeCallEventRouter,
  NativeCallController,
} from "expo-vicall-call-manager";
// or: "expo-vicall-call-manager/client"
```

`initializeNativeCalls()` always runs:

1. `setup`
2. `addListener("onCallEvent")`
3. `getInitialEvents`
4. handle buffered events
5. `clearInitialEvents`

Skipping this order can drop cold-start answer/end events.

### 4.2 Recommended app wiring

```ts
const handleEvent = createNativeCallEventRouter({
  media: {
    async accept(callId) {
      const credentials = await api.acceptCall(callId);
      await realtimeKit.join(credentials);
    },
    async end(callId) {
      await realtimeKit.leave();
      await api.endCall(callId);
    },
    async setMicrophoneEnabled(enabled) {
      await realtimeKit.setMicEnabled(enabled);
    },
    async setHeld(held) {
      await realtimeKit.setAudioEnabled(!held);
    },
    async onVoipTokenUpdated(token) {
      await api.registerVoipToken(token);
    },
  },
});

const subscription = await initializeNativeCalls(handleEvent);

// Outgoing
await NativeCallController.startCall({
  callId,
  handle: calleeUserId,
  displayName: calleeName,
  hasVideo: true,
  metadata: { conversationId },
});

// Later cleanup
subscription.remove();
```

`createNativeCallEventRouter` marks the native call active after a successful
`media.accept` (`setCallActive`). That is required on Android so the ongoing
CallStyle notification / foreground service enter the in-call state.

### 4.3 Event ownership cheat sheet

| Event | Direction | App should |
| --- | --- | --- |
| `answer` | native → JS | Fetch media token, join media, native becomes active |
| `end` | both | Leave media, notify backend if local end |
| `start` | both | Outgoing started / system confirmed start |
| `mute` / `hold` | both | Apply to media tracks |
| `audioSessionActivated` | native → JS (iOS) | Safe point to start audio IO with CallKit |
| `audioSessionDeactivated` | native → JS (iOS) | Pause/release audio IO |
| `audioRouteChanged` | native → JS (Android) | Optional UI for earpiece/speaker/BT |
| `incomingCallDisplayed` | native → JS | Telemetry |
| `incomingCallFailed` | native → JS | Telemetry / user recovery |
| `voipTokenUpdated` | native → JS | Upload token to backend |
| `showIncomingCallUi` | native → JS (Android) | Optional in-app incoming UI |

Full map: `CALL_EVENT_OWNERSHIP`.

---

## 5. End-to-end sequence

```text
Caller app                    Backend / Worker                 Callee device
─────────                    ───────────────                 ────────────
startCall(callId) ─────────► create call + meeting
                             send VoIP / FCM ───────────────► native incoming UI
                                                              (JS may be dead)
user answers system UI ─────────────────────────────────────► event: answer
app accept(callId) ────────► validate + mint media token
                             ◄────────────────────────────── credentials
join RealtimeKit
setCallActive(callId)                                         ongoing system UI
... media flows via RealtimeKit ...
endCall / remote end ──────► finalize durable state ────────► event: end
leave media + dispose PiP
```

---


## 6. Token registration

| Platform | Token source | Backend field |
| --- | --- | --- |
| iOS VoIP | `NativeCallController.getVoipPushToken()` + `voipTokenUpdated` | APNs VoIP device token |
| Android FCM | `Notifications.getDevicePushTokenAsync()` | Native FCM token |
| Expo push | Expo push token | Not used for call wake-ups |

Store VoIP/FCM tokens separately from Expo push tokens.

---

## 7. Validation helpers for services

Backend unit tests and Worker code can validate payloads without React Native:

```ts
import {
  parseAndroidIncomingCallData,
  parseAndroidCancelCallData,
  parseIosVoipPushPayload,
  ServiceProtocolError,
} from "expo-vicall-call-manager/protocol";

try {
  const incoming = parseAndroidIncomingCallData(fcmData);
  // dispatch
} catch (error) {
  if (error instanceof ServiceProtocolError) {
    // error.code: invalid_call_id | invalid_field | forbidden_media_credentials | ...
  }
  throw error;
}
```

---

## 8. Production acceptance matrix

Services and RN hosts should jointly verify:

- locked device incoming
- app foreground / background / force-quit
- decline, miss, answered-elsewhere, remote cancel
- offline accept recovery
- VoIP / FCM token rotation
- Bluetooth route changes
- audio-only and video calls (`hasVideo`)
- PiP enter / restore / close
- camera toggle while PiP active
- Android 14+ full-screen intent permission
- OEM battery restrictions (especially Android)

CallKit and Android Telecom **require physical devices**.

---

## 9. Package entry points

| Import | Audience | Loads native module? |
| --- | --- | --- |
| `expo-vicall-call-manager` | RN app default | Yes |
| `expo-vicall-call-manager/protocol` | Backend + RN shared validators | No |
| `expo-vicall-call-manager/client` | RN host helpers | Yes |

Use `/protocol` from Cloudflare Workers, Node services, or shared monorepo packages
that must not depend on Expo runtime.

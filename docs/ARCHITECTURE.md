# Architecture: X-style system calls, host-owned UI

`expo-vicall-call-manager` is a **system-call engine** for React Native, not an
in-call UI kit.

> API reference style matches [react-native-callkeep](https://github.com/react-native-webrtc/react-native-callkeep):
> see the root [README](../README.md) for Installation, Usage, API tables, and Events.

## Summary

- [Layer ownership](#layer-ownership)
- [What the module does](#what-the-module-does)
- [What the host app must do](#what-the-host-app-must-do)
- [Package surface](#package-surface)
- [Recommended product flow](#recommended-product-flow-audio--video)

## Layer ownership

It mirrors how large social clients (including X) separate concerns:

| Layer | Owner | Examples |
| --- | --- | --- |
| System call UX | **This module** | CallKit, PushKit, Android Telecom, CallStyle, FGS, lock-screen answer |
| Signaling / durable state | **Backend service** | create call, VoIP/FCM fan-out, answered-elsewhere, media tokens |
| Media transport | **Host media SDK** | RealtimeKit / WebRTC tracks, encode/decode |
| In-call product UI | **Host React Native app** | full-screen video layout, controls, chat-on-call, reactions |

```text
Push / startCall
      │
      ▼
┌──────────────────────────────┐
│ expo-vicall-call-manager     │  system ring / answer / mute / end
│ CallKit · Telecom · FCM/PK   │  event buffer before JS boots
└──────────────┬───────────────┘
               │ CallEvent
               ▼
┌──────────────────────────────┐
│ Host app                     │  present/dismiss YOUR screens
│ createSocialCallSession()    │  join media, bind RTCView, chrome
└──────────────────────────────┘
```

## What the module does

1. Show **OS incoming/outgoing call UI** (not your React tree).
2. Wake the app from killed/background via VoIP push / high-priority FCM.
3. Buffer `CallEvent`s until JS subscribes.
4. Keep the OS “ongoing call” state healthy (Android FGS, CallKit audio session).
5. Optionally expose **low-level system PiP APIs** if the host binds a video track.

## What the host app must do

1. Render **audio/video call screens** after `answer` / outgoing `start`.
2. Join/leave the media room with short-lived tokens from your backend.
3. Put `RTCView` (or equivalent) inside **your** layout.
4. Sync mute/hold/camera toggles with both media SDK and `NativeCallController`.

Use the pure lifecycle helpers:

```ts
import {
  initializeNativeCalls,
  createSocialCallSession,
  NativeCallController,
} from "expo-vicall-call-manager";

const session = createSocialCallSession({
  media: {
    async accept(callId) {
      const creds = await api.accept(callId);
      await media.join(creds);
    },
    async end(callId) {
      await media.leave();
      await api.end(callId);
    },
    async setMicrophoneEnabled(enabled) {
      await media.setMic(enabled);
    },
  },
  ui: {
    presentInCallUi(callId, _event, state) {
      navigation.navigate("Call", { callId, hasVideo: state.hasVideo });
    },
    dismissInCallUi() {
      navigation.goBack();
    },
  },
  setCallActive: (callId) => NativeCallController.setCallActive(callId),
});

await initializeNativeCalls((event) => session.handleEvent(event));
```

`session.getState()` exposes:

- `phase`: `idle | ringing | dialing | connecting | active | held | ended`
- `shouldPresentAppCallUi`: when your screen should be mounted
- mute/hold/hasVideo/displayName for binding controls

## Package surface

| Import | Purpose |
| --- | --- |
| `expo-vicall-call-manager` | Core native module + helpers |
| `expo-vicall-call-manager/protocol` | Backend payload builders/parsers |
| `expo-vicall-call-manager/client` | Bootstrap / session / lifecycle |

There is **no** bundled product call UI package. Host apps own presentation.

WebRTC (`@cloudflare/react-native-webrtc`) is an **optional** peer — required only
when you bind tracks or use system PiP APIs.

## Recommended product flow (audio + video)

1. Backend creates call + sends push (`hasVideo` true/false).
2. Module shows system UI immediately.
3. User answers on lock screen / notification.
4. Host receives `answer` → opens **host Call screen** → fetches token → joins media.
5. Host calls `setCallActive` so Android ongoing call stays valid.
6. User ends from system UI or host chrome → `end` → host leaves media + dismisses screen.

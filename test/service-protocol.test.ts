import assert from "node:assert/strict";
import test from "node:test";

import {
  ANDROID_FCM_VICALL_TYPES,
  CALL_EVENT_OWNERSHIP,
  MODULE_RESPONSIBILITIES,
  SERVICE_RESPONSIBILITIES,
  parseAndroidCancelCallData,
  parseAndroidIncomingCallData,
  parseIosVoipPushPayload,
  validateCallId,
} from "../src/protocol";

test("documents which layer owns each call lifecycle concern", () => {
  assert.equal(MODULE_RESPONSIBILITIES.includes("system_incoming_ui"), true);
  assert.equal(MODULE_RESPONSIBILITIES.includes("media_transport"), false);
  assert.equal(SERVICE_RESPONSIBILITIES.includes("create_call_record"), true);
  assert.equal(SERVICE_RESPONSIBILITIES.includes("mint_media_token_after_answer"), true);
  assert.equal(CALL_EVENT_OWNERSHIP.answer, "native_to_js");
  assert.equal(CALL_EVENT_OWNERSHIP.mute, "bidirectional");
});

test("accepts only RFC 4122 UUID call ids", () => {
  assert.equal(
    validateCallId("c8cc3ab6-3e1d-4f2b-aa49-f93ee9c75ff3"),
    "c8cc3ab6-3e1d-4f2b-aa49-f93ee9c75ff3",
  );
  assert.throws(() => validateCallId("not-a-uuid"), /RFC 4122/);
  assert.throws(() => validateCallId(""), /RFC 4122/);
});

test("parses Android high-priority incoming_call FCM data payloads", () => {
  const parsed = parseAndroidIncomingCallData({
    vicallType: ANDROID_FCM_VICALL_TYPES.incomingCall,
    callId: "c8cc3ab6-3e1d-4f2b-aa49-f93ee9c75ff3",
    handle: "user_01",
    displayName: "Ngoc",
    hasVideo: "true",
    metadata: '{"conversationId":"5dc50ea7-31cd-457d-bb75-0310c9124a9c"}',
  });

  assert.deepEqual(parsed, {
    callId: "c8cc3ab6-3e1d-4f2b-aa49-f93ee9c75ff3",
    handle: "user_01",
    displayName: "Ngoc",
    hasVideo: true,
    metadata: {
      conversationId: "5dc50ea7-31cd-457d-bb75-0310c9124a9c",
    },
  });
});

test("rejects Android incoming_call payloads missing required string fields", () => {
  assert.throws(
    () =>
      parseAndroidIncomingCallData({
        vicallType: "incoming_call",
        handle: "user_01",
      }),
    /callId/,
  );
});

test("parses Android cancel_call payloads with end reasons", () => {
  const parsed = parseAndroidCancelCallData({
    vicallType: ANDROID_FCM_VICALL_TYPES.cancelCall,
    callId: "c8cc3ab6-3e1d-4f2b-aa49-f93ee9c75ff3",
    reason: "answeredElsewhere",
  });

  assert.deepEqual(parsed, {
    callId: "c8cc3ab6-3e1d-4f2b-aa49-f93ee9c75ff3",
    reason: "answeredElsewhere",
  });
});

test("parses iOS PushKit VoIP payloads used by backend services", () => {
  const parsed = parseIosVoipPushPayload({
    aps: { "content-available": 1 },
    callId: "c8cc3ab6-3e1d-4f2b-aa49-f93ee9c75ff3",
    handle: "user_01",
    callerName: "Ngoc",
    hasVideo: true,
    metadata: {
      conversationId: "5dc50ea7-31cd-457d-bb75-0310c9124a9c",
    },
  });

  assert.deepEqual(parsed, {
    callId: "c8cc3ab6-3e1d-4f2b-aa49-f93ee9c75ff3",
    handle: "user_01",
    displayName: "Ngoc",
    hasVideo: true,
    metadata: {
      conversationId: "5dc50ea7-31cd-457d-bb75-0310c9124a9c",
    },
  });
});

test("forbids media credentials inside service push payloads", () => {
  assert.throws(
    () =>
      parseAndroidIncomingCallData({
        vicallType: "incoming_call",
        callId: "c8cc3ab6-3e1d-4f2b-aa49-f93ee9c75ff3",
        handle: "user_01",
        displayName: "Ngoc",
        hasVideo: "false",
        participantToken: "secret-token",
      }),
    /must not include media credentials/,
  );

  assert.throws(
    () =>
      parseIosVoipPushPayload({
        callId: "c8cc3ab6-3e1d-4f2b-aa49-f93ee9c75ff3",
        handle: "user_01",
        callerName: "Ngoc",
        hasVideo: false,
        realtimeKitToken: "secret-token",
      }),
    /must not include media credentials/,
  );
});

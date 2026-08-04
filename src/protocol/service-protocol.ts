import type {
  CallEndReason,
  CallEventType,
  CallMetadata,
} from "../ExpoVicallCallManager.types";

/**
 * Responsibilities owned exclusively by this Expo native module.
 * Backend services and media SDKs must not re-implement these concerns.
 */
export const MODULE_RESPONSIBILITIES = [
  "system_incoming_ui",
  "system_outgoing_ui",
  "voip_push_registration_ios",
  "fcm_call_interception_android",
  "call_event_buffering_before_js",
  "system_picture_in_picture_api",
  "call_foreground_service_android",
] as const;

/**
 * Responsibilities owned by the backend / edge Worker that talks to the app.
 * These stay outside the React Native module boundary.
 */
export const SERVICE_RESPONSIBILITIES = [
  "create_call_record",
  "create_media_meeting",
  "send_ios_voip_push",
  "send_android_fcm_call_data",
  "mint_media_token_after_answer",
  "cancel_or_answered_elsewhere_signaling",
  "durable_call_state",
] as const;

/**
 * Responsibilities owned by the React Native application host.
 * In-call screens, video layout, and chrome are intentionally host-owned
 * (X / social-network style). This module does not ship a required call UI.
 */
export const APP_RESPONSIBILITIES = [
  "subscribe_native_call_events",
  "present_host_owned_in_call_ui",
  "fetch_media_credentials_after_answer",
  "join_leave_media_session",
  "bind_media_tracks_to_host_video_views",
  "register_push_tokens_with_backend",
] as const;

export type ModuleResponsibility = (typeof MODULE_RESPONSIBILITIES)[number];
export type ServiceResponsibility = (typeof SERVICE_RESPONSIBILITIES)[number];
export type AppResponsibility = (typeof APP_RESPONSIBILITIES)[number];

/**
 * Direction of each native call event relative to the JS runtime.
 * - native_to_js: system UI / telecom / push produced the event
 * - js_to_native: app asked the module to mutate native call state
 * - bidirectional: either side may originate the same event type
 */
export const CALL_EVENT_OWNERSHIP = {
  answer: "native_to_js",
  end: "bidirectional",
  start: "bidirectional",
  mute: "bidirectional",
  hold: "bidirectional",
  dtmf: "native_to_js",
  audioSessionActivated: "native_to_js",
  audioSessionDeactivated: "native_to_js",
  audioRouteChanged: "native_to_js",
  incomingCallDisplayed: "native_to_js",
  incomingCallFailed: "native_to_js",
  providerReset: "native_to_js",
  showIncomingCallUi: "native_to_js",
  voipTokenUpdated: "native_to_js",
  voipTokenInvalidated: "native_to_js",
} as const satisfies Record<
  CallEventType,
  "native_to_js" | "js_to_native" | "bidirectional"
>;

export const ANDROID_FCM_VICALL_TYPES = {
  incomingCall: "incoming_call",
  cancelCall: "cancel_call",
} as const;

export type AndroidFcmVicallType =
  (typeof ANDROID_FCM_VICALL_TYPES)[keyof typeof ANDROID_FCM_VICALL_TYPES];

/** Fields shared by every verified call identity crossing service ↔ native ↔ JS. */
export interface ServiceCallIdentity {
  /**
   * Stable RFC 4122 UUID. Reuse the same value for:
   * durable call records, native CallKit/Telecom UUIDs, push payloads,
   * and media-meeting orchestration keys.
   */
  callId: string;
  /** Stable callee/caller handle shown to the OS (user id, phone, or email). */
  handle: string;
  /** Human-readable name for system call UI. */
  displayName: string;
  /** When true, system UI advertises a video call. */
  hasVideo: boolean;
  /** Opaque service metadata echoed back on native events. Keep values JSON-safe. */
  metadata: CallMetadata;
}

export interface AndroidIncomingCallData extends ServiceCallIdentity {}

export interface AndroidCancelCallData {
  callId: string;
  reason: CallEndReason;
}

export interface IosVoipPushPayload extends ServiceCallIdentity {}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const FORBIDDEN_MEDIA_CREDENTIAL_KEYS = [
  "participantToken",
  "participant_token",
  "realtimeKitToken",
  "realtimekitToken",
  "realtime_kit_token",
  "mediaToken",
  "media_token",
  "accessToken",
  "access_token",
  "supabaseJwt",
  "supabase_jwt",
  "authToken",
  "auth_token",
] as const;

export class ServiceProtocolError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ServiceProtocolError";
    this.code = code;
  }
}

export function validateCallId(value: unknown): string {
  if (typeof value !== "string" || !UUID_RE.test(value)) {
    throw new ServiceProtocolError(
      "invalid_call_id",
      "callId must be a valid RFC 4122 UUID shared by service, native UI, and media orchestration",
    );
  }
  return value.toLowerCase();
}

function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ServiceProtocolError(
      "invalid_field",
      `${field} is required and must be a non-empty string`,
    );
  }
  return value.trim();
}

function assertNoMediaCredentials(
  source: Record<string, unknown>,
  where: string,
): void {
  for (const key of FORBIDDEN_MEDIA_CREDENTIAL_KEYS) {
    if (source[key] != null) {
      throw new ServiceProtocolError(
        "forbidden_media_credentials",
        `${where} must not include media credentials (${key}). Mint short-lived media tokens only after the user answers.`,
      );
    }
  }
}

function parseBooleanField(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value === "true") return true;
    if (value === "false") return false;
  }
  if (value == null) return fallback;
  throw new ServiceProtocolError(
    "invalid_field",
    'hasVideo must be a boolean or the strings "true"/"false"',
  );
}

function parseMetadata(value: unknown): CallMetadata {
  if (value == null) return {};
  if (typeof value === "string") {
    if (value.trim().length === 0) return {};
    try {
      const parsed = JSON.parse(value) as unknown;
      if (
        parsed == null ||
        typeof parsed !== "object" ||
        Array.isArray(parsed)
      ) {
        throw new Error("metadata JSON must be an object");
      }
      return sanitizeMetadata(parsed as Record<string, unknown>);
    } catch (error) {
      throw new ServiceProtocolError(
        "invalid_metadata",
        `metadata must be a JSON object string: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
  if (typeof value === "object" && !Array.isArray(value)) {
    return sanitizeMetadata(value as Record<string, unknown>);
  }
  throw new ServiceProtocolError(
    "invalid_metadata",
    "metadata must be an object or a JSON object string",
  );
}

function sanitizeMetadata(value: Record<string, unknown>): CallMetadata {
  assertNoMediaCredentials(value, "metadata");
  const metadata: CallMetadata = {};
  for (const [key, entry] of Object.entries(value)) {
    if (
      entry === null ||
      typeof entry === "string" ||
      typeof entry === "number" ||
      typeof entry === "boolean"
    ) {
      metadata[key] = entry;
      continue;
    }
    throw new ServiceProtocolError(
      "invalid_metadata",
      `metadata.${key} must be string | number | boolean | null`,
    );
  }
  return metadata;
}

function parseEndReason(value: unknown): CallEndReason {
  const allowed: CallEndReason[] = [
    "failed",
    "remoteEnded",
    "unanswered",
    "answeredElsewhere",
    "declinedElsewhere",
    "missed",
  ];
  if (typeof value === "string" && (allowed as string[]).includes(value)) {
    return value as CallEndReason;
  }
  return "remoteEnded";
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    throw new ServiceProtocolError(
      "invalid_payload",
      `${label} must be an object`,
    );
  }
  return value as Record<string, unknown>;
}

/**
 * Validates Android FCM `data` for `vicallType=incoming_call`.
 * All FCM data values arrive as strings; this normalizes them for app/service tests.
 */
export function parseAndroidIncomingCallData(
  data: unknown,
): AndroidIncomingCallData {
  const record = asRecord(data, "Android FCM data");
  assertNoMediaCredentials(record, "Android FCM data");

  const vicallType = record.vicallType;
  if (
    vicallType != null &&
    vicallType !== ANDROID_FCM_VICALL_TYPES.incomingCall
  ) {
    throw new ServiceProtocolError(
      "invalid_vicall_type",
      `expected vicallType "${ANDROID_FCM_VICALL_TYPES.incomingCall}"`,
    );
  }

  const handle = requireNonEmptyString(record.handle, "handle");
  const displayName =
    typeof record.displayName === "string" &&
    record.displayName.trim().length > 0
      ? record.displayName.trim()
      : typeof record.callerName === "string" &&
          record.callerName.trim().length > 0
        ? record.callerName.trim()
        : handle;

  return {
    callId: validateCallId(record.callId),
    handle,
    displayName,
    hasVideo: parseBooleanField(record.hasVideo, false),
    metadata: parseMetadata(record.metadata),
  };
}

/**
 * Validates Android FCM `data` for `vicallType=cancel_call`.
 */
export function parseAndroidCancelCallData(
  data: unknown,
): AndroidCancelCallData {
  const record = asRecord(data, "Android FCM data");
  const vicallType = record.vicallType;
  if (
    vicallType != null &&
    vicallType !== ANDROID_FCM_VICALL_TYPES.cancelCall
  ) {
    throw new ServiceProtocolError(
      "invalid_vicall_type",
      `expected vicallType "${ANDROID_FCM_VICALL_TYPES.cancelCall}"`,
    );
  }

  return {
    callId: validateCallId(record.callId),
    reason: parseEndReason(record.reason),
  };
}

/**
 * Validates the JSON body a backend service should send through APNs VoIP push.
 * Native PushKit reports this payload to CallKit before JS boots.
 */
export function parseIosVoipPushPayload(payload: unknown): IosVoipPushPayload {
  const record = asRecord(payload, "iOS VoIP push payload");
  assertNoMediaCredentials(record, "iOS VoIP push payload");

  const handle = requireNonEmptyString(record.handle, "handle");
  const displayName =
    typeof record.displayName === "string" &&
    record.displayName.trim().length > 0
      ? record.displayName.trim()
      : typeof record.callerName === "string" &&
          record.callerName.trim().length > 0
        ? record.callerName.trim()
        : handle;

  return {
    callId: validateCallId(record.callId),
    handle,
    displayName,
    hasVideo: parseBooleanField(record.hasVideo, false),
    metadata: parseMetadata(record.metadata),
  };
}

/**
 * Builds the Android FCM data map a backend should send (all values strings).
 */
export function buildAndroidIncomingCallFcmData(
  call: ServiceCallIdentity,
): Record<string, string> {
  const normalized = parseAndroidIncomingCallData({
    vicallType: ANDROID_FCM_VICALL_TYPES.incomingCall,
    callId: call.callId,
    handle: call.handle,
    displayName: call.displayName,
    hasVideo: call.hasVideo ? "true" : "false",
    metadata: JSON.stringify(call.metadata ?? {}),
  });

  return {
    vicallType: ANDROID_FCM_VICALL_TYPES.incomingCall,
    callId: normalized.callId,
    handle: normalized.handle,
    displayName: normalized.displayName,
    hasVideo: normalized.hasVideo ? "true" : "false",
    metadata: JSON.stringify(normalized.metadata ?? {}),
  };
}

/**
 * Builds the Android FCM cancel payload a backend should send.
 */
export function buildAndroidCancelCallFcmData(
  callId: string,
  reason: CallEndReason = "remoteEnded",
): Record<string, string> {
  const normalized = parseAndroidCancelCallData({
    vicallType: ANDROID_FCM_VICALL_TYPES.cancelCall,
    callId,
    reason,
  });
  return {
    vicallType: ANDROID_FCM_VICALL_TYPES.cancelCall,
    callId: normalized.callId,
    reason: normalized.reason,
  };
}

/**
 * Builds the APNs VoIP JSON body a backend should send.
 */
export function buildIosVoipPushPayload(
  call: ServiceCallIdentity,
): Record<string, unknown> {
  const normalized = parseIosVoipPushPayload({
    callId: call.callId,
    handle: call.handle,
    callerName: call.displayName,
    hasVideo: call.hasVideo,
    metadata: call.metadata ?? {},
  });

  return {
    aps: {
      "content-available": 1,
    },
    callId: normalized.callId,
    handle: normalized.handle,
    callerName: normalized.displayName,
    hasVideo: normalized.hasVideo,
    metadata: normalized.metadata,
  };
}

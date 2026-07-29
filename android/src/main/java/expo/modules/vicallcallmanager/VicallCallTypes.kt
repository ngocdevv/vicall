package expo.modules.vicallcallmanager

import android.net.Uri
import android.os.Bundle
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

internal const val EXTRA_CALL_ID = "expo.modules.vicallcallmanager.CALL_ID"
internal const val EXTRA_HANDLE = "expo.modules.vicallcallmanager.HANDLE"
internal const val EXTRA_DISPLAY_NAME = "expo.modules.vicallcallmanager.DISPLAY_NAME"
internal const val EXTRA_HAS_VIDEO = "expo.modules.vicallcallmanager.HAS_VIDEO"
internal const val EXTRA_DIRECTION = "expo.modules.vicallcallmanager.DIRECTION"
internal const val EXTRA_METADATA = "expo.modules.vicallcallmanager.METADATA"

internal enum class VicallCallDirection(val value: String) {
  INCOMING("incoming"),
  OUTGOING("outgoing"),
}

internal enum class VicallCallEndReason(val value: String) {
  FAILED("failed"),
  REMOTE_ENDED("remoteEnded"),
  UNANSWERED("unanswered"),
  ANSWERED_ELSEWHERE("answeredElsewhere"),
  DECLINED_ELSEWHERE("declinedElsewhere"),
  MISSED("missed");

  companion object {
    fun from(value: String): VicallCallEndReason =
      entries.firstOrNull { it.value == value } ?: FAILED
  }
}

internal data class VicallCallDescriptor(
  val callId: UUID,
  val handle: String,
  val displayName: String,
  val hasVideo: Boolean,
  val metadata: Map<String, Any?>,
  val direction: VicallCallDirection,
) {
  fun toBundle(): Bundle = Bundle().apply {
    putString(EXTRA_CALL_ID, callId.toString())
    putString(EXTRA_HANDLE, handle)
    putString(EXTRA_DISPLAY_NAME, displayName)
    putBoolean(EXTRA_HAS_VIDEO, hasVideo)
    putString(EXTRA_DIRECTION, direction.value)
    putString(EXTRA_METADATA, JSONObject(metadata).toString())
  }

  fun eventFields(): Map<String, Any?> = mapOf(
    "callId" to callId.toString(),
    "direction" to direction.value,
    "handle" to handle,
    "displayName" to displayName,
    "hasVideo" to hasVideo,
    "metadata" to metadata,
  )

  fun address(): Uri = Uri.fromParts("vicall", handle, null)

  companion object {
    fun fromMap(
      value: Map<String, Any?>,
      direction: VicallCallDirection,
    ): VicallCallDescriptor {
      val callId = value["callId"] as? String
        ?: throw IllegalArgumentException("callId is required")
      val uuid = runCatching { UUID.fromString(callId) }
        .getOrElse {
          throw IllegalArgumentException(
            "callId must be a valid RFC 4122 UUID",
          )
        }
      val handle = (value["handle"] as? String)
        ?.trim()
        ?.takeIf { it.isNotEmpty() }
        ?: throw IllegalArgumentException("handle must not be empty")

      @Suppress("UNCHECKED_CAST")
      val metadata = value["metadata"] as? Map<String, Any?> ?: emptyMap()

      return VicallCallDescriptor(
        callId = uuid,
        handle = handle,
        displayName = value["displayName"] as? String ?: handle,
        hasVideo = value["hasVideo"] as? Boolean ?: false,
        metadata = metadata,
        direction = direction,
      )
    }

    fun fromBundle(
      bundle: Bundle,
      fallbackDirection: VicallCallDirection,
    ): VicallCallDescriptor {
      val uuid = UUID.fromString(
        bundle.getString(EXTRA_CALL_ID)
          ?: throw IllegalArgumentException("Missing callId"),
      )
      val handle = bundle.getString(EXTRA_HANDLE)
        ?: throw IllegalArgumentException("Missing handle")
      val direction = when (bundle.getString(EXTRA_DIRECTION)) {
        VicallCallDirection.OUTGOING.value -> VicallCallDirection.OUTGOING
        VicallCallDirection.INCOMING.value -> VicallCallDirection.INCOMING
        else -> fallbackDirection
      }

      return VicallCallDescriptor(
        callId = uuid,
        handle = handle,
        displayName = bundle.getString(EXTRA_DISPLAY_NAME) ?: handle,
        hasVideo = bundle.getBoolean(EXTRA_HAS_VIDEO, false),
        metadata = jsonObjectToMap(
          JSONObject(bundle.getString(EXTRA_METADATA) ?: "{}"),
        ),
        direction = direction,
      )
    }
  }
}

internal fun jsonObjectToMap(value: JSONObject): Map<String, Any?> {
  val result = mutableMapOf<String, Any?>()
  value.keys().forEach { key ->
    result[key] = jsonValue(value.opt(key))
  }
  return result
}

private fun jsonArrayToList(value: JSONArray): List<Any?> =
  (0 until value.length()).map { index -> jsonValue(value.opt(index)) }

private fun jsonValue(value: Any?): Any? = when (value) {
  JSONObject.NULL -> null
  is JSONObject -> jsonObjectToMap(value)
  is JSONArray -> jsonArrayToList(value)
  else -> value
}

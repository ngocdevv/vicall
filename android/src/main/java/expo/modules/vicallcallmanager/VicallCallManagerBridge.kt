package expo.modules.vicallcallmanager

import android.content.Context
import org.json.JSONObject
import java.util.UUID

/**
 * Entry point for an app-owned FirebaseMessagingService.
 *
 * This deliberately does not depend on Firebase. The app can use FCM, another
 * push provider, or a test harness and pass a verified call payload here.
 */
object VicallCallManagerBridge {
  @JvmStatic
  fun displayIncomingCall(
    context: Context,
    callId: String,
    handle: String,
    displayName: String,
    hasVideo: Boolean,
    metadataJson: String = "{}",
  ) {
    val descriptor = VicallCallDescriptor(
      callId = UUID.fromString(callId),
      handle = handle,
      displayName = displayName,
      hasVideo = hasVideo,
      metadata = jsonObjectToMap(JSONObject(metadataJson)),
      direction = VicallCallDirection.INCOMING,
    )
    VicallTelecomManager.displayIncomingCall(
      context.applicationContext,
      descriptor,
    )
  }
}

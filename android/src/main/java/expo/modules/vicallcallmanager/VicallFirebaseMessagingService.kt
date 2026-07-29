package expo.modules.vicallcallmanager

import android.content.Context
import com.google.firebase.messaging.RemoteMessage
import expo.modules.notifications.service.ExpoFirebaseMessagingService
import expo.modules.notifications.service.delegates.FirebaseMessagingDelegate
import expo.modules.notifications.service.interfaces.FirebaseMessagingDelegate as FirebaseMessagingDelegateInterface
import java.util.UUID

/**
 * Preserves expo-notifications for normal pushes while handling call wakeups
 * natively before React Native is initialized.
 */
class VicallFirebaseMessagingService : ExpoFirebaseMessagingService() {
  override val firebaseMessagingDelegate:
    FirebaseMessagingDelegateInterface by lazy {
      VicallFirebaseMessagingDelegate(this)
    }
}

private class VicallFirebaseMessagingDelegate(
  context: Context,
) : FirebaseMessagingDelegate(context) {
  override fun onMessageReceived(remoteMessage: RemoteMessage) {
    when (remoteMessage.data["vicallType"]) {
      "incoming_call" -> handleIncomingCall(remoteMessage.data)
      "cancel_call" -> handleCancelledCall(remoteMessage.data)
      else -> super.onMessageReceived(remoteMessage)
    }
  }

  private fun handleIncomingCall(data: Map<String, String>) {
    runCatching {
      VicallCallManagerBridge.displayIncomingCall(
        context = context,
        callId = requireData(data, "callId"),
        handle = requireData(data, "handle"),
        displayName = data["displayName"]
          ?: data["callerName"]
          ?: requireData(data, "handle"),
        hasVideo = data["hasVideo"]?.toBooleanStrictOrNull() ?: false,
        metadataJson = data["metadata"] ?: "{}",
      )
    }.onFailure { error ->
      VicallCallEventStore.emit(
        "incomingCallFailed",
        mapOf(
          "callId" to data["callId"],
          "reason" to (
            error.message ?: "Invalid incoming-call FCM payload"
            ),
        ),
      )
    }
  }

  private fun handleCancelledCall(data: Map<String, String>) {
    val callId = data["callId"]
      ?.let { runCatching { UUID.fromString(it) }.getOrNull() }
      ?: return
    val connection = VicallCallRegistry.get(callId) ?: return
    connection.endFromApp(
      VicallCallEndReason.from(data["reason"] ?: "remoteEnded"),
    )
  }

  private fun requireData(
    data: Map<String, String>,
    key: String,
  ): String = data[key]?.takeIf { it.isNotBlank() }
    ?: throw IllegalArgumentException("Missing FCM data field: $key")
}

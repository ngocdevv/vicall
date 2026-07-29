package expo.modules.vicallcallmanager

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import java.util.UUID

class VicallCallActionReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val callId = intent.getStringExtra(EXTRA_CALL_ID)
      ?.let { runCatching { UUID.fromString(it) }.getOrNull() }
      ?: return
    val connection = VicallCallRegistry.get(callId) ?: return

    when (intent.action) {
      VicallCallNotification.ACTION_ANSWER -> connection.answerFromApp()
      VicallCallNotification.ACTION_DECLINE -> connection.rejectFromApp()
      VicallCallNotification.ACTION_END -> connection.disconnectFromApp()
    }
  }
}

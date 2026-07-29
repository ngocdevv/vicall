package expo.modules.vicallcallmanager

import android.content.Context
import android.content.Intent
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

internal object VicallCallRegistry {
  private val calls = ConcurrentHashMap<UUID, VicallConnection>()

  fun put(connection: VicallConnection) {
    calls[connection.descriptor.callId] = connection
  }

  fun get(callId: UUID): VicallConnection? = calls[callId]

  fun remove(callId: UUID) {
    calls.remove(callId)
  }

  fun all(): List<VicallConnection> = calls.values.toList()

  fun isEmpty(): Boolean = calls.isEmpty()

  fun launchApplication(context: Context, callId: UUID) {
    val launchIntent = context.packageManager
      .getLaunchIntentForPackage(context.packageName)
      ?: return
    launchIntent
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
      .putExtra(EXTRA_CALL_ID, callId.toString())
    context.startActivity(launchIntent)
  }
}

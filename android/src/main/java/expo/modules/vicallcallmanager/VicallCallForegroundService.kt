package expo.modules.vicallcallmanager

import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.ServiceCompat

class VicallCallForegroundService : Service() {
  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(
    intent: Intent?,
    flags: Int,
    startId: Int,
  ): Int {
    val callId = intent?.getStringExtra(EXTRA_CALL_ID)
      ?.let { runCatching { java.util.UUID.fromString(it) }.getOrNull() }
    val descriptor = callId?.let { VicallCallRegistry.get(it)?.descriptor }

    if (descriptor == null) {
      stopSelf()
      return START_NOT_STICKY
    }

    val serviceType = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      ServiceInfo.FOREGROUND_SERVICE_TYPE_PHONE_CALL
    } else {
      0
    }
    ServiceCompat.startForeground(
      this,
      VicallCallNotification.notificationId(descriptor.callId),
      VicallCallNotification.ongoingNotification(this, descriptor),
      serviceType,
    )
    return START_NOT_STICKY
  }

  companion object {
    internal fun start(
      context: Context,
      descriptor: VicallCallDescriptor,
    ) {
      val intent = Intent(context, VicallCallForegroundService::class.java)
        .putExtra(EXTRA_CALL_ID, descriptor.callId.toString())
      runCatching {
        androidx.core.content.ContextCompat.startForegroundService(
          context,
          intent,
        )
      }.onFailure {
        VicallCallEventStore.emit(
          "incomingCallFailed",
          descriptor.eventFields() + (
            "reason" to "Unable to start call foreground service: ${it.message}"
          ),
        )
      }
    }

    fun stop(context: Context) {
      context.stopService(
        Intent(context, VicallCallForegroundService::class.java),
      )
    }
  }
}

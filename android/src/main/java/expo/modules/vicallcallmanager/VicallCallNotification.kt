package expo.modules.vicallcallmanager

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.Person
import java.util.UUID
import kotlin.math.absoluteValue

internal object VicallCallNotification {
  const val ACTION_ANSWER = "expo.modules.vicallcallmanager.ANSWER"
  const val ACTION_DECLINE = "expo.modules.vicallcallmanager.DECLINE"
  const val ACTION_END = "expo.modules.vicallcallmanager.END"

  fun showIncoming(context: Context, descriptor: VicallCallDescriptor) {
    createChannel(context)
    val notification = incomingNotification(context, descriptor)
    runCatching {
      NotificationManagerCompat.from(context).notify(
        notificationId(descriptor.callId),
        notification,
      )
    }.onFailure {
      VicallCallEventStore.emit(
        "incomingCallFailed",
        descriptor.eventFields() + (
          "reason" to
            "Unable to post the incoming-call notification: ${it.message}"
          ),
      )
    }
  }

  fun ongoingNotification(
    context: Context,
    descriptor: VicallCallDescriptor,
    muted: Boolean = false,
  ): Notification {
    createChannel(context)
    val person = Person.Builder()
      .setName(descriptor.displayName)
      .setImportant(true)
      .build()
    val hangupIntent = actionIntent(context, descriptor.callId, ACTION_END, 3)
    val contentText = buildString {
      append(if (descriptor.hasVideo) "Ongoing video call" else "Ongoing call")
      if (muted) append(" · Muted")
    }

    return baseBuilder(context, descriptor)
      .setContentText(contentText)
      .setOngoing(true)
      .setStyle(
        NotificationCompat.CallStyle.forOngoingCall(person, hangupIntent)
          .setIsVideo(descriptor.hasVideo),
      )
      .build()
  }

  fun cancel(context: Context, callId: UUID) {
    NotificationManagerCompat.from(context).cancel(notificationId(callId))
  }

  fun notificationId(callId: UUID): Int =
    callId.hashCode().absoluteValue.coerceAtLeast(1)

  private fun incomingNotification(
    context: Context,
    descriptor: VicallCallDescriptor,
  ): Notification {
    val person = Person.Builder()
      .setName(descriptor.displayName)
      .setImportant(true)
      .build()
    val declineIntent = actionIntent(
      context,
      descriptor.callId,
      ACTION_DECLINE,
      1,
    )
    val answerIntent = actionIntent(
      context,
      descriptor.callId,
      ACTION_ANSWER,
      2,
    )
    val fullScreenIntent = launchIntent(context, descriptor.callId)

    return baseBuilder(context, descriptor)
      .setOngoing(true)
      .setTimeoutAfter(60_000)
      .setFullScreenIntent(fullScreenIntent, true)
      .setStyle(
        NotificationCompat.CallStyle.forIncomingCall(
          person,
          declineIntent,
          answerIntent,
        ).setIsVideo(descriptor.hasVideo),
      )
      .build()
  }

  private fun baseBuilder(
    context: Context,
    descriptor: VicallCallDescriptor,
  ): NotificationCompat.Builder {
    val configuration = VicallNativeConfiguration.load(context)
    val icon = resolveSmallIcon(context, configuration.notificationIcon)

    return NotificationCompat.Builder(context, configuration.channelId)
      .setSmallIcon(icon)
      .setContentTitle(descriptor.displayName)
      .setContentText(
        if (descriptor.hasVideo) "Incoming video call" else "Incoming call",
      )
      .setCategory(NotificationCompat.CATEGORY_CALL)
      .setPriority(NotificationCompat.PRIORITY_MAX)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setContentIntent(launchIntent(context, descriptor.callId))
  }

  private fun createChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val configuration = VicallNativeConfiguration.load(context)
    val manager = context.getSystemService(NotificationManager::class.java)
    if (manager.getNotificationChannel(configuration.channelId) != null) {
      return
    }

    val audioAttributes = AudioAttributes.Builder()
      .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
      .build()
    val channel = NotificationChannel(
      configuration.channelId,
      configuration.channelName,
      NotificationManager.IMPORTANCE_HIGH,
    ).apply {
      description = "Incoming and ongoing Vicall calls"
      lockscreenVisibility = Notification.VISIBILITY_PUBLIC
      setSound(
        android.provider.Settings.System.DEFAULT_RINGTONE_URI,
        audioAttributes,
      )
      enableVibration(true)
    }
    manager.createNotificationChannel(channel)
  }

  private fun actionIntent(
    context: Context,
    callId: UUID,
    action: String,
    requestCode: Int,
  ): PendingIntent {
    val intent = Intent(context, VicallCallActionReceiver::class.java)
      .setAction(action)
      .putExtra(EXTRA_CALL_ID, callId.toString())
    return PendingIntent.getBroadcast(
      context,
      notificationId(callId) + requestCode,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  private fun launchIntent(context: Context, callId: UUID): PendingIntent {
    val intent = context.packageManager
      .getLaunchIntentForPackage(context.packageName)
      ?.addFlags(
        Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP,
      )
      ?.putExtra(EXTRA_CALL_ID, callId.toString())
      ?: Intent()
    return PendingIntent.getActivity(
      context,
      notificationId(callId),
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  private fun resolveSmallIcon(context: Context, configuredName: String): Int {
    if (configuredName.isNotBlank()) {
      val drawable = context.resources.getIdentifier(
        configuredName,
        "drawable",
        context.packageName,
      )
      if (drawable != 0) return drawable
      val mipmap = context.resources.getIdentifier(
        configuredName,
        "mipmap",
        context.packageName,
      )
      if (mipmap != 0) return mipmap
    }
    return context.applicationInfo.icon
  }
}

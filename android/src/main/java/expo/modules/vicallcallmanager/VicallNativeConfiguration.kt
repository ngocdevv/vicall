package expo.modules.vicallcallmanager

import android.content.Context
import android.content.pm.PackageManager
import android.os.Bundle

internal data class VicallNativeConfiguration(
  val appName: String,
  val supportsVideo: Boolean,
  val channelId: String,
  val channelName: String,
  val notificationIcon: String,
) {
  companion object {
    private const val PREFIX = "expo.modules.vicallcallmanager"

    fun load(context: Context): VicallNativeConfiguration {
      val applicationInfo = context.packageManager.getApplicationInfo(
        context.packageName,
        PackageManager.GET_META_DATA,
      )
      val metadata = applicationInfo.metaData ?: Bundle.EMPTY
      val fallbackName = context.applicationInfo.loadLabel(
        context.packageManager,
      ).toString()

      return VicallNativeConfiguration(
        appName = metadata.getString("$PREFIX.APP_NAME") ?: fallbackName,
        supportsVideo = metadata.getString("$PREFIX.SUPPORTS_VIDEO")
          ?.toBooleanStrictOrNull()
          ?: metadata.getBoolean("$PREFIX.SUPPORTS_VIDEO", true),
        channelId = metadata.getString("$PREFIX.CHANNEL_ID")
          ?: "vicall_calls",
        channelName = metadata.getString("$PREFIX.CHANNEL_NAME") ?: "Calls",
        notificationIcon = metadata.getString("$PREFIX.NOTIFICATION_ICON")
          ?: "",
      )
    }
  }
}

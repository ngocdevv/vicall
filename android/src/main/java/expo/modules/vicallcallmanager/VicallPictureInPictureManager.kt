package expo.modules.vicallcallmanager

import android.app.Activity
import android.app.PictureInPictureParams
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Rect
import android.os.Build
import android.util.Rational
import android.view.View
import java.lang.ref.WeakReference

object VicallPictureInPictureManager {
  private var sourceView = WeakReference<View>(null)
  private var aspectRatio = Rational(9, 16)
  private var sourceRect: Rect? = null
  private var autoEnterEnabled = true
  private var seamlessResizeEnabled = true
  private var prepared = false
  private var lastKnownActive = false

  fun isSupported(context: Context): Boolean =
    Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
      context.packageManager.hasSystemFeature(
        PackageManager.FEATURE_PICTURE_IN_PICTURE,
      )

  fun isActive(activity: Activity?): Boolean =
    Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
      activity?.isInPictureInPictureMode == true

  fun prepare(
    activity: Activity,
    videoView: View?,
    options: Map<String, Any?>?,
  ) {
    requireSupported(activity)
    sourceView = WeakReference(videoView)
    aspectRatio = readAspectRatio(options)
    sourceRect = readSourceRect(options) ?: visibleRect(videoView)
    autoEnterEnabled = options?.get("autoEnterEnabled") as? Boolean ?: true
    seamlessResizeEnabled =
      options?.get("seamlessResizeEnabled") as? Boolean ?: true
    prepared = true
    updateParams(activity)
  }

  fun setAutoEnterEnabled(activity: Activity, enabled: Boolean) {
    requireSupported(activity)
    autoEnterEnabled = enabled
    updateParams(activity)
  }

  fun start(activity: Activity) {
    requireSupported(activity)
    check(prepared) {
      "Call preparePictureInPicture() before starting Picture in Picture."
    }
    VicallPictureInPictureEventStore.emit("willStart", active = false)
    try {
      sourceRect = visibleRect(sourceView.get()) ?: sourceRect
      val entered = activity.enterPictureInPictureMode(buildParams())
      if (entered) return

      error("Android rejected the Picture in Picture request.")
    } catch (error: Throwable) {
      val message = error.message ?: "Android rejected the Picture in Picture request."
      VicallPictureInPictureEventStore.emit(
        type = "failedToStart",
        active = false,
        error = message,
      )
      throw error
    }
  }

  fun stop(activity: Activity) {
    if (!isActive(activity)) return
    VicallPictureInPictureEventStore.emit("willStop", active = true)
    val launchIntent = activity.packageManager
      .getLaunchIntentForPackage(activity.packageName)
      ?: return
    launchIntent.addFlags(
      Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or Intent.FLAG_ACTIVITY_SINGLE_TOP,
    )
    activity.startActivity(launchIntent)
  }

  fun dispose(activity: Activity?) {
    autoEnterEnabled = false
    if (activity != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      updateParams(activity)
    }
    sourceView.clear()
    sourceRect = null
    prepared = false
  }

  fun shouldAutoEnterForLegacy(): Boolean =
    prepared && autoEnterEnabled &&
      Build.VERSION.SDK_INT in Build.VERSION_CODES.O until Build.VERSION_CODES.S

  @JvmStatic
  fun onPictureInPictureModeChanged(active: Boolean) {
    if (lastKnownActive == active) return
    if (active) {
      VicallPictureInPictureEventStore.emit("didStart", active = true)
    } else {
      VicallPictureInPictureEventStore.emit("didStop", active = false)
    }
    VicallPictureInPictureEventStore.emit("stateChanged", active = active)
    lastKnownActive = active
  }

  private fun requireSupported(context: Context) {
    check(isSupported(context)) {
      "Picture in Picture requires Android 8.0 or newer and device support."
    }
  }

  private fun updateParams(activity: Activity) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    activity.setPictureInPictureParams(buildParams())
  }

  private fun buildParams(): PictureInPictureParams {
    check(Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
    val builder = PictureInPictureParams.Builder()
      .setAspectRatio(aspectRatio)
    sourceRect?.let(builder::setSourceRectHint)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      builder.setAutoEnterEnabled(prepared && autoEnterEnabled)
      builder.setSeamlessResizeEnabled(seamlessResizeEnabled)
    }
    return builder.build()
  }

  private fun readAspectRatio(options: Map<String, Any?>?): Rational {
    val width = (options?.get("aspectRatioWidth") as? Number)?.toInt() ?: 9
    val height = (options?.get("aspectRatioHeight") as? Number)?.toInt() ?: 16
    if (width <= 0 || height <= 0) return Rational(9, 16)
    val ratio = width.toDouble() / height.toDouble()
    if (ratio < 1.0 / 2.39 || ratio > 2.39) return Rational(9, 16)
    return runCatching { Rational(width, height) }
      .getOrDefault(Rational(9, 16))
  }

  private fun readSourceRect(options: Map<String, Any?>?): Rect? {
    val value = options?.get("sourceRect") as? Map<*, *> ?: return null
    val x = (value["x"] as? Number)?.toInt() ?: return null
    val y = (value["y"] as? Number)?.toInt() ?: return null
    val width = (value["width"] as? Number)?.toInt() ?: return null
    val height = (value["height"] as? Number)?.toInt() ?: return null
    if (width <= 0 || height <= 0) return null
    return Rect(x, y, x + width, y + height)
  }

  private fun visibleRect(view: View?): Rect? {
    if (view == null || !view.isLaidOut) return null
    return Rect().takeIf(view::getGlobalVisibleRect)
  }
}

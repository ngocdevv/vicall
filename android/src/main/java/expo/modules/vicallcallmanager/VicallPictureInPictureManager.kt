package expo.modules.vicallcallmanager

import android.app.Activity
import android.app.PictureInPictureParams
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Rect
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Rational
import android.view.View
import android.view.ViewGroup
import java.lang.ref.WeakReference

object VicallPictureInPictureManager {
  private var activity = WeakReference<Activity>(null)
  private var sourceView = WeakReference<View>(null)
  private var presentationView = WeakReference<View>(null)
  private var aspectRatio = Rational(9, 16)
  private var sourceRect: Rect? = null
  private var sourceRectWasProvided = false
  private var autoEnterEnabled = true
  private var seamlessResizeEnabled = true
  private var prepared = false
  private var lastKnownActive = false
  private var remoteCameraEnabled = true
  private var presentationSnapshot: PresentationSnapshot? = null
  private val nativeVideoRenderer = VicallAndroidPipVideoRenderer()
  private val mainHandler = Handler(Looper.getMainLooper())
  // React timers may pause while Android keeps the native PiP task alive. Poll
  // the WebRTCView only during PiP so a native RealtimeKit track replacement
  // can be rebound without waiting for the JS runtime to resume.
  private val refreshVideoTrack = object : Runnable {
    override fun run() {
      if (!prepared || !lastKnownActive) return
      val ready = nativeVideoRenderer.refresh(
        activity.get(),
        sourceView.get(),
      )
      if (ready) {
        nativeVideoRenderer.show()
      }
      mainHandler.postDelayed(this, VIDEO_TRACK_REFRESH_INTERVAL_MS)
    }
  }

  private data class PresentationSnapshot(
    val height: Int,
    val translationX: Float,
    val translationY: Float,
    val width: Int,
  )

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
    hybridPresentationView: View?,
    options: Map<String, Any?>?,
  ) {
    requireSupported(activity)
    this.activity = WeakReference(activity)
    sourceView = WeakReference(videoView)
    presentationView = WeakReference(hybridPresentationView)
    presentationSnapshot = null
    nativeVideoRenderer.prepare(activity, videoView)
    aspectRatio = readAspectRatio(options)
    val configuredSourceRect = readSourceRect(options)
    sourceRectWasProvided = configuredSourceRect != null
    sourceRect = configuredSourceRect ?: transitionSourceRect()
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

  fun refreshSourceView(videoView: View?) {
    sourceView = WeakReference(videoView)
    if (!sourceRectWasProvided) {
      sourceRect = transitionSourceRect() ?: sourceRect
    }
    nativeVideoRenderer.refresh(activity.get(), videoView)
  }

  fun updateVisualState(state: Map<String, Any?>) {
    remoteCameraEnabled = state["remoteCameraEnabled"] as? Boolean ?: true
    nativeVideoRenderer.setVideoEnabled(remoteCameraEnabled)
  }

  fun start(activity: Activity) {
    requireSupported(activity)
    check(prepared) {
      "Call preparePictureInPicture() before starting Picture in Picture."
    }
    VicallPictureInPictureEventStore.emit("willStart", active = false)
    try {
      if (!nativeVideoRenderer.show()) {
        preparePresentationViewForSystemPip()
      }
      if (!sourceRectWasProvided) {
        sourceRect = transitionSourceRect() ?: sourceRect
      }
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
    stopVideoTrackRefresh()
    autoEnterEnabled = false
    if (activity != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      updateParams(activity)
    }
    restorePresentationViewAfterSystemPip()
    nativeVideoRenderer.dispose()
    this.activity.clear()
    sourceView.clear()
    presentationView.clear()
    sourceRect = null
    sourceRectWasProvided = false
    prepared = false
    lastKnownActive = false
  }

  fun shouldAutoEnterForLegacy(): Boolean =
    prepared && autoEnterEnabled &&
      Build.VERSION.SDK_INT in Build.VERSION_CODES.O until Build.VERSION_CODES.S

  @JvmStatic
  fun onUserLeaveHint(activity: Activity) {
    preparePresentationForPendingSystemPip(activity, allowReactHandoff = true)
  }

  @JvmStatic
  fun onActivityPausing(activity: Activity) {
    preparePresentationForPendingSystemPip(activity, allowReactHandoff = false)
  }

  private fun preparePresentationForPendingSystemPip(
    activity: Activity,
    allowReactHandoff: Boolean,
  ) {
    if (!prepared || !autoEnterEnabled || isActive(activity)) return
    if (!sourceRectWasProvided) {
      sourceRect = transitionSourceRect() ?: sourceRect
      updateParams(activity)
    }
    nativeVideoRenderer.refresh(activity, sourceView.get())
    val nativeRendererVisible = nativeVideoRenderer.show()
    if (!nativeRendererVisible && allowReactHandoff) {
      preparePresentationViewForSystemPip()
    }
    activity.window.decorView.postDelayed({
      if (!isActive(activity)) {
        nativeVideoRenderer.hide()
        restorePresentationViewAfterSystemPip()
      }
    }, 1_200)
  }

  @JvmStatic
  fun onPictureInPictureModeChanged(active: Boolean) {
    if (active) {
      nativeVideoRenderer.refresh(activity.get(), sourceView.get())
      if (!nativeVideoRenderer.show()) {
        preparePresentationViewForSystemPip()
      }
      startVideoTrackRefresh()
    } else {
      stopVideoTrackRefresh()
      nativeVideoRenderer.hide()
      restorePresentationViewAfterSystemPip()
    }
    if (lastKnownActive == active) return
    if (active) {
      VicallPictureInPictureEventStore.emit("didStart", active = true)
    } else {
      VicallPictureInPictureEventStore.emit("didStop", active = false)
    }
    VicallPictureInPictureEventStore.emit("stateChanged", active = active)
    lastKnownActive = active
  }

  private fun startVideoTrackRefresh() {
    mainHandler.removeCallbacks(refreshVideoTrack)
    mainHandler.post(refreshVideoTrack)
  }

  private fun stopVideoTrackRefresh() {
    mainHandler.removeCallbacks(refreshVideoTrack)
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

  private fun preparePresentationViewForSystemPip() {
    val view = presentationView.get() ?: return
    val layoutParams = view.layoutParams ?: return
    if (presentationSnapshot == null) {
      presentationSnapshot = PresentationSnapshot(
        height = layoutParams.height,
        translationX = view.translationX,
        translationY = view.translationY,
        width = layoutParams.width,
      )
    }

    val left = view.left
    val top = view.top
    layoutParams.width = ViewGroup.LayoutParams.MATCH_PARENT
    layoutParams.height = ViewGroup.LayoutParams.MATCH_PARENT
    view.layoutParams = layoutParams
    view.translationX = -left.toFloat()
    view.translationY = -top.toFloat()
    view.requestLayout()
  }

  private fun restorePresentationViewAfterSystemPip() {
    val view = presentationView.get()
    val snapshot = presentationSnapshot
    presentationSnapshot = null
    if (view == null || snapshot == null) return

    val layoutParams = view.layoutParams ?: return
    layoutParams.width = snapshot.width
    layoutParams.height = snapshot.height
    view.layoutParams = layoutParams
    view.translationX = snapshot.translationX
    view.translationY = snapshot.translationY
    view.requestLayout()
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

  private fun transitionSourceRect(): Rect? {
    val visible = visibleRect(presentationView.get() ?: sourceView.get())
      ?: return null
    if (visible.width() <= 0 || visible.height() <= 0) return null
    val targetRatio = aspectRatio.toDouble()
    val currentRatio = visible.width().toDouble() / visible.height().toDouble()
    if (currentRatio > targetRatio) {
      val width = (visible.height() * targetRatio).toInt().coerceAtLeast(1)
      val left = visible.centerX() - width / 2
      return Rect(left, visible.top, left + width, visible.bottom)
    }
    val height = (visible.width() / targetRatio).toInt().coerceAtLeast(1)
    val top = visible.centerY() - height / 2
    return Rect(visible.left, top, visible.right, top + height)
  }

  private const val VIDEO_TRACK_REFRESH_INTERVAL_MS = 1_000L
}

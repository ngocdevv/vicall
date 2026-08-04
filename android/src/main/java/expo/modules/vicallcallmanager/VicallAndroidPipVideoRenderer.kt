package expo.modules.vicallcallmanager

import android.app.Activity
import android.graphics.Color
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import realtimekit.org.webrtc.EglBase
import realtimekit.org.webrtc.RendererCommon
import realtimekit.org.webrtc.SurfaceViewRenderer
import realtimekit.org.webrtc.VideoTrack

internal class VicallAndroidPipVideoRenderer {
  // A second sink keeps the system PiP surface independent from React layout,
  // navigation, and keyboard changes while reusing RealtimeKit's media track.
  private var attached = false
  private var overlay: FrameLayout? = null
  private var renderer: SurfaceViewRenderer? = null
  private var track: VideoTrack? = null
  private var videoEnabled = true

  fun prepare(activity: Activity, sourceView: View?) {
    dispose()
    val nextTrack = findVideoTrack(sourceView) ?: return
    val sharedContext = findRootEglContext() ?: return
    val content = activity.findViewById<ViewGroup>(android.R.id.content) ?: return

    val overlay = FrameLayout(activity).apply {
      setBackgroundColor(Color.BLACK)
      visibility = View.GONE
    }
    val renderer = SurfaceViewRenderer(activity).apply {
      init(sharedContext, null)
      setEnableHardwareScaler(true)
      setScalingType(RendererCommon.ScalingType.SCALE_ASPECT_FILL)
    }
    overlay.addView(
      renderer,
      FrameLayout.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        ViewGroup.LayoutParams.MATCH_PARENT,
      ),
    )
    content.addView(
      overlay,
      ViewGroup.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        ViewGroup.LayoutParams.MATCH_PARENT,
      ),
    )
    this.overlay = overlay
    this.renderer = renderer
    this.track = nextTrack
  }

  fun refresh(activity: Activity?, sourceView: View?): Boolean {
    val nextTrack = findVideoTrack(sourceView) ?: return false
    if (renderer == null || overlay == null) {
      if (activity != null) {
        prepare(activity, sourceView)
      }
      return renderer != null && overlay != null && track != null
    }
    if (nextTrack === track) return true
    val currentRenderer = renderer
    if (attached && currentRenderer != null) {
      runCatching { track?.removeSink(currentRenderer) }
      attached = runCatching { nextTrack.addSink(currentRenderer) }.isSuccess
    }
    track = nextTrack
    return true
  }

  fun setVideoEnabled(enabled: Boolean) {
    videoEnabled = enabled
    renderer?.visibility = if (enabled) View.VISIBLE else View.INVISIBLE
  }

  fun show(): Boolean {
    val currentOverlay = overlay ?: return false
    val currentRenderer = renderer ?: return false
    val currentTrack = track ?: return false
    currentOverlay.visibility = View.VISIBLE
    currentOverlay.bringToFront()
    currentRenderer.visibility = if (videoEnabled) View.VISIBLE else View.INVISIBLE
    if (!attached) {
      runCatching { currentTrack.addSink(currentRenderer) }
        .onFailure { return false }
      attached = true
    }
    return true
  }

  fun hide() {
    val currentRenderer = renderer
    if (attached && currentRenderer != null) {
      runCatching { track?.removeSink(currentRenderer) }
    }
    attached = false
    overlay?.visibility = View.GONE
  }

  fun dispose() {
    hide()
    renderer?.release()
    overlay?.let { view ->
      (view.parent as? ViewGroup)?.removeView(view)
    }
    renderer = null
    overlay = null
    track = null
  }

  private fun findVideoTrack(view: View?): VideoTrack? {
    if (view == null) return null
    if (view.javaClass.name == WEB_RTC_VIEW_CLASS) {
      val field = runCatching {
        view.javaClass.getDeclaredField("videoTrack").apply {
          isAccessible = true
        }
      }.getOrNull()
      return runCatching { field?.get(view) as? VideoTrack }.getOrNull()
    }
    if (view is ViewGroup) {
      for (index in 0 until view.childCount) {
        findVideoTrack(view.getChildAt(index))?.let { return it }
      }
    }
    return null
  }

  private fun findRootEglContext(): EglBase.Context? = runCatching {
    val eglUtils = Class.forName(EGL_UTILS_CLASS)
    eglUtils.getMethod("getRootEglBaseContext").invoke(null) as? EglBase.Context
  }.getOrNull()

  private companion object {
    const val EGL_UTILS_CLASS =
      "com.cloudflare.realtimekit.WebRTCModule.EglUtils"
    const val WEB_RTC_VIEW_CLASS =
      "com.cloudflare.realtimekit.WebRTCModule.WebRTCView"
  }
}

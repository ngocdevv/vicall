package expo.modules.vicallcallmanager

import android.content.Context
import android.telecom.CallAudioState
import android.telecom.Connection
import android.telecom.DisconnectCause
import android.telecom.TelecomManager
import android.telecom.VideoProfile

internal class VicallConnection(
  private val context: Context,
  descriptor: VicallCallDescriptor,
) : Connection() {
  var descriptor: VicallCallDescriptor = descriptor
    private set
  private var answered = false
  private var finished = false
  private var muted = false
  private var held = false

  init {
    setAddress(descriptor.address(), TelecomManager.PRESENTATION_ALLOWED)
    setCallerDisplayName(
      descriptor.displayName,
      TelecomManager.PRESENTATION_ALLOWED,
    )
    setAudioModeIsVoip(true)
    setConnectionProperties(PROPERTY_SELF_MANAGED)
    setConnectionCapabilities(
      CAPABILITY_MUTE or CAPABILITY_HOLD or CAPABILITY_SUPPORT_HOLD,
    )
    setVideoState(
      if (descriptor.hasVideo) {
        VideoProfile.STATE_BIDIRECTIONAL
      } else {
        VideoProfile.STATE_AUDIO_ONLY
      },
    )
  }

  override fun onShowIncomingCallUi() {
    VicallCallNotification.showIncoming(context, descriptor)
    emit("showIncomingCallUi")
  }

  override fun onAnswer() {
    answer()
  }

  override fun onAnswer(videoState: Int) {
    answer()
  }

  override fun onReject() {
    rejectFromApp()
  }

  override fun onReject(rejectReason: Int) {
    rejectFromApp()
  }

  override fun onReject(replyMessage: String?) {
    rejectFromApp()
  }

  override fun onDisconnect() {
    finish(DisconnectCause.LOCAL, "end")
  }

  override fun onAbort() {
    finish(DisconnectCause.CANCELED, "end")
  }

  override fun onHold() {
    if (held) return
    held = true
    setOnHold()
    emit("hold", mapOf("held" to true))
  }

  override fun onUnhold() {
    if (!held) return
    held = false
    setActive()
    emit("hold", mapOf("held" to false))
  }

  override fun onPlayDtmfTone(dtmf: Char) {
    emit("dtmf", mapOf("digits" to dtmf.toString()))
  }

  @Suppress("DEPRECATION")
  override fun onCallAudioStateChanged(state: CallAudioState) {
    super.onCallAudioStateChanged(state)
    emit(
      "audioRouteChanged",
      mapOf("output" to CallAudioState.audioRouteToString(state.route)),
    )
    if (state.isMuted != muted) {
      muted = state.isMuted
      refreshOngoingNotification()
      emit("mute", mapOf("muted" to muted))
    }
  }

  fun answerFromApp() {
    answer()
  }

  fun rejectFromApp() {
    finish(DisconnectCause.REJECTED, "end", "declined")
  }

  fun disconnectFromApp() {
    finish(DisconnectCause.LOCAL, "end")
  }

  fun endFromApp(reason: VicallCallEndReason) {
    val nativeReason = when (reason) {
      VicallCallEndReason.FAILED -> DisconnectCause.ERROR
      VicallCallEndReason.REMOTE_ENDED,
      VicallCallEndReason.DECLINED_ELSEWHERE,
      -> DisconnectCause.REMOTE
      VicallCallEndReason.UNANSWERED -> DisconnectCause.BUSY
      VicallCallEndReason.ANSWERED_ELSEWHERE ->
        DisconnectCause.ANSWERED_ELSEWHERE
      VicallCallEndReason.MISSED -> DisconnectCause.MISSED
    }
    finish(nativeReason, "end", reason.value)
  }

  fun setMutedFromApp(shouldMute: Boolean) {
    if (muted == shouldMute) return
    muted = shouldMute
    // Self-managed Telecom does not expose Connection.setMuted; keep local
    // state, refresh the ongoing notification, and command the media layer.
    refreshOngoingNotification()
    emit("mute", mapOf("muted" to muted))
  }

  fun setHeldFromApp(shouldHold: Boolean) {
    if (shouldHold) onHold() else onUnhold()
  }

  fun markActive() {
    if (finished) return
    answered = true
    setActive()
    VicallCallNotification.cancel(context, descriptor.callId)
    VicallCallForegroundService.start(context, descriptor, muted)
  }

  fun updateDisplay(
    displayName: String,
    handle: String?,
    hasVideo: Boolean?,
  ) {
    descriptor = descriptor.copy(
      displayName = displayName,
      handle = handle ?: descriptor.handle,
      hasVideo = hasVideo ?: descriptor.hasVideo,
    )
    setCallerDisplayName(
      descriptor.displayName,
      TelecomManager.PRESENTATION_ALLOWED,
    )
    setAddress(descriptor.address(), TelecomManager.PRESENTATION_ALLOWED)
    setVideoState(
      if (descriptor.hasVideo) {
        VideoProfile.STATE_BIDIRECTIONAL
      } else {
        VideoProfile.STATE_AUDIO_ONLY
      },
    )
    refreshOngoingNotification()
  }

  fun snapshot(): Map<String, Any?> = descriptor.eventFields() + mapOf(
    "state" to when {
      finished -> "ended"
      held -> "held"
      answered -> "active"
      descriptor.direction == VicallCallDirection.INCOMING -> "ringing"
      else -> "dialing"
    },
    "muted" to muted,
  )

  private fun answer() {
    if (answered || finished) return
    answered = true
    setActive()
    VicallCallNotification.cancel(context, descriptor.callId)
    VicallCallForegroundService.start(context, descriptor, muted)
    emit("answer")
    VicallCallRegistry.launchApplication(context, descriptor.callId)
  }

  private fun finish(
    disconnectCode: Int,
    eventType: String,
    reason: String? = null,
  ) {
    if (finished) return
    finished = true
    setDisconnected(DisconnectCause(disconnectCode))
    destroy()
    VicallCallNotification.cancel(context, descriptor.callId)
    VicallCallRegistry.remove(descriptor.callId)
    VicallPendingCancellationStore.consume(descriptor.callId)
    if (VicallCallRegistry.isEmpty()) {
      VicallCallForegroundService.stop(context)
    }
    emit(eventType, reason?.let { mapOf("reason" to it) } ?: emptyMap())
  }

  private fun refreshOngoingNotification() {
    if (!answered || finished) return
    VicallCallForegroundService.start(context, descriptor, muted)
  }

  private fun emit(
    type: String,
    fields: Map<String, Any?> = emptyMap(),
  ) {
    VicallCallEventStore.emit(type, descriptor.eventFields() + fields)
  }
}

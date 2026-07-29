package expo.modules.vicallcallmanager

import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.UUID

class ExpoVicallCallManagerModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ExpoVicallCallManager")

    Events("onCallEvent")

    OnStartObserving("onCallEvent") {
      VicallCallEventStore.attach { event ->
        sendEvent("onCallEvent", event)
      }
    }

    OnStopObserving("onCallEvent") {
      VicallCallEventStore.detach()
    }

    OnDestroy {
      VicallCallEventStore.detach()
    }

    AsyncFunction("setup") {
      VicallTelecomManager.setup(requireContext())
    }

    AsyncFunction("displayIncomingCall") { call: Map<String, Any?> ->
      val descriptor = VicallCallDescriptor.fromMap(
        call,
        VicallCallDirection.INCOMING,
      )
      VicallTelecomManager.displayIncomingCall(requireContext(), descriptor)
    }

    AsyncFunction("startCall") { call: Map<String, Any?> ->
      val descriptor = VicallCallDescriptor.fromMap(
        call,
        VicallCallDirection.OUTGOING,
      )
      VicallTelecomManager.startOutgoingCall(requireContext(), descriptor)
    }

    AsyncFunction("answerCall") { callId: String ->
      requireConnection(callId).answerFromApp()
    }

    AsyncFunction("endCall") { callId: String ->
      requireConnection(callId).disconnectFromApp()
    }

    AsyncFunction("endAllCalls") {
      VicallCallRegistry.all().forEach {
        it.disconnectFromApp()
      }
    }

    AsyncFunction("setMuted") { callId: String, muted: Boolean ->
      requireConnection(callId).setMutedFromApp(muted)
    }

    AsyncFunction("setHeld") { callId: String, held: Boolean ->
      requireConnection(callId).setHeldFromApp(held)
    }

    AsyncFunction("setCallActive") { callId: String ->
      requireConnection(callId).markActive()
    }

    AsyncFunction("reportOutgoingCallConnecting") { _: String ->
      // Android Telecom enters STATE_DIALING when the connection is created.
    }

    AsyncFunction("reportOutgoingCallConnected") { callId: String ->
      requireConnection(callId).markActive()
    }

    AsyncFunction("reportCallEnded") { callId: String, reason: String ->
      requireConnection(callId).endFromApp(VicallCallEndReason.from(reason))
    }

    AsyncFunction("updateCallDisplay") {
      callId: String,
      displayName: String,
      handle: String?,
      hasVideo: Boolean?,
      ->
      val connection = requireConnection(callId)
      connection.updateDisplay(displayName, handle, hasVideo)
    }

    AsyncFunction("getCalls") {
      VicallCallRegistry.all().map { it.snapshot() }
    }

    AsyncFunction("getInitialEvents") {
      VicallCallEventStore.initialEvents()
    }

    AsyncFunction("clearInitialEvents") {
      VicallCallEventStore.clearInitialEvents()
    }

    AsyncFunction("getVoipPushToken") {
      null
    }

    AsyncFunction("canUseFullScreenIntent") {
      canUseFullScreenIntent(requireContext())
    }

    AsyncFunction("openFullScreenIntentSettings") {
      openFullScreenIntentSettings(requireContext())
    }
  }

  private fun requireContext(): Context =
    appContext.reactContext?.applicationContext
      ?: throw IllegalStateException("React context is not available")

  private fun requireConnection(callId: String): VicallConnection {
    val uuid = runCatching { UUID.fromString(callId) }
      .getOrElse {
        throw IllegalArgumentException(
          "callId must be a valid RFC 4122 UUID",
        )
      }
    return VicallCallRegistry.get(uuid)
      ?: throw IllegalStateException("No native call exists for this callId")
  }

  private fun canUseFullScreenIntent(context: Context): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      return true
    }
    return context.getSystemService(NotificationManager::class.java)
      .canUseFullScreenIntent()
  }

  private fun openFullScreenIntentSettings(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) return
    val intent = Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT)
      .setData(Uri.parse("package:${context.packageName}"))
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    context.startActivity(intent)
  }
}

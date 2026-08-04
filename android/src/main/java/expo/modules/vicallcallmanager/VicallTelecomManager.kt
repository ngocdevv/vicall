package expo.modules.vicallcallmanager

import android.content.ComponentName
import android.content.Context
import android.telecom.PhoneAccount
import android.telecom.PhoneAccountHandle
import android.telecom.TelecomManager

internal object VicallTelecomManager {
  private const val PHONE_ACCOUNT_ID = "vicall-self-managed"

  fun setup(context: Context) {
    val telecomManager = telecomManager(context)
    val configuration = VicallNativeConfiguration.load(context)
    val account = PhoneAccount.builder(
      phoneAccountHandle(context),
      configuration.appName,
    )
      .setCapabilities(
        PhoneAccount.CAPABILITY_SELF_MANAGED or
          if (configuration.supportsVideo) {
            PhoneAccount.CAPABILITY_VIDEO_CALLING
          } else {
            0
          },
      )
      .addSupportedUriScheme("vicall")
      .build()

    telecomManager.registerPhoneAccount(account)
  }

  fun displayIncomingCall(
    context: Context,
    descriptor: VicallCallDescriptor,
  ) {
    // Dedupe retries for the same call identity.
    if (VicallCallRegistry.get(descriptor.callId) != null) {
      VicallCallEventStore.emit(
        "incomingCallDisplayed",
        descriptor.eventFields(),
      )
      return
    }

    // Cancel already arrived and was emitted; suppress the UI only.
    if (VicallPendingCancellationStore.consume(descriptor.callId) != null) {
      return
    }

    setup(context)
    val extras = descriptor.toBundle().apply {
      putParcelable(
        TelecomManager.EXTRA_INCOMING_CALL_ADDRESS,
        descriptor.address(),
      )
      putInt(
        TelecomManager.EXTRA_INCOMING_VIDEO_STATE,
        if (descriptor.hasVideo) {
          android.telecom.VideoProfile.STATE_BIDIRECTIONAL
        } else {
          android.telecom.VideoProfile.STATE_AUDIO_ONLY
        },
      )
    }
    telecomManager(context).addNewIncomingCall(
      phoneAccountHandle(context),
      extras,
    )
  }

  fun startOutgoingCall(
    context: Context,
    descriptor: VicallCallDescriptor,
  ) {
    if (VicallCallRegistry.get(descriptor.callId) != null) {
      return
    }

    setup(context)
    val extras = descriptor.toBundle().apply {
      putParcelable(
        TelecomManager.EXTRA_PHONE_ACCOUNT_HANDLE,
        phoneAccountHandle(context),
      )
      putInt(
        TelecomManager.EXTRA_START_CALL_WITH_VIDEO_STATE,
        if (descriptor.hasVideo) {
          android.telecom.VideoProfile.STATE_BIDIRECTIONAL
        } else {
          android.telecom.VideoProfile.STATE_AUDIO_ONLY
        },
      )
    }
    telecomManager(context).placeCall(descriptor.address(), extras)
  }

  private fun telecomManager(context: Context): TelecomManager =
    context.getSystemService(Context.TELECOM_SERVICE) as TelecomManager

  private fun phoneAccountHandle(context: Context): PhoneAccountHandle =
    PhoneAccountHandle(
      ComponentName(context, VicallConnectionService::class.java),
      PHONE_ACCOUNT_ID,
    )
}

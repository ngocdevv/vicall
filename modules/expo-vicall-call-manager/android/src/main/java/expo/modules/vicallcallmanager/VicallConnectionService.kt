package expo.modules.vicallcallmanager

import android.telecom.Connection
import android.telecom.ConnectionRequest
import android.telecom.ConnectionService
import android.telecom.DisconnectCause
import android.telecom.PhoneAccountHandle

class VicallConnectionService : ConnectionService() {
  override fun onCreateIncomingConnection(
    connectionManagerPhoneAccount: PhoneAccountHandle?,
    request: ConnectionRequest,
  ): Connection = createConnection(
    descriptor = VicallCallDescriptor.fromBundle(
      request.extras ?: android.os.Bundle.EMPTY,
      VicallCallDirection.INCOMING,
    ),
    incoming = true,
  )

  override fun onCreateOutgoingConnection(
    connectionManagerPhoneAccount: PhoneAccountHandle?,
    request: ConnectionRequest,
  ): Connection = createConnection(
    descriptor = VicallCallDescriptor.fromBundle(
      request.extras ?: android.os.Bundle.EMPTY,
      VicallCallDirection.OUTGOING,
    ),
    incoming = false,
  )

  override fun onCreateIncomingConnectionFailed(
    connectionManagerPhoneAccount: PhoneAccountHandle?,
    request: ConnectionRequest,
  ) {
    emitConnectionFailure(request, "Android Telecom rejected the incoming call")
  }

  override fun onCreateOutgoingConnectionFailed(
    connectionManagerPhoneAccount: PhoneAccountHandle?,
    request: ConnectionRequest,
  ) {
    emitConnectionFailure(request, "Android Telecom rejected the outgoing call")
  }

  private fun createConnection(
    descriptor: VicallCallDescriptor,
    incoming: Boolean,
  ): VicallConnection {
    return VicallConnection(this, descriptor).also { connection ->
      VicallCallRegistry.put(connection)
      if (incoming) {
        connection.setRinging()
      } else {
        connection.setDialing()
      }
    }
  }

  private fun emitConnectionFailure(
    request: ConnectionRequest,
    reason: String,
  ) {
    val fields = runCatching {
      VicallCallDescriptor.fromBundle(
        request.extras ?: android.os.Bundle.EMPTY,
        VicallCallDirection.INCOMING,
      ).eventFields()
    }.getOrDefault(emptyMap())

    VicallCallEventStore.emit(
      "incomingCallFailed",
      fields + ("reason" to reason),
    )
  }

  companion object {
    fun failedConnection(reason: String): Connection =
      Connection.createFailedConnection(
        DisconnectCause(DisconnectCause.ERROR, reason),
      )
  }
}

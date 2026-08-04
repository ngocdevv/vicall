package expo.modules.vicallcallmanager

import android.os.Handler
import android.os.Looper
import java.util.UUID

internal object VicallCallEventStore {
  private val lock = Any()
  private val pendingEvents = mutableListOf<Map<String, Any?>>()
  private var listener: ((Map<String, Any?>) -> Unit)? = null
  private val mainHandler = Handler(Looper.getMainLooper())

  fun attach(listener: (Map<String, Any?>) -> Unit) {
    synchronized(lock) {
      this.listener = listener
    }
  }

  fun detach() {
    synchronized(lock) {
      listener = null
    }
  }

  fun emit(type: String, fields: Map<String, Any?> = emptyMap()) {
    val event = fields + mapOf(
      "eventId" to UUID.randomUUID().toString().lowercase(),
      "type" to type,
      "timestamp" to System.currentTimeMillis(),
    )
    val currentListener = synchronized(lock) {
      listener.also {
        if (it == null) {
          pendingEvents.add(event)
        }
      }
    }
    dispatch(currentListener, event)
  }

  fun initialEvents(): List<Map<String, Any?>> = synchronized(lock) {
    pendingEvents.toList()
  }

  fun clearInitialEvents() {
    synchronized(lock) {
      pendingEvents.clear()
    }
  }

  private fun dispatch(
    currentListener: ((Map<String, Any?>) -> Unit)?,
    event: Map<String, Any?>,
  ) {
    if (currentListener == null) return
    if (Looper.myLooper() == Looper.getMainLooper()) {
      currentListener(event)
    } else {
      mainHandler.post { currentListener(event) }
    }
  }
}

package expo.modules.vicallcallmanager

import java.util.UUID

internal object VicallCallEventStore {
  private val lock = Any()
  private val pendingEvents = mutableListOf<Map<String, Any?>>()
  private var listener: ((Map<String, Any?>) -> Unit)? = null

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
      "eventId" to UUID.randomUUID().toString(),
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
    currentListener?.invoke(event)
  }

  fun initialEvents(): List<Map<String, Any?>> = synchronized(lock) {
    pendingEvents.toList()
  }

  fun clearInitialEvents() {
    synchronized(lock) {
      pendingEvents.clear()
    }
  }
}

package expo.modules.vicallcallmanager

import java.util.UUID

internal object VicallPictureInPictureEventStore {
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

  fun emit(type: String, active: Boolean, error: String? = null) {
    val event = buildMap<String, Any?> {
      put("active", active)
      put("eventId", UUID.randomUUID().toString())
      put("timestamp", System.currentTimeMillis())
      put("type", type)
      error?.let { put("error", it) }
    }
    val currentListener = synchronized(lock) {
      listener.also {
        if (it == null) pendingEvents.add(event)
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

package expo.modules.vicallcallmanager

import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

/**
 * Remembers cancel/end signals that arrive before Telecom creates the
 * corresponding [VicallConnection] (common FCM race on cold start).
 */
internal object VicallPendingCancellationStore {
  private const val DEFAULT_TTL_MS = 30_000L

  private data class Entry(
    val reason: VicallCallEndReason,
    val expiresAtMs: Long,
  )

  private val pending = ConcurrentHashMap<UUID, Entry>()

  @JvmOverloads
  fun remember(
    callId: UUID,
    reason: VicallCallEndReason,
    ttlMs: Long = DEFAULT_TTL_MS,
    nowMs: Long = System.currentTimeMillis(),
  ) {
    pruneExpired(nowMs)
    pending[callId] = Entry(reason = reason, expiresAtMs = nowMs + ttlMs)
  }

  @JvmOverloads
  fun consume(
    callId: UUID,
    nowMs: Long = System.currentTimeMillis(),
  ): VicallCallEndReason? {
    pruneExpired(nowMs)
    return pending.remove(callId)?.reason
  }

  @JvmOverloads
  fun peek(
    callId: UUID,
    nowMs: Long = System.currentTimeMillis(),
  ): VicallCallEndReason? {
    pruneExpired(nowMs)
    return pending[callId]?.reason
  }

  fun clear() {
    pending.clear()
  }

  private fun pruneExpired(nowMs: Long) {
    val iterator = pending.entries.iterator()
    while (iterator.hasNext()) {
      val entry = iterator.next()
      if (entry.value.expiresAtMs <= nowMs) {
        iterator.remove()
      }
    }
  }
}

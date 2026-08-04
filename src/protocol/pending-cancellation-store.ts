/**
 * Portable model of the Android native cancel-before-create buffer.
 * Native Kotlin keeps the authoritative in-process store; this helps services
 * and unit tests reason about the race window.
 */
export interface PendingCancellationEntry<TReason extends string = string> {
  reason: TReason;
  expiresAtMs: number;
}

export class PendingCancellationStore<TReason extends string = string> {
  private readonly pending = new Map<string, PendingCancellationEntry<TReason>>();

  constructor(private readonly ttlMs = 30_000) {}

  remember(
    callId: string,
    reason: TReason,
    nowMs: number = Date.now(),
  ): void {
    this.pruneExpired(nowMs);
    this.pending.set(callId.toLowerCase(), {
      reason,
      expiresAtMs: nowMs + this.ttlMs,
    });
  }

  consume(callId: string, nowMs: number = Date.now()): TReason | null {
    this.pruneExpired(nowMs);
    const key = callId.toLowerCase();
    const entry = this.pending.get(key);
    if (entry == null) return null;
    this.pending.delete(key);
    return entry.reason;
  }

  peek(callId: string, nowMs: number = Date.now()): TReason | null {
    this.pruneExpired(nowMs);
    return this.pending.get(callId.toLowerCase())?.reason ?? null;
  }

  clear(): void {
    this.pending.clear();
  }

  private pruneExpired(nowMs: number): void {
    for (const [key, entry] of this.pending) {
      if (entry.expiresAtMs <= nowMs) {
        this.pending.delete(key);
      }
    }
  }
}

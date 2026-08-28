interface CacheEntry<Value> {
  value: Value;
  cachedAt: number;
}

/** Small in-memory cache with deterministic TTL and memory bounds. */
export class BoundedTtlCache<Key, Value> {
  private readonly entries = new Map<Key, CacheEntry<Value>>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries: number,
  ) {
    if (ttlMs <= 0) throw new Error("ttlMs must be greater than zero");
    if (maxEntries <= 0)
      throw new Error("maxEntries must be greater than zero");
  }

  get(key: Key, now = Date.now()): Value | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (now - entry.cachedAt >= this.ttlMs) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  /** Forget one key now, rather than waiting out its TTL. For when the
   *  underlying data is known to have changed — a provider saving their own
   *  hours shouldn't be served the previous week until the TTL lapses. */
  delete(key: Key): void {
    this.entries.delete(key);
  }

  set(key: Key, value: Value, now = Date.now()): void {
    this.entries.delete(key);
    this.entries.set(key, { value, cachedAt: now });
    if (this.entries.size > this.maxEntries) {
      const oldestKey = this.entries.keys().next().value as Key | undefined;
      if (oldestKey !== undefined) this.entries.delete(oldestKey);
    }
  }
}

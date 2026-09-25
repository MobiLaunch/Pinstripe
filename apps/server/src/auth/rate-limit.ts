/**
 * Fixed-window counter for failed logins, keyed by the login being tried.
 * Keying by login (not IP) protects each account from password guessing
 * without depending on proxy headers. In memory, so per process; move to
 * Postgres or Redis if the server ever runs as several processes.
 */
export class FailureLimiter {
  #windows = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly maxFailures: number,
    private readonly windowMs: number,
  ) {}

  isBlocked(key: string, now = Date.now()): boolean {
    const w = this.#windows.get(key);
    if (!w || w.resetAt <= now) return false;
    return w.count >= this.maxFailures;
  }

  recordFailure(key: string, now = Date.now()) {
    const w = this.#windows.get(key);
    if (!w || w.resetAt <= now) {
      this.#windows.set(key, { count: 1, resetAt: now + this.windowMs });
      this.#sweep(now);
    } else {
      w.count++;
    }
  }

  reset(key: string) {
    this.#windows.delete(key);
  }

  clear() {
    this.#windows.clear();
  }

  #sweep(now: number) {
    if (this.#windows.size < 10_000) return;
    for (const [key, w] of this.#windows) if (w.resetAt <= now) this.#windows.delete(key);
  }
}

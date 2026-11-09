import type { ModelEntry } from "@/lib/ai/providers";

/**
 * In-process request spacing per (key, model) entry (05 §1.2). The worker is a
 * single process, so in-memory state is enough. Reservations are made
 * synchronously, so concurrent callers queue up instead of bursting.
 */

export type RateLimiter = {
  /** Milliseconds the caller would have to wait right now for `entry`. */
  delayFor(entry: ModelEntry): number;
  /**
   * Reserves the next slot for `entry` and waits for it. `onWait` is called
   * with the wait in ms when a wait is needed (the UI shows "Waiting for AI
   * rate limit…").
   */
  acquire(entry: ModelEntry, onWait?: (ms: number) => void | Promise<void>): Promise<void>;
};

export type RateLimiterOptions = {
  defaultIntervalMs: number;
  /** `provider:model` → ms (same model on every key). */
  overrides: Map<string, number>;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
};

export const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function intervalFor(entry: ModelEntry, defaultMs: number, overrides: Map<string, number>): number {
  return overrides.get(`${entry.provider}:${entry.model}`) ?? defaultMs;
}

export function createRateLimiter(options: RateLimiterOptions): RateLimiter {
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? realSleep;
  /** Earliest time the next request to an entry may start. */
  const nextAt = new Map<string, number>();

  return {
    delayFor(entry) {
      return Math.max(0, (nextAt.get(entry.id) ?? 0) - now());
    },
    async acquire(entry, onWait) {
      const current = now();
      const slot = Math.max(current, nextAt.get(entry.id) ?? 0);
      nextAt.set(entry.id, slot + intervalFor(entry, options.defaultIntervalMs, options.overrides));
      const wait = slot - current;
      if (wait > 0) {
        await onWait?.(wait);
        await sleep(wait);
      }
    },
  };
}

import type { ModelEntry } from "@/lib/ai/providers";

/**
 * Multi-model fallback (05 §1.6): error classification, per-entry cooldowns,
 * and top-down model selection. All state is in-memory, keyed by entry id
 * (`provider@alias:model`) — quotas are per key and model.
 */

// ---------------------------------------------------------------------------
// Errors from providers, normalised
// ---------------------------------------------------------------------------

/** A provider failure with everything classification needs — and nothing secret. */
export type ProviderFailure = {
  /** HTTP status, or null for network errors/timeouts. */
  status: number | null;
  /** Provider message (never shown to users). */
  message: string;
  /** Serialised response body, for keyword detection only. */
  body: string;
  /** Parsed `retry-after` header, when present. */
  retryAfterMs: number | null;
  timeout: boolean;
};

export class ProviderHttpError extends Error {
  constructor(readonly failure: ProviderFailure) {
    super(failure.message);
    this.name = "ProviderHttpError";
  }
}

export type FailureKind =
  | "rate_minute"
  | "quota_day"
  | "server_error"
  | "not_found"
  | "too_large"
  | "auth"
  | "bad_request";

export type Classified = { kind: FailureKind; retryAfterMs: number | null };

/** Delays at or below this count as "short" (per-minute) limits. */
export const SHORT_DELAY_MS = 90_000;
/** Wait-and-retry the same model when a per-minute limit asks for at most this. */
export const SAME_MODEL_RETRY_MAX_MS = 20_000;
export const DEFAULT_MINUTE_COOLDOWN_MS = 60_000;
export const SERVER_RETRY_DELAY_MS = 3_000;
export const SERVER_COOLDOWN_MS = 2 * 60_000;
export const LONG_COOLDOWN_MS = 24 * 60 * 60_000;

/** Reads a retry delay from the body: Gemini `"retryDelay": "34s"` or "retry in 34.5s". */
export function retryDelayFromText(text: string): number | null {
  const rpc = /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/i.exec(text);
  if (rpc) return Math.ceil(Number(rpc[1]) * 1000);
  const prose = /retry (?:in|after) (\d+(?:\.\d+)?)\s*(ms|s|seconds?)\b/i.exec(text);
  if (prose) {
    const n = Number(prose[1]);
    return Math.ceil(prose[2].toLowerCase() === "ms" ? n : n * 1000);
  }
  return null;
}

/** Parses a `retry-after` header value (seconds or HTTP date). */
export function parseRetryAfter(value: string | null | undefined, now = Date.now()): number | null {
  if (!value) return null;
  if (/^\d+(\.\d+)?$/.test(value.trim())) return Math.ceil(Number(value) * 1000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? null : Math.max(0, date - now);
}

/** Maps a failure onto the action table of 05 §1.6. Status first, then text. */
export function classifyFailure(failure: ProviderFailure): Classified {
  const text = `${failure.message}\n${failure.body}`;
  const retryAfterMs = failure.retryAfterMs ?? retryDelayFromText(text);
  const status = failure.status;

  if (failure.timeout || status === null) return { kind: "server_error", retryAfterMs: null };

  if (status === 429) {
    if (/per[ _-]?day|PerDay|daily/i.test(text)) return { kind: "quota_day", retryAfterMs };
    if (/per[ _-]?minute|PerMinute/i.test(text)) return { kind: "rate_minute", retryAfterMs };
    if (retryAfterMs !== null && retryAfterMs > SHORT_DELAY_MS) return { kind: "quota_day", retryAfterMs };
    return { kind: "rate_minute", retryAfterMs };
  }
  if (status === 401 || status === 403) return { kind: "auth", retryAfterMs: null };
  if (status === 404 || /model[^.]{0,40}not (?:be )?found|no such model|unknown model/i.test(text)) {
    return { kind: "not_found", retryAfterMs: null };
  }
  if ((status === 400 || status === 413) && /token|too long|too large|context/i.test(text)) {
    return { kind: "too_large", retryAfterMs: null };
  }
  if (status >= 500 || status === 408) return { kind: "server_error", retryAfterMs: null };
  return { kind: "bad_request", retryAfterMs: null };
}

// ---------------------------------------------------------------------------
// Quota reset time
// ---------------------------------------------------------------------------

const PACIFIC = "America/Los_Angeles";

/** Offset (ms) of `timeZone` from UTC at `instant`: local wall time − UTC. */
function tzOffsetMs(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(instant));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(instant / 1000) * 1000;
}

/**
 * The next midnight in US Pacific time after `now` (Gemini free quotas reset
 * then). Handles DST: the offset is taken at the target instant.
 */
export function nextPacificMidnight(now: number): number {
  const local = new Date(now + tzOffsetMs(now, PACIFIC));
  const wallMidnight = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + 1);
  let guess = wallMidnight - tzOffsetMs(wallMidnight, PACIFIC);
  guess = wallMidnight - tzOffsetMs(guess, PACIFIC);
  return guess;
}

// ---------------------------------------------------------------------------
// State and selection
// ---------------------------------------------------------------------------

export type CooldownReason = "rate_minute" | "quota_day" | "server_error" | "not_found" | "auth";

export type ModelState = {
  cooldownUntil: number | null;
  reason: CooldownReason | null;
  consecutiveFailures: number;
};

export type Selection =
  | { kind: "ready"; entry: ModelEntry }
  /** Every usable entry is in a short cooldown: wait until `until`, then select again. */
  | { kind: "wait"; until: number }
  /** Every usable entry is in a long cooldown. */
  | { kind: "unavailable"; resetAt: number | null; reason: CooldownReason | null }
  /** No entry accepts an input this large. */
  | { kind: "too_large" };

export type FallbackState = {
  stateOf(entry: ModelEntry): ModelState;
  /** Cooldown for one entry. */
  cooldown(entry: ModelEntry, untilMs: number, reason: CooldownReason): void;
  /** Cooldown for every entry using `entry`'s key (401/403). */
  cooldownKey(entry: ModelEntry, untilMs: number): void;
  recordSuccess(entry: ModelEntry): void;
  /**
   * Walks `chain` from the top, skipping entries in `exclude` (already failed
   * during this call) and entries whose `max=` flag is below `estimatedTokens`.
   */
  select(chain: ModelEntry[], estimatedTokens: number, exclude?: ReadonlySet<string>): Selection;
};

const keyScope = (entry: ModelEntry) => `${entry.provider}@${entry.keyAlias ?? "-"}`;

export function createFallbackState(now: () => number = Date.now): FallbackState {
  const states = new Map<string, ModelState>();
  const keyCooldowns = new Map<string, number>();

  const stateOf = (entry: ModelEntry): ModelState => {
    let state = states.get(entry.id);
    if (!state) {
      state = { cooldownUntil: null, reason: null, consecutiveFailures: 0 };
      states.set(entry.id, state);
    }
    return state;
  };

  /** Effective cooldown end (entry or key level) and why, or null when usable. */
  const blockedUntil = (entry: ModelEntry, at: number): { until: number; reason: CooldownReason } | null => {
    const keyUntil = keyCooldowns.get(keyScope(entry));
    if (keyUntil !== undefined && keyUntil > at) return { until: keyUntil, reason: "auth" };
    const state = stateOf(entry);
    if (state.cooldownUntil !== null && state.cooldownUntil > at) {
      return { until: state.cooldownUntil, reason: state.reason ?? "server_error" };
    }
    return null;
  };

  return {
    stateOf,
    cooldown(entry, untilMs, reason) {
      const state = stateOf(entry);
      state.cooldownUntil = Math.max(state.cooldownUntil ?? 0, untilMs);
      state.reason = reason;
      state.consecutiveFailures += 1;
    },
    cooldownKey(entry, untilMs) {
      keyCooldowns.set(keyScope(entry), untilMs);
    },
    recordSuccess(entry) {
      const state = stateOf(entry);
      state.consecutiveFailures = 0;
      state.cooldownUntil = null;
      state.reason = null;
    },
    select(chain, estimatedTokens, exclude = new Set()) {
      const at = now();
      const usable = chain.filter(
        (e) => !exclude.has(e.id) && (e.flags.max === null || estimatedTokens <= e.flags.max),
      );
      if (usable.length === 0) {
        const anyLeft = chain.some((e) => !exclude.has(e.id));
        return anyLeft ? { kind: "too_large" } : { kind: "unavailable", resetAt: null, reason: null };
      }

      let earliestShort: number | null = null;
      let earliestLong: { until: number; reason: CooldownReason } | null = null;
      for (const entry of usable) {
        const blocked = blockedUntil(entry, at);
        if (!blocked) return { kind: "ready", entry };
        if (blocked.until - at <= SHORT_DELAY_MS) {
          earliestShort = earliestShort === null ? blocked.until : Math.min(earliestShort, blocked.until);
        } else if (!earliestLong || blocked.until < earliestLong.until) {
          earliestLong = blocked;
        }
      }
      if (earliestShort !== null) return { kind: "wait", until: earliestShort };
      return { kind: "unavailable", resetAt: earliestLong?.until ?? null, reason: earliestLong?.reason ?? null };
    },
  };
}

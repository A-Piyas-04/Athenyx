import { describe, expect, it } from "vitest";
import {
  classifyFailure,
  createFallbackState,
  nextPacificMidnight,
  retryDelayFromText,
  type ProviderFailure,
} from "@/lib/ai/fallback";
import type { ModelEntry } from "@/lib/ai/providers";
import { GEMINI_DAY_BODY, GEMINI_MINUTE_BODY } from "./helpers/ai";

const failure = (over: Partial<ProviderFailure>): ProviderFailure => ({
  status: 500,
  message: "",
  body: "",
  retryAfterMs: null,
  timeout: false,
  ...over,
});

function entry(model: string, tier: number, keyAlias = "default", max: number | null = null): ModelEntry {
  return {
    provider: "gemini",
    keyAlias,
    model,
    baseURL: "",
    apiKey: "k",
    tier,
    flags: { nosys: false, nojson: false, max },
    routed: false,
    id: `gemini@${keyAlias}:${model}`,
    label: `gemini:${model}`,
  };
}

describe("classifyFailure", () => {
  it("detects Gemini per-minute limits with their retry delay", () => {
    expect(classifyFailure(failure({ status: 429, body: GEMINI_MINUTE_BODY }))).toEqual({
      kind: "rate_minute",
      retryAfterMs: 34_000,
    });
  });

  it("detects Gemini daily quota even when the retry delay is short", () => {
    expect(classifyFailure(failure({ status: 429, body: GEMINI_DAY_BODY })).kind).toBe("quota_day");
  });

  it("uses retry-after length when the body has no hint", () => {
    expect(classifyFailure(failure({ status: 429, retryAfterMs: 5_000 })).kind).toBe("rate_minute");
    expect(classifyFailure(failure({ status: 429, retryAfterMs: 3_600_000 })).kind).toBe("quota_day");
  });

  it("maps the rest of the action table", () => {
    expect(classifyFailure(failure({ status: 503 })).kind).toBe("server_error");
    expect(classifyFailure(failure({ status: null, timeout: true })).kind).toBe("server_error");
    expect(classifyFailure(failure({ status: 404, message: "models/x is not found" })).kind).toBe("not_found");
    expect(classifyFailure(failure({ status: 400, message: "input token count exceeds the maximum" })).kind).toBe("too_large");
    expect(classifyFailure(failure({ status: 413 , message: "Request too large"})).kind).toBe("too_large");
    expect(classifyFailure(failure({ status: 401 })).kind).toBe("auth");
    expect(classifyFailure(failure({ status: 403 })).kind).toBe("auth");
    expect(classifyFailure(failure({ status: 400, message: "invalid argument" })).kind).toBe("bad_request");
  });

  it("parses prose retry hints", () => {
    expect(retryDelayFromText("Please retry in 1.5s")).toBe(1500);
    expect(retryDelayFromText("retry after 200 ms")).toBe(200);
    expect(retryDelayFromText("nothing")).toBeNull();
  });
});

describe("nextPacificMidnight", () => {
  it("returns the next midnight in US Pacific time (PDT, UTC-7)", () => {
    const now = Date.UTC(2026, 6, 15, 20, 0); // 13:00 PDT
    expect(new Date(nextPacificMidnight(now)).toISOString()).toBe("2026-07-16T07:00:00.000Z");
  });

  it("handles standard time (PST, UTC-8)", () => {
    const now = Date.UTC(2026, 0, 15, 20, 0);
    expect(new Date(nextPacificMidnight(now)).toISOString()).toBe("2026-01-16T08:00:00.000Z");
  });

  it("handles the DST transition days", () => {
    // 2026-03-08 is the spring-forward day; midnight after it is in PDT.
    expect(new Date(nextPacificMidnight(Date.UTC(2026, 2, 8, 12, 0))).toISOString()).toBe("2026-03-09T07:00:00.000Z");
    // 2026-11-01 is the fall-back day; midnight after it is in PST.
    expect(new Date(nextPacificMidnight(Date.UTC(2026, 10, 1, 12, 0))).toISOString()).toBe("2026-11-02T08:00:00.000Z");
  });

  it("just before midnight resolves to the imminent midnight", () => {
    const now = Date.UTC(2026, 6, 16, 6, 59); // 23:59 PDT
    expect(new Date(nextPacificMidnight(now)).toISOString()).toBe("2026-07-16T07:00:00.000Z");
  });
});

describe("fallback selection", () => {
  it("walks the chain top-down and returns to the best model after its cooldown", () => {
    let now = 0;
    const state = createFallbackState(() => now);
    const chain = [entry("best", 0), entry("next", 1)];
    expect(state.select(chain, 100)).toMatchObject({ kind: "ready", entry: { model: "best" } });
    state.cooldown(chain[0], 60_000, "rate_minute");
    expect(state.select(chain, 100)).toMatchObject({ kind: "ready", entry: { model: "next" } });
    now = 60_001;
    expect(state.select(chain, 100)).toMatchObject({ kind: "ready", entry: { model: "best" } });
  });

  it("waits when every model is in a short cooldown", () => {
    const state = createFallbackState(() => 0);
    const chain = [entry("a", 0), entry("b", 1)];
    state.cooldown(chain[0], 30_000, "rate_minute");
    state.cooldown(chain[1], 10_000, "rate_minute");
    expect(state.select(chain, 100)).toEqual({ kind: "wait", until: 10_000 });
  });

  it("is unavailable when every model is in a long cooldown", () => {
    const state = createFallbackState(() => 0);
    const chain = [entry("a", 0), entry("b", 1)];
    state.cooldown(chain[0], 10 * 3_600_000, "quota_day");
    state.cooldown(chain[1], 5 * 3_600_000, "quota_day");
    expect(state.select(chain, 100)).toEqual({ kind: "unavailable", resetAt: 5 * 3_600_000, reason: "quota_day" });
  });

  it("cools down every entry of a rejected key but not other keys", () => {
    const state = createFallbackState(() => 0);
    const chain = [entry("a", 0, "k1"), entry("b", 1, "k1"), entry("a", 2, "k2")];
    state.cooldownKey(chain[0], 86_400_000);
    expect(state.select(chain, 100)).toMatchObject({ kind: "ready", entry: { keyAlias: "k2" } });
  });

  it("skips entries whose max= flag is below the input size", () => {
    const state = createFallbackState(() => 0);
    const chain = [entry("small", 0, "default", 1000), entry("big", 1)];
    expect(state.select(chain, 5000)).toMatchObject({ kind: "ready", entry: { model: "big" } });
    expect(state.select([chain[0]], 5000)).toEqual({ kind: "too_large" });
  });
});

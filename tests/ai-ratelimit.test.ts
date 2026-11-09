import { describe, expect, it } from "vitest";
import { createRateLimiter } from "@/lib/ai/ratelimit";
import type { ModelEntry } from "@/lib/ai/providers";

function entry(model: string, keyAlias = "default"): ModelEntry {
  return {
    provider: "gemini",
    keyAlias,
    model,
    baseURL: "",
    apiKey: "k",
    tier: 0,
    flags: { nosys: false, nojson: false, max: null },
    routed: false,
    id: `gemini@${keyAlias}:${model}`,
    label: `gemini:${model}`,
  };
}

function fakeClock() {
  let now = 1_000_000;
  const sleeps: number[] = [];
  return {
    now: () => now,
    sleep: async (ms: number) => {
      sleeps.push(ms);
      now += ms;
    },
    advance: (ms: number) => {
      now += ms;
    },
    sleeps,
  };
}

describe("rate limiter", () => {
  it("enforces the minimum interval per model", async () => {
    const clock = fakeClock();
    const limiter = createRateLimiter({ defaultIntervalMs: 6000, overrides: new Map(), ...clock });
    const a = entry("m1");
    await limiter.acquire(a);
    expect(clock.sleeps).toEqual([]);
    clock.advance(1000);
    await limiter.acquire(a);
    expect(clock.sleeps).toEqual([5000]);
  });

  it("tracks models and keys independently", async () => {
    const clock = fakeClock();
    const limiter = createRateLimiter({ defaultIntervalMs: 6000, overrides: new Map(), ...clock });
    await limiter.acquire(entry("m1"));
    await limiter.acquire(entry("m2"));
    await limiter.acquire(entry("m1", "other"));
    expect(clock.sleeps).toEqual([]);
  });

  it("applies provider:model overrides on every key and reports waits", async () => {
    const clock = fakeClock();
    const limiter = createRateLimiter({
      defaultIntervalMs: 6000,
      overrides: new Map([["gemini:m1", 12000]]),
      ...clock,
    });
    const waits: number[] = [];
    await limiter.acquire(entry("m1", "b"));
    expect(limiter.delayFor(entry("m1", "b"))).toBe(12000);
    await limiter.acquire(entry("m1", "b"), (ms) => {
      waits.push(ms);
    });
    expect(waits).toEqual([12000]);
  });
});

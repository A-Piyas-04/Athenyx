import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createAiClient, type AiLogEvent, type CallJsonOptions } from "@/lib/ai/client";
import {
  AiBadRequestError,
  AiBudgetError,
  AiConfigError,
  AiInvalidOutputError,
  AiUnavailableError,
} from "@/lib/ai/errors";
import { nextPacificMidnight, ProviderHttpError, type ProviderFailure } from "@/lib/ai/fallback";
import { normalize, stripFences } from "@/lib/ai/json";
import { FindingOut, PersonaOutput } from "@/lib/ai/schemas";
import type { ChatRequest, ChatResponse } from "@/lib/ai/transport";
import { fakeClock, GEMINI_DAY_BODY, GEMINI_MINUTE_BODY, ok, testConfig } from "./helpers/ai";

const Schema = z.object({ value: z.number().int(), level: z.enum(["HIGH", "LOW"]), tags: z.array(z.string()) });
const GOOD = '{"value": 1, "level": "HIGH", "tags": []}';

const httpError = (over: Partial<ProviderFailure>) =>
  new ProviderHttpError({ status: 500, message: "error", body: "", retryAfterMs: null, timeout: false, ...over });

/** A transport that answers from per-model scripts, in order. */
function scriptedTransport(scripts: Record<string, (ChatResponse | Error)[]>) {
  const calls: ChatRequest[] = [];
  const transport = async (request: ChatRequest): Promise<ChatResponse> => {
    calls.push(request);
    const queue = scripts[request.entry.label] ?? scripts[request.entry.model];
    const next = queue?.shift();
    if (!next) throw new Error(`unexpected call to ${request.entry.label}`);
    if (next instanceof Error) throw next;
    return next;
  };
  return { transport, calls, models: () => calls.map((c) => c.entry.label) };
}

function setup(scripts: Record<string, (ChatResponse | Error)[]>, env: Record<string, string> = {}) {
  const clock = fakeClock();
  const logs: AiLogEvent[] = [];
  const t = scriptedTransport(scripts);
  const client = createAiClient({
    config: testConfig(env),
    transport: t.transport,
    now: clock.now,
    sleep: clock.sleep,
    log: (event) => logs.push(event),
  });
  const call = (over: Partial<CallJsonOptions<typeof Schema>> = {}) =>
    client.callJson<typeof Schema>({ role: "review", task: "persona.security", system: "rules", prompt: "go", schema: Schema, ...over });
  return { clock, logs, client, call, ...t };
}

describe("JSON handling", () => {
  it("strips fences and surrounding prose", () => {
    expect(stripFences('```json\n{"a":1}\n```')).toBe('{"a":1}');
    expect(stripFences('Here you go: {"a":1} hope it helps')).toBe('{"a":1}');
  });

  it("normalize coerces numeric strings, enum case, booleans, and missing arrays/nullables", () => {
    const value = normalize(PersonaOutput, {
      summary: "s",
      noSignificantIssues: "false",
      findings: [
        {
          title: "t",
          observation: "o",
          impact: "i",
          classification: "potential risk",
          severity: "high",
          confidence: "Medium",
          evidence: [{ path: "a.ts", startLine: "3", endLine: "4", quote: "x" }],
          options: [{ title: "o", description: "d", effort: "small" }],
          recommendation: { optionIndex: "0", rationale: "r" },
          verification: "v",
        },
      ],
    });
    const parsed = PersonaOutput.safeParse(value);
    expect(parsed.success).toBe(true);
    const finding = parsed.data!.findings[0];
    expect(finding).toMatchObject({ classification: "POTENTIAL_RISK", severity: "HIGH", confidence: "MEDIUM" });
    expect(finding.evidence[0]).toMatchObject({ startLine: 3, endLine: 4, symbol: null });
    expect(finding.options[0]).toMatchObject({ effort: "SMALL", pros: [], cons: [] });
    expect(finding.existingFindingId).toBeNull();
    expect(finding.userPremise).toBeNull();
    expect(parsed.data!.answer).toBeNull();
    expect(parsed.data!.limitations).toEqual([]);
  });

  it("FindingOut stays strict on unknown enum values", () => {
    expect(FindingOut.safeParse(normalize(FindingOut, { severity: "urgent" })).success).toBe(false);
  });
});

describe("callJson basics", () => {
  it("parses fenced JSON and reports the model, tier and usage", async () => {
    const { call } = setup({ "model-a": [ok("```json\n" + GOOD + "\n```")] });
    const result = await call();
    expect(result.data).toEqual({ value: 1, level: "HIGH", tags: [] });
    expect(result).toMatchObject({ model: "gemini:model-a", tier: 0, degraded: false, routed: false });
    expect(result.usage).toMatchObject({ calls: 1, inputTokens: 100, outputTokens: 20, models: ["gemini:model-a"] });
  });

  it("sends JSON mode and puts the schema in the system message, the data in the user message", async () => {
    const { call, calls } = setup({ "model-a": [ok(GOOD)] });
    await call({ context: "<repository_file>…</repository_file>" });
    expect(calls[0].jsonMode).toBe(true);
    expect(calls[0].messages[0].role).toBe("system");
    expect(calls[0].messages[0].content).toContain("JSON Schema");
    expect(calls[0].messages[0].content).not.toContain("repository_file");
    expect(calls[0].messages[1].content).toContain("<repository_file>");
  });

  it("makes one repair call for invalid JSON", async () => {
    const { call, calls } = setup({ "model-a": [ok("not json at all"), ok(GOOD)] });
    const result = await call();
    expect(result.data.value).toBe(1);
    expect(calls).toHaveLength(2);
    expect(calls[1].messages.at(-1)?.content).toContain("did not match");
    expect(result.usage.retries).toBe(1);
  });

  it("falls back to the next model once when the repair also fails", async () => {
    const { call, models } = setup({ "model-a": [ok("bad"), ok("still bad")], "model-b": [ok(GOOD)] });
    const result = await call();
    expect(models()).toEqual(["gemini:model-a", "gemini:model-a", "gemini:model-b"]);
    expect(result.degraded).toBe(true);
    expect(result.usage.fallbacks).toBe(1);
  });

  it("gives up with AiInvalidOutputError after invalid output on two models", async () => {
    const { call } = setup({ "model-a": [ok("bad"), ok("bad")], "model-b": [ok("bad"), ok("bad")] });
    await expect(call()).rejects.toBeInstanceOf(AiInvalidOutputError);
  });

  it("retries once with double max tokens when the reply is truncated", async () => {
    const { call, calls } = setup({ "model-a": [ok('{"value":', { finishReason: "length" }), ok(GOOD)] });
    await call({ maxOutputTokens: 1000 });
    expect(calls.map((c) => c.maxTokens)).toEqual([1000, 2000]);
  });

  it("retries without response_format when a provider rejects it", async () => {
    const { call, calls } = setup({
      "model-a": [httpError({ status: 400, message: "response_format is not supported" }), ok(GOOD)],
    });
    await call();
    expect(calls.map((c) => c.jsonMode)).toEqual([true, false]);
  });

  it("fails other bad requests without falling back", async () => {
    const { call, models } = setup({ "model-a": [httpError({ status: 400, message: "invalid argument" })] });
    await expect(call()).rejects.toBeInstanceOf(AiBadRequestError);
    expect(models()).toEqual(["gemini:model-a"]);
  });

  it("guards the role's input budget", async () => {
    const { call } = setup({}, { AI_LIGHT_MAX_INPUT_TOKENS: "50" });
    await expect(call({ role: "light", context: "x".repeat(1000) })).rejects.toBeInstanceOf(AiBudgetError);
  });

  it("merges the system prompt into the user message for |nosys entries", async () => {
    const { call, calls } = setup({ "gemma-x": [ok(GOOD)] }, { AI_REVIEW_MODELS: "gemini:gemma-x|nosys|nojson" });
    await call();
    expect(calls[0].messages).toHaveLength(1);
    expect(calls[0].messages[0].role).toBe("user");
    expect(calls[0].jsonMode).toBe(false);
  });
});

describe("rate limits and fallback", () => {
  it("waits for a short retry-after and retries the same model", async () => {
    const { call, models, clock } = setup({
      "model-a": [httpError({ status: 429, message: "per minute", retryAfterMs: 5_000 }), ok(GOOD)],
    });
    const result = await call();
    expect(models()).toEqual(["gemini:model-a", "gemini:model-a"]);
    expect(clock.sleeps).toContain(5_000);
    expect(result.degraded).toBe(false);
  });

  it("cools down a model on a long per-minute limit and falls back now", async () => {
    const { call, models, client, clock } = setup({
      "model-a": [httpError({ status: 429, body: GEMINI_MINUTE_BODY })],
      "model-b": [ok(GOOD)],
    });
    const result = await call();
    expect(models()).toEqual(["gemini:model-a", "gemini:model-b"]);
    expect(result).toMatchObject({ model: "gemini:model-b", tier: 1, degraded: true });
    const state = client.fallback.stateOf(testConfig().roles.review[0]);
    expect(state.reason).toBe("rate_minute");
    expect(state.cooldownUntil).toBe(clock.now() + 34_000);
  });

  it("cools down until Pacific midnight on a daily quota and falls back", async () => {
    const { call, client, clock } = setup({
      "model-a": [httpError({ status: 429, body: GEMINI_DAY_BODY })],
      "model-b": [ok(GOOD)],
    });
    const start = clock.now();
    await call();
    const state = client.fallback.stateOf(testConfig().roles.review[0]);
    expect(state).toMatchObject({ reason: "quota_day", cooldownUntil: nextPacificMidnight(start) });
  });

  it("cools a missing model down for 24 hours", async () => {
    const { call, client, clock, logs } = setup({
      "model-a": [httpError({ status: 404, message: "model not found" })],
      "model-b": [ok(GOOD)],
    });
    const start = clock.now();
    await call();
    expect(client.fallback.stateOf(testConfig().roles.review[0])).toMatchObject({
      reason: "not_found",
      cooldownUntil: start + 24 * 3_600_000,
    });
    expect(logs.some((l) => l.event === "warning" && l.message?.includes("AI_*_MODELS"))).toBe(true);
  });

  it("retries server errors once after 3s, then falls back", async () => {
    const { call, models, clock } = setup({
      "model-a": [httpError({ status: 503 }), httpError({ status: 503 })],
      "model-b": [ok(GOOD)],
    });
    await call();
    expect(models()).toEqual(["gemini:model-a", "gemini:model-a", "gemini:model-b"]);
    expect(clock.sleeps).toContain(3_000);
  });

  it("returns to the best model once its cooldown ends", async () => {
    const { call, models, clock } = setup({
      "model-a": [httpError({ status: 429, body: GEMINI_MINUTE_BODY }), ok(GOOD)],
      "model-b": [ok(GOOD)],
    });
    await call();
    clock.advance(35_000);
    const second = await call();
    expect(models()).toEqual(["gemini:model-a", "gemini:model-b", "gemini:model-a"]);
    expect(second.degraded).toBe(false);
  });

  it("waits when every model is in a short cooldown instead of failing", async () => {
    const minute = (ms: number) => httpError({ status: 429, message: "per minute", retryAfterMs: ms });
    const { call, models, clock } = setup({
      "model-a": [minute(30_000), ok(GOOD)],
      "model-b": [minute(60_000)],
    });
    const waits: boolean[] = [];
    const result = await call({ onWait: (w) => void waits.push(w) });
    expect(models()).toEqual(["gemini:model-a", "gemini:model-b", "gemini:model-a"]);
    expect(clock.sleeps.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(30_000);
    expect(waits).toContain(true);
    expect(result.tier).toBe(0);
  });

  it("throws AiUnavailableError when every model's daily quota is used up", async () => {
    const day = () => httpError({ status: 429, body: GEMINI_DAY_BODY });
    const { call } = setup({ "model-a": [day()], "model-b": [day()] });
    const error = await call().catch((e) => e);
    expect(error).toBeInstanceOf(AiUnavailableError);
    expect(error.message).toMatch(/quota is used up for today/);
  });

  it("on 401 pauses that key's entries and keeps using other keys", async () => {
    const env = {
      GEMINI_API_KEY: "",
      GEMINI_API_KEYS: "one:KEY-ONE-SECRET,two:KEY-TWO-SECRET",
      AI_REVIEW_MODELS: "gemini@one:m1,gemini@one:m2,gemini@two:m1",
    };
    const { call, models, logs } = setup(
      { "gemini@one:m1": [httpError({ status: 401, message: "API key not valid" })], "gemini@two:m1": [ok(GOOD), ok(GOOD)] },
      env,
    );
    await call();
    await call();
    // m2 on the same key is skipped too; key "two" serves both calls.
    expect(models()).toEqual(["gemini@one:m1", "gemini@two:m1", "gemini@two:m1"]);
    expect(logs.some((l) => l.message?.includes("key 'one' rejected"))).toBe(true);
  });

  it("fails as a configuration problem when the only key is rejected", async () => {
    const { call } = setup({
      "model-a": [httpError({ status: 403 })],
      "model-b": [],
    });
    await expect(call()).rejects.toBeInstanceOf(AiConfigError);
  });

  it("tracks quota per key with @* expansion", async () => {
    const env = { GEMINI_API_KEY: "", GEMINI_API_KEYS: "a:KA,b:KB", AI_REVIEW_MODELS: "gemini@*:m1,gemini@a:m2" };
    const { call, models } = setup(
      { "gemini@a:m1": [httpError({ status: 429, body: GEMINI_DAY_BODY })], "gemini@b:m1": [ok(GOOD), ok(GOOD)] },
      env,
    );
    const first = await call();
    await call();
    expect(models()).toEqual(["gemini@a:m1", "gemini@b:m1", "gemini@b:m1"]);
    expect(first).toMatchObject({ model: "gemini@b:m1", tier: 1, degraded: true });
  });

  it("never puts API keys into logs or errors", async () => {
    const env = { GEMINI_API_KEY: "", GEMINI_API_KEYS: "main:AIzaSECRET-KEY-VALUE", AI_REVIEW_MODELS: "gemini@main:m1" };
    const { call, logs } = setup({ "gemini@main:m1": [httpError({ status: 429, body: GEMINI_DAY_BODY })] }, env);
    const error = (await call().catch((e: unknown) => e)) as Error;
    const everything = JSON.stringify(logs) + String(error?.message) + String(error?.stack);
    expect(everything).not.toContain("AIzaSECRET-KEY-VALUE");
    expect(JSON.stringify(logs)).toContain("gemini@main:m1");
  });

  it("route entries are tried first and are not degraded; failures fall through to the role chain", async () => {
    const env = { GROQ_API_KEY: "g", AI_TASK_ROUTES: "persona.security=groq:fast" };
    const routed = setup({ fast: [ok(GOOD)] }, env);
    const result = await routed.call();
    expect(result).toMatchObject({ model: "groq:fast", routed: true, degraded: false });

    const failing = setup({ fast: [httpError({ status: 429, body: GEMINI_DAY_BODY })], "model-a": [ok(GOOD)] }, env);
    const fallback = await failing.call();
    expect(failing.models()).toEqual(["groq:fast", "gemini:model-a"]);
    expect(fallback).toMatchObject({ tier: 0, degraded: false, routed: false });
  });

  it("skips a route entry whose max= is below the input size", async () => {
    const env = { GROQ_API_KEY: "g", AI_TASK_ROUTES: "persona.security=groq:fast|max=50" };
    const { call, models } = setup({ "model-a": [ok(GOOD)] }, env);
    await call({ context: "x".repeat(2000) });
    expect(models()).toEqual(["gemini:model-a"]);
  });
});

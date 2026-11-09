import { describe, expect, it } from "vitest";
import { buildAiConfig, providersForReviewType } from "@/lib/ai/config";
import { AiConfigError } from "@/lib/ai/errors";
import {
  buildProviders,
  parseEntrySpec,
  parseGeminiKeys,
  parseIntervalOverrides,
  parseRoleList,
} from "@/lib/ai/providers";

const base = {
  AI_REVIEW_MODELS: "gemini:gemini-2.5-flash,gemini:gemini-2.0-flash",
  AI_LIGHT_MODELS: "gemini:gemini-2.5-flash-lite",
};

describe("parseEntrySpec", () => {
  it("parses provider, alias, model and flags", () => {
    expect(parseEntrySpec("gemini@review:gemini-2.5-flash|nosys|nojson|max=6000")).toEqual({
      provider: "gemini",
      keyAlias: "review",
      model: "gemini-2.5-flash",
      flags: { nosys: true, nojson: true, max: 6000 },
    });
  });

  it("keeps colons inside model ids (OpenRouter :free)", () => {
    expect(parseEntrySpec("openrouter:meta-llama/llama-3.3-70b-instruct:free").model).toBe(
      "meta-llama/llama-3.3-70b-instruct:free",
    );
  });

  it("rejects malformed entries and unknown flags", () => {
    expect(() => parseEntrySpec("gemini-2.5-flash")).toThrow(AiConfigError);
    expect(() => parseEntrySpec("gemini:x|fast")).toThrow(/unknown flag/);
  });
});

describe("Gemini keys", () => {
  it("uses GEMINI_API_KEY as the single default key", () => {
    expect(parseGeminiKeys({ GEMINI_API_KEY: "k1" })).toEqual([{ alias: "default", key: "k1" }]);
  });

  it("parses GEMINI_API_KEYS aliases in order", () => {
    expect(parseGeminiKeys({ GEMINI_API_KEYS: "main:k1, review:k2" })).toEqual([
      { alias: "main", key: "k1" },
      { alias: "review", key: "k2" },
    ]);
  });

  it("rejects duplicate or missing aliases", () => {
    expect(() => parseGeminiKeys({ GEMINI_API_KEYS: "a:k1,a:k2" })).toThrow(/duplicate/);
    expect(() => parseGeminiKeys({ GEMINI_API_KEYS: "k1" })).toThrow(AiConfigError);
  });
});

describe("parseRoleList", () => {
  it("assigns tiers in list order and resolves the default key", () => {
    const providers = buildProviders({ GEMINI_API_KEY: "k1" });
    const entries = parseRoleList("AI_REVIEW_MODELS", base.AI_REVIEW_MODELS, providers);
    expect(entries.map((e) => [e.model, e.tier, e.keyAlias, e.apiKey])).toEqual([
      ["gemini-2.5-flash", 0, "default", "k1"],
      ["gemini-2.0-flash", 1, "default", "k1"],
    ]);
    expect(entries[0].label).toBe("gemini:gemini-2.5-flash");
    expect(entries[0].routed).toBe(false);
  });

  it("expands @* to one entry per key, keeping key order before moving down the list", () => {
    const providers = buildProviders({ GEMINI_API_KEYS: "a:k1,b:k2" });
    const entries = parseRoleList("AI_REVIEW_MODELS", "gemini@*:m1,gemini@b:m2", providers);
    expect(entries.map((e) => e.label)).toEqual(["gemini@a:m1", "gemini@b:m1", "gemini@b:m2"]);
    expect(entries.map((e) => e.tier)).toEqual([0, 1, 2]);
  });

  it("uses the first key when no alias is given", () => {
    const providers = buildProviders({ GEMINI_API_KEYS: "a:k1,b:k2" });
    expect(parseRoleList("X", "gemini:m1", providers)[0].keyAlias).toBe("a");
  });

  it("errors on an unknown alias, unknown provider, missing key or empty list", () => {
    const providers = buildProviders({ GEMINI_API_KEYS: "a:k1" });
    expect(() => parseRoleList("X", "gemini@nope:m1", providers)).toThrow(/unknown key alias/);
    expect(() => parseRoleList("X", "paidai:m1", providers)).toThrow(/unknown provider/);
    expect(() => parseRoleList("X", "groq:m1", providers)).toThrow(/not set/);
    expect(() => parseRoleList("X", "", providers)).toThrow(/empty/);
  });

  it("lets ollama work without a key", () => {
    const providers = buildProviders({ OLLAMA_BASE_URL: "http://127.0.0.1:11434/v1" });
    const [entry] = parseRoleList("X", "ollama:qwen2.5-coder", providers);
    expect(entry.baseURL).toBe("http://127.0.0.1:11434/v1");
    expect(entry.keyAlias).toBeNull();
  });

  it("only allows OpenRouter models ending in :free", () => {
    const providers = buildProviders({ OPENROUTER_API_KEY: "or" });
    expect(() => parseRoleList("X", "openrouter:vendor/model", providers)).toThrow(/free/);
    expect(parseRoleList("X", "openrouter:vendor/model:free", providers)).toHaveLength(1);
  });
});

describe("custom providers and overrides", () => {
  it("reads a custom provider's key from the named variable", () => {
    const providers = buildProviders({
      AI_CUSTOM_PROVIDERS: "cerebras|https://api.cerebras.ai/v1|CEREBRAS_API_KEY",
      CEREBRAS_API_KEY: "ck",
    });
    expect(providers.get("cerebras")?.keys).toEqual([{ alias: "default", key: "ck" }]);
  });

  it("parses interval overrides per provider:model", () => {
    expect(parseIntervalOverrides("gemini:gemini-2.5-flash=12000")).toEqual(new Map([["gemini:gemini-2.5-flash", 12000]]));
    expect(() => parseIntervalOverrides("gemini-2.5-flash")).toThrow(AiConfigError);
  });
});

describe("buildAiConfig", () => {
  it("builds both roles and never exposes keys in labels or ids", () => {
    const config = buildAiConfig({ ...base, GEMINI_API_KEYS: "main:SECRETKEY123" });
    const all = [...config.roles.review, ...config.roles.light];
    for (const entry of all) {
      expect(entry.id).not.toContain("SECRETKEY123");
      expect(entry.label).not.toContain("SECRETKEY123");
    }
    expect(config.maxInputTokens).toEqual({ review: 30000, light: 5000 });
  });

  it("names every provider that could receive code for a review type", () => {
    const config = buildAiConfig({
      ...base,
      GEMINI_API_KEY: "k",
      GROQ_API_KEY: "g",
      AI_TASK_ROUTES: "persona.reliability@ISSUE=groq:llama",
    });
    expect(providersForReviewType(config, "PROJECT_HEALTH").map((p) => p.name)).toEqual(["gemini"]);
    expect(providersForReviewType(config, "ISSUE").map((p) => p.label)).toEqual(["Google Gemini", "Groq"]);
  });
});

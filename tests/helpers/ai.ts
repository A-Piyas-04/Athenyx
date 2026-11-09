import { buildAiConfig, type AiConfig } from "@/lib/ai/config";
import type { ChatRequest, ChatResponse } from "@/lib/ai/transport";

/** Sample Gemini 429 bodies (OpenAI-compatible endpoint wraps the Google RPC error). */
export const GEMINI_MINUTE_BODY = JSON.stringify([
  {
    error: {
      code: 429,
      message: "You exceeded your current quota. Please retry in 34.5s.",
      status: "RESOURCE_EXHAUSTED",
      details: [
        {
          "@type": "type.googleapis.com/google.rpc.QuotaFailure",
          violations: [{ quotaId: "GenerateRequestsPerMinutePerProjectPerModel-FreeTier" }],
        },
        { "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "34s" },
      ],
    },
  },
]);

export const GEMINI_DAY_BODY = JSON.stringify([
  {
    error: {
      code: 429,
      message: "You exceeded your current quota.",
      status: "RESOURCE_EXHAUSTED",
      details: [
        {
          "@type": "type.googleapis.com/google.rpc.QuotaFailure",
          violations: [{ quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier" }],
        },
        { "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "21s" },
      ],
    },
  },
]);


export function testConfig(env: Record<string, string> = {}): AiConfig {
  return buildAiConfig({
    GEMINI_API_KEY: "test-gemini-key-0000",
    AI_REVIEW_MODELS: "gemini:model-a,gemini:model-b",
    AI_LIGHT_MODELS: "gemini:light-a",
    AI_DEFAULT_MIN_INTERVAL_MS: "0",
    ...env,
  });
}

export const ok = (content: string, over: Partial<ChatResponse> = {}): ChatResponse => ({
  content,
  finishReason: "stop",
  promptTokens: 100,
  completionTokens: 20,
  ...over,
});

/** A fake clock whose sleep advances time instantly. */
export function fakeClock(start = Date.UTC(2026, 6, 15, 20, 0)) {
  let now = start;
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

export type Scripted = (request: ChatRequest) => ChatResponse | Promise<ChatResponse>;

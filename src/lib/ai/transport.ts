import OpenAI, { APIConnectionTimeoutError, APIError } from "openai";
import { parseRetryAfter, ProviderHttpError } from "@/lib/ai/fallback";
import type { ModelEntry } from "@/lib/ai/providers";

/**
 * The HTTP boundary to the LLM providers. The `openai` package is used only as
 * an HTTP client for OpenAI-compatible endpoints (Gemini, Groq, OpenRouter,
 * Ollama, custom) — no OpenAI account or key is involved.
 *
 * Retries are disabled here: the fallback mechanism (fallback.ts, client.ts)
 * decides when to retry, wait, or switch models.
 */

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type ChatRequest = {
  entry: ModelEntry;
  messages: ChatMessage[];
  maxTokens: number;
  jsonMode: boolean;
  temperature: number;
};

export type ChatResponse = {
  content: string;
  finishReason: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
};

/** Sends one chat completion. Throws {@link ProviderHttpError} for provider failures. */
export type ChatTransport = (request: ChatRequest) => Promise<ChatResponse>;

export const REQUEST_TIMEOUT_MS = 60_000;

const clients = new Map<string, OpenAI>();

/** One client per provider + key, cached. */
export function clientFor(entry: Pick<ModelEntry, "provider" | "keyAlias" | "baseURL" | "apiKey">): OpenAI {
  const cacheKey = `${entry.provider}@${entry.keyAlias ?? "-"}`;
  let client = clients.get(cacheKey);
  if (!client) {
    client = new OpenAI({
      baseURL: entry.baseURL,
      apiKey: entry.apiKey,
      maxRetries: 0,
      timeout: REQUEST_TIMEOUT_MS,
    });
    clients.set(cacheKey, client);
  }
  return client;
}

function safeBody(error: unknown): string {
  try {
    return JSON.stringify(error ?? "");
  } catch {
    return "";
  }
}

/** Converts an `openai` package error into a {@link ProviderHttpError}. */
export function toProviderError(error: unknown): ProviderHttpError | null {
  if (error instanceof APIConnectionTimeoutError) {
    return new ProviderHttpError({ status: null, message: "Request timed out.", body: "", retryAfterMs: null, timeout: true });
  }
  if (error instanceof APIError) {
    return new ProviderHttpError({
      status: typeof error.status === "number" ? error.status : null,
      message: error.message,
      body: safeBody(error.error),
      retryAfterMs: parseRetryAfter(error.headers?.get?.("retry-after") ?? null),
      timeout: false,
    });
  }
  return null;
}

export const openAiCompatibleTransport: ChatTransport = async (request) => {
  const client = clientFor(request.entry);
  try {
    const completion = await client.chat.completions.create({
      model: request.entry.model,
      temperature: request.temperature,
      max_tokens: request.maxTokens,
      ...(request.jsonMode ? { response_format: { type: "json_object" as const } } : {}),
      messages: request.messages,
    });
    const choice = completion.choices[0];
    return {
      content: choice?.message?.content ?? "",
      finishReason: choice?.finish_reason ?? null,
      promptTokens: completion.usage?.prompt_tokens ?? null,
      completionTokens: completion.usage?.completion_tokens ?? null,
    };
  } catch (error) {
    throw toProviderError(error) ?? error;
  }
};

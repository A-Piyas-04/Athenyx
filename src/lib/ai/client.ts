import type { z } from "zod";
import { chainFor, getAiConfig, type AiConfig, type AiRole } from "@/lib/ai/config";
import {
  AiBadRequestError,
  AiBudgetError,
  AiConfigError,
  AiContextTooLargeError,
  AiInvalidOutputError,
  AiUnavailableError,
} from "@/lib/ai/errors";
import {
  classifyFailure,
  createFallbackState,
  DEFAULT_MINUTE_COOLDOWN_MS,
  LONG_COOLDOWN_MS,
  nextPacificMidnight,
  ProviderHttpError,
  SAME_MODEL_RETRY_MAX_MS,
  SERVER_COOLDOWN_MS,
  SERVER_RETRY_DELAY_MS,
  type FallbackState,
} from "@/lib/ai/fallback";
import { jsonInstructions, parseJsonOutput, repairPrompt } from "@/lib/ai/json";
import type { ModelEntry } from "@/lib/ai/providers";
import { createRateLimiter, realSleep, type RateLimiter } from "@/lib/ai/ratelimit";
import {
  openAiCompatibleTransport,
  type ChatMessage,
  type ChatResponse,
  type ChatTransport,
} from "@/lib/ai/transport";

/**
 * `callJson()` (05 §1.2): one JSON-mode chat call with validation, one repair
 * call, a truncation retry, 429 back-off, and the multi-model fallback chain.
 *
 * Prompt contents are never logged — only provider, model, token counts,
 * duration, retries and run id.
 */

export type Usage = {
  inputTokens: number;
  outputTokens: number;
  calls: number;
  retries: number;
  fallbacks: number;
  models: string[];
};

export function emptyUsage(): Usage {
  return { inputTokens: 0, outputTokens: 0, calls: 0, retries: 0, fallbacks: 0, models: [] };
}

export function addUsage(into: Usage, more: Usage): Usage {
  into.inputTokens += more.inputTokens;
  into.outputTokens += more.outputTokens;
  into.calls += more.calls;
  into.retries += more.retries;
  into.fallbacks += more.fallbacks;
  for (const model of more.models) if (!into.models.includes(model)) into.models.push(model);
  return into;
}

export type CallJsonOptions<T extends z.ZodType> = {
  role: AiRole;
  /** Task id for optional routes (05 §1.7), e.g. "persona.security". */
  task: string;
  /** Enables `@TYPE`-scoped routes. */
  reviewType?: string;
  /** Fixed instructions only — never repository or user text (05 §9). */
  system: string;
  /** The big data block (repository files etc.). */
  context?: string;
  /** Per-call instructions. */
  prompt: string;
  schema: T;
  maxOutputTokens?: number;
  runId?: string;
  /** Called with true when a rate-limit wait starts and false when it ends. */
  onWait?: (waiting: boolean) => void | Promise<void>;
  /** Called at least every 30s while waiting or while a request is in flight. */
  heartbeat?: () => void | Promise<void>;
};

export type CallJsonResult<T> = {
  data: T;
  usage: Usage;
  /** Display label of the model that produced `data` (alias, never the key). */
  model: string;
  /** Position in the role chain (route entries report their position in the route). */
  tier: number;
  routed: boolean;
  /** True when the result came from a fallback model of the role chain (tier > 0). */
  degraded: boolean;
};

export type CallJson = <T extends z.ZodType>(options: CallJsonOptions<T>) => Promise<CallJsonResult<z.infer<T>>>;

export type AiLogEvent = {
  event: "call" | "failure" | "warning";
  runId?: string;
  task?: string;
  model?: string;
  status?: number | null;
  kind?: string;
  inputTokens?: number;
  outputTokens?: number;
  durationMs?: number;
  message?: string;
};

export type AiClientDeps = {
  config: AiConfig;
  transport?: ChatTransport;
  limiter?: RateLimiter;
  fallback?: FallbackState;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  log?: (event: AiLogEvent) => void;
};

export const HEARTBEAT_INTERVAL_MS = 30_000;
const MAX_OUTPUT_CAP = 8192;
const INPUT_MARGIN = 1.15;
const MAX_REPAIR_ECHO_CHARS = 8_000;

export function estimateInputTokens(text: string): number {
  return Math.ceil((text.length / 4) * INPUT_MARGIN);
}

const defaultLog = (event: AiLogEvent) => {
  const line = `[athenyx][ai] ${JSON.stringify(event)}`;
  if (event.event === "call") console.info(line);
  else console.warn(line);
};

type Attempt<T> =
  | { kind: "ok"; data: T; entry: ModelEntry }
  /** Try the next entry; this one is already cooled down (or skipped for this call). */
  | { kind: "next"; exclude: boolean; invalidOutput?: boolean }
  | { kind: "fail"; error: Error };

export function createAiClient(deps: AiClientDeps): { callJson: CallJson; fallback: FallbackState } {
  const now = deps.now ?? Date.now;
  const sleep = deps.sleep ?? realSleep;
  const transport = deps.transport ?? openAiCompatibleTransport;
  const log = deps.log ?? defaultLog;
  const fallback = deps.fallback ?? createFallbackState(now);
  const limiter =
    deps.limiter ??
    createRateLimiter({
      defaultIntervalMs: deps.config.defaultIntervalMs,
      overrides: deps.config.intervalOverrides,
      now,
      sleep,
    });

  const callJson: CallJson = async (options) => {
    type T = z.infer<typeof options.schema>;
    const usage = emptyUsage();
    const system = `${options.system}\n\n${jsonInstructions(options.schema)}`;
    const user = options.context ? `${options.context}\n\n${options.prompt}` : options.prompt;
    const estimated = estimateInputTokens(system + user);
    const budget = deps.config.maxInputTokens[options.role];
    if (estimated > budget) {
      throw new AiBudgetError(
        `Input for ${options.task} is ~${estimated} tokens, above the ${options.role} budget of ${budget}.`,
      );
    }

    const chain = chainFor(deps.config, options.role, options.task, options.reviewType);
    const defaultMax = options.maxOutputTokens ?? (options.role === "review" ? 4096 : 2048);

    /** Waits `ms`, signalling the wait and heartbeating every 30s. */
    const waitFor = async (ms: number) => {
      await options.onWait?.(true);
      try {
        let remaining = ms;
        while (remaining > 0) {
          const step = Math.min(remaining, HEARTBEAT_INTERVAL_MS);
          await sleep(step);
          remaining -= step;
          await options.heartbeat?.();
        }
      } finally {
        await options.onWait?.(false);
      }
    };

    const send = async (entry: ModelEntry, messages: ChatMessage[], maxTokens: number, jsonMode: boolean) => {
      let waited = false;
      await limiter.acquire(entry, async () => {
        waited = true;
        await options.onWait?.(true);
      });
      if (waited) await options.onWait?.(false);
      const timer = options.heartbeat
        ? setInterval(() => void options.heartbeat?.(), HEARTBEAT_INTERVAL_MS)
        : null;
      const started = now();
      usage.calls += 1;
      try {
        const response = await transport({ entry, messages, maxTokens, jsonMode, temperature: 0.2 });
        const inputTokens = response.promptTokens ?? estimateInputTokens(messages.map((m) => m.content).join("\n"));
        const outputTokens = response.completionTokens ?? Math.ceil(response.content.length / 4);
        usage.inputTokens += inputTokens;
        usage.outputTokens += outputTokens;
        log({
          event: "call",
          runId: options.runId,
          task: options.task,
          model: entry.label,
          inputTokens,
          outputTokens,
          durationMs: now() - started,
        });
        return response;
      } finally {
        if (timer) clearInterval(timer);
      }
    };

    const messagesFor = (entry: ModelEntry): ChatMessage[] =>
      entry.flags.nosys
        ? [{ role: "user", content: `${system}\n\n${user}` }]
        : [
            { role: "system", content: system },
            { role: "user", content: user },
          ];

    /** Applies the 05 §1.6 action table. Returns "retry" to retry the same entry. */
    const handleFailure = async (
      entry: ModelEntry,
      error: ProviderHttpError,
      state: { sameModelRetried: boolean; jsonMode: boolean; jsonModeDropped: boolean },
    ): Promise<"retry" | Attempt<T>> => {
      const { kind, retryAfterMs } = classifyFailure(error.failure);
      log({ event: "failure", runId: options.runId, task: options.task, model: entry.label, status: error.failure.status, kind });
      const at = now();
      switch (kind) {
        case "rate_minute": {
          const delay = retryAfterMs ?? DEFAULT_MINUTE_COOLDOWN_MS;
          if (!state.sameModelRetried && delay <= SAME_MODEL_RETRY_MAX_MS) {
            state.sameModelRetried = true;
            usage.retries += 1;
            await waitFor(delay);
            return "retry";
          }
          fallback.cooldown(entry, at + delay, "rate_minute");
          return { kind: "next", exclude: false };
        }
        case "quota_day":
          fallback.cooldown(entry, nextPacificMidnight(at), "quota_day");
          return { kind: "next", exclude: false };
        case "server_error":
          if (!state.sameModelRetried) {
            state.sameModelRetried = true;
            usage.retries += 1;
            await waitFor(SERVER_RETRY_DELAY_MS);
            return "retry";
          }
          fallback.cooldown(entry, at + SERVER_COOLDOWN_MS, "server_error");
          return { kind: "next", exclude: false };
        case "not_found":
          log({ event: "warning", model: entry.label, message: `Model not found; check AI_*_MODELS (${entry.label}).` });
          fallback.cooldown(entry, at + LONG_COOLDOWN_MS, "not_found");
          return { kind: "next", exclude: false };
        case "too_large":
          return { kind: "next", exclude: true };
        case "auth":
          log({
            event: "warning",
            model: entry.label,
            message: `${entry.provider} key '${entry.keyAlias ?? "-"}' rejected; its models are paused for 24h.`,
          });
          fallback.cooldownKey(entry, at + LONG_COOLDOWN_MS);
          return { kind: "next", exclude: false };
        case "bad_request": {
          const text = `${error.failure.message} ${error.failure.body}`;
          if (state.jsonMode && !state.jsonModeDropped && /response_format|json/i.test(text)) {
            state.jsonMode = false;
            state.jsonModeDropped = true;
            usage.retries += 1;
            return "retry";
          }
          return { kind: "fail", error: new AiBadRequestError() };
        }
      }
    };

    const tryEntry = async (entry: ModelEntry): Promise<Attempt<T>> => {
      const state = { sameModelRetried: false, jsonMode: !entry.flags.nojson, jsonModeDropped: false };
      let maxTokens = defaultMax;
      let lengthRetried = false;
      const messages = messagesFor(entry);

      for (;;) {
        let response: ChatResponse;
        try {
          response = await send(entry, messages, maxTokens, state.jsonMode);
        } catch (error) {
          if (!(error instanceof ProviderHttpError)) throw error;
          const action = await handleFailure(entry, error, state);
          if (action === "retry") continue;
          return action;
        }

        if (response.finishReason === "length") {
          if (!lengthRetried && maxTokens < MAX_OUTPUT_CAP) {
            lengthRetried = true;
            maxTokens = Math.min(maxTokens * 2, MAX_OUTPUT_CAP);
            usage.retries += 1;
            continue;
          }
          return { kind: "next", exclude: true, invalidOutput: true };
        }

        const parsed = parseJsonOutput(response.content, options.schema);
        if (parsed.ok) return { kind: "ok", data: parsed.data, entry };

        // One repair call on the same model.
        usage.retries += 1;
        const repairMessages: ChatMessage[] = [
          ...messages,
          { role: "assistant", content: response.content.slice(0, MAX_REPAIR_ECHO_CHARS) },
          { role: "user", content: repairPrompt(parsed.error) },
        ];
        try {
          const repaired = await send(entry, repairMessages, maxTokens, state.jsonMode);
          const second = parseJsonOutput(repaired.content, options.schema);
          if (second.ok) return { kind: "ok", data: second.data, entry };
        } catch (error) {
          if (!(error instanceof ProviderHttpError)) throw error;
          // A provider failure on the repair call is a provider problem, not invalid output:
          // apply its cooldown and move on without counting it against the "invalid once" rule.
          const action = await handleFailure(entry, error, { ...state, sameModelRetried: true, jsonModeDropped: true });
          if (action === "retry") return { kind: "next", exclude: true };
          return action;
        }
        return { kind: "next", exclude: true, invalidOutput: true };
      }
    };

    const exclude = new Set<string>();
    let previous: string | null = null;
    let invalidOutputs = 0;
    let tooLargeSeen = false;

    for (let guard = 0; guard < 100; guard += 1) {
      const selection = fallback.select(chain, estimated, exclude);
      if (selection.kind === "wait") {
        await waitFor(Math.max(0, selection.until - now()));
        continue;
      }
      if (selection.kind === "too_large") throw new AiContextTooLargeError();
      if (selection.kind === "unavailable") {
        if (tooLargeSeen && selection.resetAt === null && invalidOutputs === 0) throw new AiContextTooLargeError();
        if (invalidOutputs > 0 && selection.resetAt === null) throw new AiInvalidOutputError();
        if (selection.reason === "auth") {
          throw new AiConfigError("Every configured AI key was rejected. Check the API keys in .env.");
        }
        if (selection.reason === "quota_day" && selection.resetAt !== null) {
          throw new AiUnavailableError(
            `Free AI quota is used up for today on all configured models. Try again after ${formatReset(selection.resetAt)}.`,
            selection.resetAt,
          );
        }
        throw new AiUnavailableError(undefined, selection.resetAt);
      }

      const entry = selection.entry;
      if (previous !== null && previous !== entry.id) usage.fallbacks += 1;
      previous = entry.id;

      const attempt = await tryEntry(entry);
      if (attempt.kind === "ok") {
        fallback.recordSuccess(entry);
        usage.models.push(entry.label);
        return {
          data: attempt.data,
          usage,
          model: entry.label,
          tier: entry.tier,
          routed: entry.routed,
          degraded: !entry.routed && entry.tier > 0,
        };
      }
      if (attempt.kind === "fail") throw attempt.error;
      if (attempt.invalidOutput) {
        invalidOutputs += 1;
        // Invalid output falls back to the next model once (05 §1.6).
        if (invalidOutputs > 1) throw new AiInvalidOutputError();
      }
      if (attempt.exclude) {
        if (!attempt.invalidOutput) tooLargeSeen = true;
        exclude.add(entry.id);
      }
    }
    throw new AiUnavailableError();
  };

  return { callJson, fallback };
}

function formatReset(at: number): string {
  return new Date(at).toLocaleString("en-US", {
    timeZone: "America/Los_Angeles",
    dateStyle: "medium",
    timeStyle: "short",
  }) + " (US Pacific)";
}

let defaultClient: ReturnType<typeof createAiClient> | null = null;

/** The process-wide client (worker): one rate limiter and cooldown state for all runs. */
export function getAiClient(): ReturnType<typeof createAiClient> {
  defaultClient ??= createAiClient({ config: getAiConfig() });
  return defaultClient;
}

/** Convenience wrapper around the process-wide client. */
export const callJson: CallJson = (options) => getAiClient().callJson(options);

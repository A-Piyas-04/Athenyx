import type { z } from "zod";
import type { CallJson, CallJsonOptions, CallJsonResult } from "@/lib/ai/client";

/**
 * Replaces `callJson` with canned outputs keyed by task (09 §2): "planner",
 * "persona.<key>", "synthesis", "recheck". Outputs are validated against the
 * call's schema so tests can't feed the engine shapes the real client would reject.
 */

export type MockCall = { task: string; role: string; system: string; context: string; prompt: string };
export type MockHandler = (call: MockCall) => unknown | Promise<unknown>;

export function mockAi(
  handlers: Record<string, MockHandler | unknown>,
  options: { degradedTasks?: string[]; model?: (task: string) => string } = {},
) {
  const calls: MockCall[] = [];
  const callJson: CallJson = async <T extends z.ZodType>(opts: CallJsonOptions<T>): Promise<CallJsonResult<z.infer<T>>> => {
    const call = { task: opts.task, role: opts.role, system: opts.system, context: opts.context ?? "", prompt: opts.prompt };
    calls.push(call);
    if (!(opts.task in handlers)) throw new Error(`mockAi: no handler for ${opts.task}`);
    const handler = handlers[opts.task];
    const raw = typeof handler === "function" ? await (handler as MockHandler)(call) : handler;
    const data = opts.schema.parse(raw);
    const degraded = options.degradedTasks?.includes(opts.task) ?? false;
    const model = options.model?.(opts.task) ?? (degraded ? "gemini:fallback-model" : "gemini:primary-model");
    return {
      data,
      usage: { inputTokens: 1000, outputTokens: 200, calls: 1, retries: 0, fallbacks: degraded ? 1 : 0, models: [model] },
      model,
      tier: degraded ? 1 : 0,
      routed: false,
      degraded,
    };
  };
  return { callJson, calls, count: (task?: string) => calls.filter((c) => !task || c.task === task).length };
}

/** A persona output with sensible defaults. */
export function personaOutput(over: Record<string, unknown> = {}) {
  return { summary: "Reviewed the code.", answer: null, noSignificantIssues: false, findings: [], limitations: [], ...over };
}

export function finding(over: Record<string, unknown> = {}) {
  return {
    existingFindingId: null,
    title: "A finding",
    observation: "Observation.",
    impact: "Impact.",
    classification: "POTENTIAL_RISK",
    severity: "MEDIUM",
    confidence: "MEDIUM",
    evidence: [],
    userPremise: null,
    options: [
      { title: "Option A", description: "Do A.", pros: ["simple"], cons: ["partial"], effort: "SMALL" },
      { title: "Option B", description: "Do B.", pros: ["complete"], cons: ["bigger change"], effort: "MEDIUM" },
    ],
    recommendation: { optionIndex: 0, rationale: "Smallest safe change." },
    verification: "Add a test.",
    ...over,
  };
}

export function synthesisOutput(over: Record<string, unknown> = {}) {
  return { summary: "Combined summary.", answer: null, verdict: null, conditions: [], limitations: [], ...over };
}

import { z } from "zod";
import { AiConfigError } from "@/lib/ai/errors";
import {
  buildProviders,
  parseIntervalOverrides,
  parseRoleList,
  type AiEnvSource,
  type ModelEntry,
  type ProviderDef,
} from "@/lib/ai/providers";
import { parseTaskRoutes, resolveChain, type TaskRoutes } from "@/lib/ai/routes";

/** The fully parsed AI configuration (05 §1). Built once per process. */
export type AiConfig = {
  providers: Map<string, ProviderDef>;
  roles: { review: ModelEntry[]; light: ModelEntry[] };
  routes: TaskRoutes;
  maxInputTokens: { review: number; light: number };
  defaultIntervalMs: number;
  /** `provider:model` → ms. */
  intervalOverrides: Map<string, number>;
  warnings: string[];
};

export type AiRole = "review" | "light";

const numbers = z.object({
  AI_REVIEW_MAX_INPUT_TOKENS: z.coerce.number().int().positive().default(30_000),
  AI_LIGHT_MAX_INPUT_TOKENS: z.coerce.number().int().positive().default(5_000),
  AI_DEFAULT_MIN_INTERVAL_MS: z.coerce.number().int().min(0).default(6_000),
});

export function buildAiConfig(source: AiEnvSource = process.env): AiConfig {
  const nums = numbers.safeParse({
    AI_REVIEW_MAX_INPUT_TOKENS: source.AI_REVIEW_MAX_INPUT_TOKENS?.trim() || undefined,
    AI_LIGHT_MAX_INPUT_TOKENS: source.AI_LIGHT_MAX_INPUT_TOKENS?.trim() || undefined,
    AI_DEFAULT_MIN_INTERVAL_MS: source.AI_DEFAULT_MIN_INTERVAL_MS?.trim() || undefined,
  });
  if (!nums.success) {
    throw new AiConfigError(
      `Invalid AI token/interval settings: ${nums.error.issues.map((i) => i.path.join(".")).join(", ")}`,
    );
  }

  const providers = buildProviders(source);
  const review = parseRoleList("AI_REVIEW_MODELS", source.AI_REVIEW_MODELS, providers);
  const light = parseRoleList("AI_LIGHT_MODELS", source.AI_LIGHT_MODELS, providers);
  const { routes, warnings } = parseTaskRoutes(source.AI_TASK_ROUTES, providers);

  return {
    providers,
    roles: { review, light },
    routes,
    maxInputTokens: {
      review: nums.data.AI_REVIEW_MAX_INPUT_TOKENS,
      light: nums.data.AI_LIGHT_MAX_INPUT_TOKENS,
    },
    defaultIntervalMs: nums.data.AI_DEFAULT_MIN_INTERVAL_MS,
    intervalOverrides: parseIntervalOverrides(source.AI_MIN_INTERVAL_MS_OVERRIDES),
    warnings,
  };
}

let cached: AiConfig | null = null;

/** Parses (once) and returns the AI configuration; logs route warnings once. */
export function getAiConfig(): AiConfig {
  if (!cached) {
    cached = buildAiConfig();
    for (const warning of cached.warnings) console.warn(`[athenyx] ${warning}`);
  }
  return cached;
}

/** Tests only. */
export function resetAiConfigCache(): void {
  cached = null;
}

/** Every entry a call for `task` may use, in order. */
export function chainFor(config: AiConfig, role: AiRole, task: string, reviewType?: string): ModelEntry[] {
  return resolveChain(config.roles[role], config.routes, task, reviewType);
}

export type ProviderNotice = { name: string; label: string; termsUrl: string | null; local: boolean };

/**
 * Providers that could receive code for a review of `reviewType`: both role
 * chains plus every route that applies to that type (06 Review Lab notice).
 */
export function providersForReviewType(config: AiConfig, reviewType: string): ProviderNotice[] {
  const names = new Set<string>();
  for (const entry of [...config.roles.review, ...config.roles.light]) names.add(entry.provider);
  for (const [taskId, entries] of config.routes) {
    const scope = taskId.split("@")[1];
    if (scope !== undefined && scope !== reviewType) continue;
    for (const entry of entries) names.add(entry.provider);
  }
  return [...names].map((name) => {
    const def = config.providers.get(name);
    return {
      name,
      label: def?.label ?? name,
      termsUrl: def?.termsUrl ?? null,
      local: def?.local ?? false,
    };
  });
}

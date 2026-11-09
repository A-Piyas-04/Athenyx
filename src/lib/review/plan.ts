import type { ReviewType } from "@/generated/prisma/enums";
import { mentionsAi } from "@/lib/ai/prompts/tasks";
import { isPersonaKey, type PersonaKey, type PlannerOutput } from "@/lib/ai/schemas";
import { normalizeRepoPath } from "@/lib/repo/filters";

/** Deterministic post-processing of the planner's output (04 §5a). */

export const FALLBACK_PERSONAS: Record<ReviewType, PersonaKey[]> = {
  PROJECT_HEALTH: ["architecture", "security", "quality"],
  LATEST_CHANGES: ["quality", "security", "code_quality"],
  ASK: ["architecture"],
  PROPOSAL: ["architecture", "product_ux"],
  ISSUE: ["reliability", "quality"],
  RELEASE: ["devops", "quality"],
  RECHECK: [],
};

export const MAX_PLANNER_FILES = 30;
export const MAX_KEYWORDS = 10;

export type ReviewPlan = {
  personas: PersonaKey[];
  files: string[];
  keywords: string[];
  /** True when the planner output was unusable and defaults were applied. */
  usedFallback: boolean;
};

export type PlanContext = {
  reviewType: ReviewType;
  fileSet: ReadonlySet<string>;
  usesAI: boolean;
  developerInput: string;
  maxPersonas: number;
};

/** True when the `ai_ml` persona may be used for this review. */
export function aiPersonaAllowed(ctx: Pick<PlanContext, "usesAI" | "developerInput">): boolean {
  return ctx.usesAI || mentionsAi(ctx.developerInput);
}

/**
 * Drops unknown persona keys and paths not in the tree; `ai_ml` only when the
 * project uses AI or the input mentions it; falls back to per-type defaults
 * when no persona survives; caps to `maxPersonas`.
 */
export function postProcessPlan(plan: PlannerOutput | null, ctx: PlanContext): ReviewPlan {
  const allowAi = aiPersonaAllowed(ctx);
  const personas: PersonaKey[] = [];
  for (const raw of plan?.personas ?? []) {
    const key = raw.trim().toLowerCase();
    if (!isPersonaKey(key) || personas.includes(key)) continue;
    if (key === "ai_ml" && !allowAi) continue;
    personas.push(key);
  }

  let usedFallback = plan === null;
  if (personas.length === 0) {
    usedFallback = true;
    personas.push(...FALLBACK_PERSONAS[ctx.reviewType]);
  }

  const files: string[] = [];
  const all = [...ctx.fileSet];
  for (const raw of plan?.files ?? []) {
    const p = normalizeRepoPath(raw.trim().replace(/^\.?\//, ""));
    let resolved: string | null = ctx.fileSet.has(p) ? p : null;
    if (!resolved && p !== "") {
      // Small models often return a partial path ("route.ts", "lib/auth.ts"): accept a unique suffix match.
      const matches = all.filter((f) => f.endsWith(`/${p}`));
      if (matches.length === 1) resolved = matches[0];
    }
    if (resolved && !files.includes(resolved)) files.push(resolved);
    if (files.length >= MAX_PLANNER_FILES) break;
  }

  const keywords: string[] = [];
  for (const raw of plan?.keywords ?? []) {
    const k = raw.trim();
    if (k.length < 3 || k.length > 80 || keywords.includes(k)) continue;
    keywords.push(k);
    if (keywords.length >= MAX_KEYWORDS) break;
  }

  return { personas: personas.slice(0, Math.max(1, ctx.maxPersonas)), files, keywords, usedFallback };
}

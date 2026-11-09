import { AiConfigError } from "@/lib/ai/errors";
import {
  parseEntrySpec,
  resolveEntrySpec,
  type ModelEntry,
  type ProviderDef,
} from "@/lib/ai/providers";
import { isPersonaKey } from "@/lib/ai/schemas";
import { ReviewType } from "@/generated/prisma/enums";

/**
 * Optional task routes (05 §1.7): a specific task may prefer another free
 * provider/model. Route entries are placed in front of the role chain and go
 * through the same fallback mechanism, so a route can never make a task less
 * available than the default.
 */

const BASE_TASKS = new Set(["planner", "synthesis", "recheck"]);
const REVIEW_TYPES = new Set<string>(Object.values(ReviewType));

/** True for `planner`, `synthesis`, `recheck`, `persona.<key>`, each optionally `@TYPE`. */
export function isValidTaskId(taskId: string): boolean {
  const [task, type, ...rest] = taskId.split("@");
  if (rest.length > 0) return false;
  if (type !== undefined && !REVIEW_TYPES.has(type)) return false;
  if (BASE_TASKS.has(task)) return true;
  return task.startsWith("persona.") && isPersonaKey(task.slice("persona.".length));
}

export type TaskRoutes = Map<string, ModelEntry[]>;

/**
 * Parses `AI_TASK_ROUTES=task=entry,entry;task=entry`. Entries whose provider
 * has no key are ignored with a warning (not an error), so routes can stay in
 * `.env` while a key is missing.
 */
export function parseTaskRoutes(
  raw: string | undefined,
  providers: Map<string, ProviderDef>,
): { routes: TaskRoutes; warnings: string[] } {
  const routes: TaskRoutes = new Map();
  const warnings: string[] = [];
  for (const part of (raw ?? "").split(";").map((p) => p.trim()).filter(Boolean)) {
    const eq = part.indexOf("=");
    if (eq <= 0) throw new AiConfigError(`AI_TASK_ROUTES: "${part}" must be "task=provider:model,…".`);
    const taskId = part.slice(0, eq).trim();
    if (!isValidTaskId(taskId)) {
      throw new AiConfigError(
        `AI_TASK_ROUTES: unknown task "${taskId}". Use planner, synthesis, recheck or persona.<key>, optionally with @TYPE.`,
      );
    }
    if (routes.has(taskId)) throw new AiConfigError(`AI_TASK_ROUTES: task "${taskId}" is listed twice.`);

    const entries: ModelEntry[] = [];
    // Entries may contain "=" only inside flags (max=…), which follow "|", so split on "," is safe.
    for (const text of part.slice(eq + 1).split(",").map((p) => p.trim()).filter(Boolean)) {
      const spec = parseEntrySpec(text);
      const resolved = resolveEntrySpec(spec, providers, `AI_TASK_ROUTES (${taskId})`);
      if (resolved.missingKey) {
        warnings.push(`AI_TASK_ROUTES: ignoring "${spec.provider}:${spec.model}" for ${taskId} (no API key configured).`);
        continue;
      }
      for (const entry of resolved.entries) {
        entries.push({ ...entry, tier: entries.length, routed: true });
      }
    }
    if (entries.length > 0) routes.set(taskId, entries);
  }
  return { routes, warnings };
}

/**
 * The ordered entries for one call: `task@TYPE` route → `task` route → role
 * chain. Duplicates keep their first (most specific) position.
 */
export function resolveChain(
  roleChain: ModelEntry[],
  routes: TaskRoutes,
  task: string,
  reviewType?: string,
): ModelEntry[] {
  const chain: ModelEntry[] = [];
  const seen = new Set<string>();
  const push = (entries: ModelEntry[] | undefined) => {
    for (const entry of entries ?? []) {
      if (seen.has(entry.id)) continue;
      seen.add(entry.id);
      chain.push(entry);
    }
  };
  if (reviewType) push(routes.get(`${task}@${reviewType}`));
  push(routes.get(task));
  push(roleChain);
  return chain;
}

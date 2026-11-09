import { z } from "zod";
import type { ReviewType } from "@/generated/prisma/enums";

/**
 * Review type configuration and the JSON shapes stored on runs and findings
 * (02 "JSON shapes", 04 §2).
 */

export type ReviewTypeConfig = {
  label: string;
  /** Required input field, or false. */
  needsInput: false | "question" | "brief" | "symptom" | "targetFindingIds";
  usesDiff: boolean;
  producesAnswer: boolean;
  producesVerdict: boolean;
};

export const REVIEW_TYPES: Record<ReviewType, ReviewTypeConfig> = {
  PROJECT_HEALTH: { label: "Project Health", needsInput: false, usesDiff: false, producesAnswer: false, producesVerdict: false },
  LATEST_CHANGES: { label: "Latest Changes", needsInput: false, usesDiff: true, producesAnswer: false, producesVerdict: false },
  ASK: { label: "Ask About My Codebase", needsInput: "question", usesDiff: false, producesAnswer: true, producesVerdict: false },
  PROPOSAL: { label: "Proposal Review", needsInput: "brief", usesDiff: false, producesAnswer: true, producesVerdict: false },
  ISSUE: { label: "Issue Investigation", needsInput: "symptom", usesDiff: false, producesAnswer: true, producesVerdict: false },
  RELEASE: { label: "Release Assessment", needsInput: false, usesDiff: false, producesAnswer: false, producesVerdict: true },
  RECHECK: { label: "Re-check", needsInput: "targetFindingIds", usesDiff: true, producesAnswer: false, producesVerdict: false },
};

/** Review types the user can start from Review Lab / Release Gate (RECHECK is internal). */
export const STARTABLE_TYPES = ["PROJECT_HEALTH", "LATEST_CHANGES", "ASK", "PROPOSAL", "ISSUE", "RELEASE"] as const;
export type StartableType = (typeof STARTABLE_TYPES)[number];

// ---------------------------------------------------------------------------
// Inputs (04 §2) — validated at enqueue time
// ---------------------------------------------------------------------------

const text = (max: number) => z.string().trim().max(max, `Must be at most ${max} characters.`);
const required = (max: number, field: string) =>
  z
    .string({ error: `${field} is required.` })
    .trim()
    .max(max, `Must be at most ${max} characters.`)
    .min(1, `${field} is required.`);
const optionalText = (max: number) =>
  text(max)
    .optional()
    .transform((v) => (v === undefined || v === "" ? undefined : v));

const SHA_RE = /^[0-9a-f]{7,40}$/i;

export const healthInputSchema = z.object({ focus: optionalText(1000) }).strict();
export const changesInputSchema = z
  .object({
    focus: optionalText(1000),
    baseSha: z.string().trim().regex(SHA_RE, "Must be a commit SHA.").optional(),
  })
  .strict();
export const askInputSchema = z
  .object({ question: required(2000, "A question"), constraints: optionalText(2000) })
  .strict();
export const proposalInputSchema = z
  .object({ brief: required(4000, "A proposal brief"), constraints: optionalText(2000) })
  .strict();
export const issueInputSchema = z
  .object({
    symptom: required(2000, "A symptom"),
    expected: optionalText(1000),
    actual: optionalText(1000),
    log: optionalText(8000),
  })
  .strict();
export const releaseInputSchema = z.object({}).strict();

export const INPUT_SCHEMAS = {
  PROJECT_HEALTH: healthInputSchema,
  LATEST_CHANGES: changesInputSchema,
  ASK: askInputSchema,
  PROPOSAL: proposalInputSchema,
  ISSUE: issueInputSchema,
  RELEASE: releaseInputSchema,
} as const satisfies Record<StartableType, z.ZodType>;

/** The union of every input field (what is stored in `ReviewRun.input`). */
export type RunInput = {
  focus?: string;
  baseSha?: string;
  question?: string;
  brief?: string;
  constraints?: string;
  symptom?: string;
  expected?: string;
  actual?: string;
  log?: string;
  targetFindingIds?: string[];
};

/** Body of `POST /api/projects/:projectId/runs` (07). */
export const createRunSchema = z.object({
  type: z.enum(STARTABLE_TYPES),
  branch: z.string().trim().min(1).max(255).optional(),
  input: z.record(z.string(), z.unknown()).optional(),
});
export type CreateRunBody = z.infer<typeof createRunSchema>;

export type InputParseResult =
  | { ok: true; input: RunInput }
  | { ok: false; details: unknown; message: string };

/** Validates the per-type input. Unknown fields are rejected. */
export function parseRunInput(type: StartableType, input: unknown): InputParseResult {
  const schema: z.ZodType = INPUT_SCHEMAS[type];
  const result = schema.safeParse(input ?? {});
  if (result.success) {
    const clean = Object.fromEntries(Object.entries(result.data as Record<string, unknown>).filter(([, v]) => v !== undefined));
    return { ok: true, input: clean as RunInput };
  }
  const first = result.error.issues[0];
  return {
    ok: false,
    details: z.treeifyError(result.error),
    message: first ? `${first.path.join(".") || "input"}: ${first.message}` : "Invalid review input.",
  };
}

/** Reads a stored `ReviewRun.input` back (it was validated at enqueue time). */
export function readRunInput(value: unknown): RunInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: RunInput = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if (key === "targetFindingIds") {
      if (Array.isArray(v)) out.targetFindingIds = v.filter((x): x is string => typeof x === "string");
    } else if (typeof v === "string") {
      (out as Record<string, string>)[key] = v;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Stored JSON shapes (02)
// ---------------------------------------------------------------------------

export const EvidenceItemSchema = z.object({
  path: z.string(),
  startLine: z.number().int(),
  endLine: z.number().int(),
  symbol: z.string().nullable(),
  snippet: z.string(),
  commitSha: z.string(),
});
export type EvidenceItem = z.infer<typeof EvidenceItemSchema>;

export const FixOptionSchema = z.object({
  title: z.string(),
  description: z.string(),
  pros: z.array(z.string()),
  cons: z.array(z.string()),
  effort: z.enum(["SMALL", "MEDIUM", "LARGE"]).nullable(),
});
export type FixOption = z.infer<typeof FixOptionSchema>;

export const RecommendationSchema = z.object({
  optionIndex: z.number().int().nullable(),
  rationale: z.string(),
});
export type Recommendation = z.infer<typeof RecommendationSchema>;

export type ExclusionReason = "budget" | "ignored" | "secret" | "binary" | "too_large";

export type SpecialistReport = {
  persona: string;
  status: "done" | "failed";
  summary: string | null;
  answer: string | null;
  model: string | null;
  /** True when this persona's call used a fallback model (tier > 0). */
  degraded: boolean;
  findingCount: number;
  /** Findings this specialist proposed before evidence checks (absent on older runs). */
  raised?: number;
  /** Findings removed because none of their citations matched the reviewed commit. */
  unsupported?: number;
  /** Individual citations dropped from otherwise valid findings. */
  citationsDropped?: number;
};

/** The deterministic Evidence Arbiter's tally for one run. */
export type ArbiterReport = {
  raised: number;
  unsupported: number;
  citationsDropped: number;
  /** Duplicates merged across specialists. */
  merged: number;
  /** Lower-priority findings cut by the per-run cap. */
  omitted: number;
  kept: number;
};

/**
 * How the board worked on one run: why these specialists were chosen, what
 * the arbiter did, and where specialists independently agreed.
 * NOTE: stored inside ReviewRun.coverage (JSON), so older runs simply lack it.
 */
export type BoardReport = {
  selectionReason: string | null;
  /** True when the planner was unavailable and a default selection was used. */
  defaultSelection: boolean;
  arbiter: ArbiterReport;
  agreements: { title: string; personas: string[] }[];
};

export type Coverage = {
  filesIncluded: string[];
  filesExcluded: { path: string; reason: ExclusionReason }[];
  limitations: string[];
  /**
   * NOTE: per-persona summaries live here so the run page can show "Specialist
   * details" — the data model has no separate column for them.
   */
  specialists?: SpecialistReport[];
  board?: BoardReport;
};

export type PersonaRunStatus = "pending" | "running" | "waiting_rate_limit" | "done" | "failed";

/** Reads arrays of a JSON column defensively (display only). */
export function readJsonArray<T>(value: unknown, schema: z.ZodType<T>): T[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const parsed = schema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

export function readCoverage(value: unknown): Coverage | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Partial<Coverage>;
  return {
    filesIncluded: Array.isArray(v.filesIncluded) ? v.filesIncluded : [],
    filesExcluded: Array.isArray(v.filesExcluded) ? v.filesExcluded : [],
    limitations: Array.isArray(v.limitations) ? v.limitations : [],
    specialists: Array.isArray(v.specialists) ? v.specialists : [],
    board: v.board && typeof v.board === "object" && !Array.isArray(v.board) ? (v.board as BoardReport) : undefined,
  };
}

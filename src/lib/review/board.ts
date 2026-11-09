import type { Severity } from "@/generated/prisma/enums";
import { PERSONAS, personaName } from "@/lib/ai/prompts/personas";
import type { PersonaKey } from "@/lib/ai/schemas";

/**
 * The review board as the product presents it (docs/Athenyx_01_AI_Personas.md):
 * nine core specialists, one conditional specialist and the Evidence Arbiter.
 * Display-only; no server imports so client components can use it.
 */

export const ARBITER = "evidence_arbiter";

export type Seat = {
  key: string;
  name: string;
  /** Compact label for dense layouts. */
  short: string;
  /** What this seat looks at, in plain words. */
  focus: string;
  kind: "core" | "conditional" | "support";
};

const SHORT: Record<string, string> = {
  architecture: "Architecture",
  security: "Security",
  data_integrity: "Data integrity",
  reliability: "Reliability",
  quality: "Testing",
  product_ux: "Product & UX",
  devops: "DevOps",
  algorithms: "Algorithms",
  code_quality: "Code quality",
  ai_ml: "AI/ML",
  evidence_arbiter: "Evidence",
};

const CORE: PersonaKey[] = [
  "architecture",
  "security",
  "data_integrity",
  "reliability",
  "quality",
  "product_ux",
  "devops",
  "algorithms",
  "code_quality",
];

function sentence(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1) + ".";
}

export const ROSTER: Seat[] = [
  ...CORE.map((key) => ({ key, name: personaName(key), short: SHORT[key], focus: sentence(PERSONAS[key].oneLine), kind: "core" as const })),
  { key: "ai_ml", name: personaName("ai_ml"), short: SHORT.ai_ml, focus: sentence(PERSONAS.ai_ml.oneLine), kind: "conditional" },
  {
    key: ARBITER,
    name: "Evidence Arbiter",
    short: SHORT.evidence_arbiter,
    focus: "Checks every citation against the reviewed commit, removes claims it cannot match, and merges duplicates.",
    kind: "support",
  },
];

export function seatFor(key: string): Seat {
  return ROSTER.find((s) => s.key === key) ?? { key, name: personaName(key), short: personaName(key), focus: "", kind: "core" };
}

/**
 * A specialist's stance on one review. Specialists don't vote; the stance is
 * derived from their findings that survived the Evidence Arbiter, so it is
 * always backed by cited code.
 */
export type Stance = "serious" | "concerns" | "clear" | "failed" | "working" | "waiting" | "queued";

export const STANCE_LABEL: Record<Stance, string> = {
  serious: "Flags serious issues",
  concerns: "Has concerns",
  clear: "Signs off",
  failed: "Couldn't finish",
  working: "Analyzing",
  waiting: "Waiting for AI rate limit",
  queued: "Up next",
};

export const STANCE_TONE: Record<Stance, string> = {
  serious: "text-bad",
  concerns: "text-warn",
  clear: "text-ok",
  failed: "text-destructive",
  working: "text-link",
  waiting: "text-warn",
  queued: "text-muted-foreground",
};

export function deriveStance(status: string, findings: { severity: Severity }[]): Stance {
  if (status === "failed") return "failed";
  if (status === "running") return "working";
  if (status === "waiting_rate_limit") return "waiting";
  if (status === "pending") return "queued";
  if (findings.some((f) => f.severity === "CRITICAL" || f.severity === "HIGH")) return "serious";
  if (findings.length > 0) return "concerns";
  return "clear";
}

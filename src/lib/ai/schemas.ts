import { z } from "zod";

/**
 * LLM output schemas (05 §5). Kept flat and simple so small free models can
 * follow them; limits (counts, lengths) are enforced in code, not here.
 */

export const PERSONA_KEYS = [
  "architecture",
  "security",
  "data_integrity",
  "reliability",
  "quality",
  "product_ux",
  "devops",
  "algorithms",
  "code_quality",
  "ai_ml",
] as const;

export const PersonaKeyEnum = z.enum(PERSONA_KEYS);
export type PersonaKey = z.infer<typeof PersonaKeyEnum>;

export function isPersonaKey(value: string): value is PersonaKey {
  return (PERSONA_KEYS as readonly string[]).includes(value);
}

export const PlannerOutput = z.object({
  personas: z.array(z.string()), // unknown keys dropped in code (small models invent names)
  files: z.array(z.string()),
  keywords: z.array(z.string()),
  reason: z.string(),
});
export type PlannerOutput = z.infer<typeof PlannerOutput>;

export const EvidenceOut = z.object({
  path: z.string().describe("exact path attribute of a <repository_file> block"),
  startLine: z.number().int().describe("1-based, the number before '| '"),
  endLine: z.number().int().describe("1-based, inclusive"),
  symbol: z.string().nullable().describe("enclosing function/class/component name, or null"),
  quote: z.string().describe("1-3 lines copied exactly from the cited lines, without the 'N| ' prefix"),
});
export type EvidenceOut = z.infer<typeof EvidenceOut>;

export const FixOptionOut = z.object({
  title: z.string(),
  description: z.string(),
  pros: z.array(z.string()),
  cons: z.array(z.string()),
  effort: z.enum(["SMALL", "MEDIUM", "LARGE"]).nullable(),
});
export type FixOptionOut = z.infer<typeof FixOptionOut>;

// Evidence comes before the claim on purpose: models write fields in schema order, so they find the code first.
export const FindingOut = z.object({
  existingFindingId: z.string().nullable().describe("id from <prior_findings> if this is the same issue, else null"),
  title: z.string().describe("at most 100 characters"),
  evidence: z.array(EvidenceOut),
  observation: z.string().describe("what is wrong, referring to the cited code"),
  impact: z.string().describe("practical consequence"),
  classification: z.enum(["VERIFIED_DEFECT", "POTENTIAL_RISK", "DESIGN_CONCERN"]),
  severity: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"]),
  confidence: z.enum(["HIGH", "MEDIUM", "LOW"]),
  userPremise: z
    .string()
    .nullable()
    .describe("null unless the finding rests only on the developer's PROPOSAL/ISSUE description"),
  options: z.array(FixOptionOut).describe("2-3 fix options when a real choice exists"),
  recommendation: z.object({
    optionIndex: z.number().int().nullable().describe("0-based index into options, or null"),
    rationale: z.string(),
  }),
  verification: z.string().describe("concrete steps to confirm the fix worked"),
});
export type FindingOut = z.infer<typeof FindingOut>;

export const PersonaOutput = z.object({
  summary: z.string().describe("2-4 sentences from your specialist view"),
  answer: z.string().nullable(),
  noSignificantIssues: z.boolean(),
  findings: z.array(FindingOut),
  limitations: z.array(z.string()),
});
export type PersonaOutput = z.infer<typeof PersonaOutput>;

export const SynthesisOutput = z.object({
  summary: z.string(),
  answer: z.string().nullable(),
  verdict: z.enum(["GO", "CONDITIONAL_GO", "NO_GO"]).nullable(),
  conditions: z.array(z.string()),
  limitations: z.array(z.string()),
});
export type SynthesisOutput = z.infer<typeof SynthesisOutput>;

export const RecheckOutput = z.object({
  result: z.enum(["RESOLVED", "STILL_PRESENT", "PARTIALLY_RESOLVED", "UNVERIFIABLE"]),
  reasoning: z.string(),
  evidence: z.array(EvidenceOut),
});
export type RecheckOutput = z.infer<typeof RecheckOutput>;

/** Tiny schema used by `npm run ai:check`. */
export const PingOutput = z.object({ ok: z.boolean() });

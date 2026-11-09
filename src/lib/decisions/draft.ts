import type { EvidenceItem, FixOption, Recommendation } from "@/lib/review/types";

/** Client-safe decision draft shapes and the Solution Lab prefill (06 §3, 04 Solution Lab). */

export type DecisionDraftStatus = "PROPOSED" | "ACCEPTED" | "REVERTED";

export type DecisionDraft = {
  title: string;
  context: string;
  chosenOption: string;
  rationale: string;
  alternatives: { title: string; whyNot: string }[];
  constraints: string;
  assumptions: string;
  relatedFiles: string[];
  findingIds: string[];
  status: DecisionDraftStatus;
  commitSha: string | null;
};

export const EMPTY_DRAFT: DecisionDraft = {
  title: "",
  context: "",
  chosenOption: "",
  rationale: "",
  alternatives: [],
  constraints: "",
  assumptions: "",
  relatedFiles: [],
  findingIds: [],
  status: "ACCEPTED",
  commitSha: null,
};

export type DraftSourceFinding = {
  id: string;
  title: string;
  observation: string;
  impact: string;
  options: FixOption[];
  recommendation: Recommendation | null;
  evidence: EvidenceItem[];
  lastSeenSha: string;
};

/**
 * Prefills a decision from a finding and the chosen option: title = finding
 * title, alternatives = the other options with their cons as "why not",
 * related files from evidence, and the finding linked.
 */
export function draftFromFinding(finding: DraftSourceFinding, chosenIndex: number): DecisionDraft {
  const chosen = finding.options[chosenIndex];
  const recommended = finding.recommendation?.optionIndex === chosenIndex ? finding.recommendation.rationale.trim() : "";
  const pros = chosen?.pros.filter(Boolean) ?? [];
  return {
    ...EMPTY_DRAFT,
    title: finding.title,
    context: `${finding.observation}\n\nImpact: ${finding.impact}`.trim(),
    chosenOption: chosen ? [chosen.title, chosen.description].filter(Boolean).join("\n\n") : "",
    rationale: recommended || (pros.length > 0 ? `Chosen for: ${pros.join("; ")}.` : ""),
    alternatives: finding.options
      .filter((_, i) => i !== chosenIndex)
      .map((o) => ({ title: o.title, whyNot: o.cons.join("; ") })),
    relatedFiles: [...new Set(finding.evidence.map((e) => e.path))],
    findingIds: [finding.id],
    commitSha: finding.lastSeenSha,
  };
}

/** Converts a draft into the API body (empty optionals → null). */
export function draftToBody(draft: DecisionDraft) {
  return {
    title: draft.title.trim(),
    context: draft.context.trim(),
    chosenOption: draft.chosenOption.trim(),
    rationale: draft.rationale.trim(),
    alternatives: draft.alternatives
      .map((a) => ({ title: a.title.trim(), whyNot: a.whyNot.trim() }))
      .filter((a) => a.title !== ""),
    constraints: draft.constraints.trim() || null,
    assumptions: draft.assumptions.trim() || null,
    relatedFiles: draft.relatedFiles.map((f) => f.trim()).filter(Boolean),
    findingIds: draft.findingIds,
    status: draft.status,
    commitSha: draft.commitSha,
  };
}

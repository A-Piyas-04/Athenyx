import type { Confidence, Severity } from "@/generated/prisma/enums";
import { personaName } from "@/lib/ai/prompts/personas";
import type { EvidenceItem } from "@/lib/review/types";
import type { ValidatedFinding } from "@/lib/review/validate";

/** Within-run dedupe, sorting and capping (04 §7.3–7.4). */

export const MAX_FINDINGS_PER_RUN = 15;
export const TITLE_SIMILARITY_THRESHOLD = 0.5;

export const SEVERITY_ORDER: Record<Severity, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFO: 4 };
export const CONFIDENCE_ORDER: Record<Confidence, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "of", "in", "on", "for", "to", "with", "without", "by", "from", "at",
  "is", "are", "be", "can", "may", "could", "not", "no", "this", "that", "it", "its", "as", "into",
  "via", "when", "while", "missing", "lack", "lacks", "potential", "possible",
]);

export function titleWords(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 1 && !STOPWORDS.has(w)),
  );
}

/**
 * Share of words in common, relative to the shorter title (so a short title
 * contained in a longer one counts as similar). NOTE: the plan says "share
 * ≥ 50% of words"; the shorter title is used as the denominator.
 */
export function titleSimilarity(a: string, b: string): number {
  const wa = titleWords(a);
  const wb = titleWords(b);
  if (wa.size === 0 || wb.size === 0) return 0;
  let common = 0;
  for (const w of wa) if (wb.has(w)) common += 1;
  return common / Math.min(wa.size, wb.size);
}

export function rangesOverlap(a: Pick<EvidenceItem, "path" | "startLine" | "endLine">, b: typeof a): boolean {
  return a.path === b.path && a.startLine <= b.endLine && b.startLine <= a.endLine;
}

type Comparable = { title: string; evidence: Pick<EvidenceItem, "path" | "startLine" | "endLine">[] };

/**
 * Duplicates share a primary evidence path with overlapping lines AND similar
 * titles (04 §7.3). Findings without evidence are never merged this way.
 */
export function isDuplicate(a: Comparable, b: Comparable): boolean {
  const pa = a.evidence[0];
  const pb = b.evidence[0];
  if (!pa || !pb || !rangesOverlap(pa, pb)) return false;
  return titleSimilarity(a.title, b.title) >= TITLE_SIMILARITY_THRESHOLD;
}

function rank(f: ValidatedFinding): [number, number] {
  return [SEVERITY_ORDER[f.severity], CONFIDENCE_ORDER[f.confidence]];
}

function outranks(a: ValidatedFinding, b: ValidatedFinding): boolean {
  const [sa, ca] = rank(a);
  const [sb, cb] = rank(b);
  return sa < sb || (sa === sb && ca < cb);
}

/** Merges `other` into `kept` (kept has the higher severity). */
function merge(kept: ValidatedFinding, other: ValidatedFinding): ValidatedFinding {
  const evidence = [...kept.evidence];
  for (const item of other.evidence) {
    if (!evidence.some((e) => e.path === item.path && e.startLine === item.startLine && e.endLine === item.endLine)) {
      evidence.push(item);
    }
  }
  const useOtherOptions = other.options.length > kept.options.length;
  const alsoRaisedBy = [...kept.alsoRaisedBy];
  for (const persona of [other.persona, ...other.alsoRaisedBy]) {
    if (persona !== kept.persona && !alsoRaisedBy.includes(persona)) alsoRaisedBy.push(persona);
  }
  return {
    ...kept,
    existingFindingId: kept.existingFindingId ?? other.existingFindingId,
    evidence,
    options: useOtherOptions ? other.options : kept.options,
    recommendation: useOtherOptions ? other.recommendation : kept.recommendation,
    userPremise: kept.userPremise ?? other.userPremise,
    alsoRaisedBy,
  };
}

/** Adds the "(Also raised by: …)" note to the observation. */
export function withAlsoRaisedNote(finding: ValidatedFinding): ValidatedFinding {
  if (finding.alsoRaisedBy.length === 0) return finding;
  const names = finding.alsoRaisedBy.map(personaName).join(", ");
  return { ...finding, observation: `${finding.observation}\n\n(Also raised by: ${names})` };
}

/**
 * Merges duplicates (overlap + title similarity, or the same existing
 * finding id — two findings must not both link to one stored finding).
 */
export function dedupeFindings(findings: ValidatedFinding[]): ValidatedFinding[] {
  const result: ValidatedFinding[] = [];
  for (const finding of findings) {
    const index = result.findIndex(
      (existing) =>
        (finding.existingFindingId !== null && finding.existingFindingId === existing.existingFindingId) ||
        isDuplicate(existing, finding),
    );
    if (index === -1) {
      result.push(finding);
      continue;
    }
    const existing = result[index];
    result[index] = outranks(finding, existing) ? merge(finding, existing) : merge(existing, finding);
  }
  return result.map(withAlsoRaisedNote);
}

/** Sorts by severity then confidence and keeps the top {@link MAX_FINDINGS_PER_RUN}. */
export function sortAndCap(
  findings: ValidatedFinding[],
  max = MAX_FINDINGS_PER_RUN,
): { kept: ValidatedFinding[]; omitted: number } {
  const sorted = [...findings].sort((a, b) => {
    const [sa, ca] = rank(a);
    const [sb, cb] = rank(b);
    return sa - sb || ca - cb;
  });
  return { kept: sorted.slice(0, max), omitted: Math.max(0, sorted.length - max) };
}

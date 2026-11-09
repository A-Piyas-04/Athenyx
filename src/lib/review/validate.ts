import type { Classification, Confidence, ReviewType, Severity } from "@/generated/prisma/enums";
import type { EvidenceOut, FindingOut } from "@/lib/ai/schemas";
import type { IncludedFile } from "@/lib/repo/context";
import { normalizeRepoPath } from "@/lib/repo/filters";
import type { EvidenceItem, FixOption, Recommendation } from "@/lib/review/types";

/**
 * The deterministic "Evidence Arbiter" (04 §7). The model's text is never
 * trusted for paths, line numbers or ids: every citation is checked against
 * the exact snapshot lines the model was shown, and the stored snippet is
 * copied from the snapshot, not from the model.
 */

export const MAX_EVIDENCE_SPAN = 30; // endLine - startLine <= 29
export const REANCHOR_WINDOW = 10;
export const MAX_FINDINGS_PER_PERSONA = 4;
export const MAX_TITLE_CHARS = 100;
const MAX_TEXT_CHARS = 4000;
const MAX_OPTIONS = 3;
const MAX_LIST_ITEMS = 6;
/** Quotes shorter than this (after whitespace normalisation) prove nothing ("}" matches anywhere). */
const MIN_QUOTE_CHARS = 4;

/** Review types whose findings may rest on the developer's own description (04 §7.2). */
export const PREMISE_TYPES: ReadonlySet<ReviewType> = new Set<ReviewType>(["PROPOSAL", "ISSUE"]);

export type ValidatedFinding = {
  persona: string;
  model: string | null;
  existingFindingId: string | null;
  title: string;
  observation: string;
  impact: string;
  classification: Classification;
  severity: Severity;
  confidence: Confidence;
  evidence: EvidenceItem[];
  userPremise: string | null;
  options: FixOption[];
  recommendation: Recommendation | null;
  verification: string;
  /** Personas whose duplicate findings were merged into this one. */
  alsoRaisedBy: string[];
};

export type ValidationContext = {
  reviewType: ReviewType;
  commitSha: string;
  /** Files exactly as included in the context (redacted lines the model saw). */
  files: ReadonlyMap<string, IncludedFile>;
  /** Ids listed in `<prior_findings>` for this run. */
  priorFindingIds: ReadonlySet<string>;
};

export type ValidationStats = { unsupportedRemoved: number; evidenceDropped: number };

// ---------------------------------------------------------------------------
// Evidence
// ---------------------------------------------------------------------------

/** Collapses whitespace so formatting differences don't break a match. */
export function normalizeCode(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Undoes what the context rendering adds: "12| " line prefixes, and the
 * `<\/` escaping of closing tags (so JSX like `</div>` can match).
 */
export function cleanQuote(quote: string): string {
  return quote
    .replace(/\r\n?/g, "\n")
    .replaceAll("<\\/", "</")
    .split("\n")
    .map((line) => line.replace(/^\s*\d+\|\s?/, ""))
    .join("\n")
    .trim();
}

/** A quote copied from a unified diff: strip the leading +/-/space of every line. */
function stripDiffMarkers(quote: string): string | null {
  const lines = quote.split("\n");
  if (!lines.every((l) => /^[+\- ]/.test(l) || l === "")) return null;
  return lines.map((l) => l.slice(1)).join("\n");
}

export function cleanPath(raw: string): string {
  return normalizeRepoPath(raw.trim().replace(/^\/+/, ""));
}

/**
 * Finds the line range holding `quote`: first the cited range, then windows
 * re-anchored within ±10 lines of the cited start (nearest first).
 * Returns null when the quote is not found.
 */
export function locateQuote(
  lines: readonly string[],
  startLine: number,
  endLine: number,
  quote: string,
): { startLine: number; endLine: number } | null {
  const cleaned = cleanQuote(quote);
  const found = locateCleaned(lines, startLine, endLine, cleaned);
  if (found) return found;
  const fromDiff = stripDiffMarkers(cleaned);
  return fromDiff ? locateCleaned(lines, startLine, endLine, fromDiff.trim()) : null;
}

function locateCleaned(
  lines: readonly string[],
  startLine: number,
  endLine: number,
  cleaned: string,
): { startLine: number; endLine: number } | null {
  const needle = normalizeCode(cleaned);
  if (needle.length < MIN_QUOTE_CHARS || lines.length === 0) return null;

  const matches = (s: number, e: number) =>
    s >= 1 && e <= lines.length && s <= e && normalizeCode(lines.slice(s - 1, e).join("\n")).includes(needle);

  const lo = Math.min(startLine, endLine);
  const hi = Math.max(startLine, endLine);
  const s0 = Math.max(1, lo);
  const e0 = Math.min(lines.length, hi);
  if (matches(s0, e0)) return narrow(lines, s0, e0, needle);

  const span = Math.max(1, cleaned.split("\n").length);
  for (let distance = 0; distance <= REANCHOR_WINDOW; distance += 1) {
    for (const s of distance === 0 ? [lo] : [lo - distance, lo + distance]) {
      for (const e of [s + span - 1, s + span]) {
        if (matches(s, e)) return narrow(lines, s, e, needle);
      }
    }
  }

  // NOTE: beyond the plan's ±10 lines — small models often misnumber long
  // files. The exact quote is still the proof; it must occur exactly once.
  let hit: { startLine: number; endLine: number } | null = null;
  for (let s = 1; s + span - 1 <= lines.length; s += 1) {
    if (!matches(s, s + span - 1)) continue;
    const found = narrow(lines, s, s + span - 1, needle);
    if (hit && hit.startLine !== found.startLine) return null; // ambiguous
    hit = found;
    s = found.endLine; // skip overlapping windows of the same match
  }
  return hit;
}

/** Shrinks a matching window to the smallest sub-range that still contains the quote. */
function narrow(lines: readonly string[], s: number, e: number, needle: string) {
  const has = (a: number, b: number) => normalizeCode(lines.slice(a - 1, b).join("\n")).includes(needle);
  let start = s;
  let end = e;
  while (start < end && has(start + 1, end)) start += 1;
  while (end > start && has(start, end - 1)) end -= 1;
  return { startLine: start, endLine: end };
}

/**
 * Validates evidence items: the path must have been included in the context,
 * the quote must match (or re-anchor near) the cited lines, the span is
 * capped at 30 lines, and the snippet is replaced with the real lines.
 */
export function validateEvidence(
  items: EvidenceOut[],
  ctx: Pick<ValidationContext, "files" | "commitSha">,
): { evidence: EvidenceItem[]; dropped: number } {
  const evidence: EvidenceItem[] = [];
  const seen = new Set<string>();
  let dropped = 0;

  for (const item of items) {
    const path = cleanPath(item.path);
    const file = ctx.files.get(path);
    const located = file ? locateQuote(file.lines, item.startLine, item.endLine, item.quote) : null;
    if (!file || !located) {
      dropped += 1;
      continue;
    }
    const startLine = located.startLine;
    const endLine = Math.min(located.endLine, startLine + MAX_EVIDENCE_SPAN - 1);
    const key = `${path}:${startLine}-${endLine}`;
    if (seen.has(key)) continue;
    seen.add(key);
    evidence.push({
      path,
      startLine,
      endLine,
      symbol: item.symbol?.trim() ? item.symbol.trim().slice(0, 200) : null,
      snippet: file.lines.slice(startLine - 1, endLine).join("\n"),
      commitSha: ctx.commitSha,
    });
  }
  return { evidence, dropped };
}

// ---------------------------------------------------------------------------
// Findings
// ---------------------------------------------------------------------------

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);
const cleanText = (text: string | null | undefined, max = MAX_TEXT_CHARS) => clip((text ?? "").trim(), max);
const cleanList = (items: string[]) =>
  items.map((s) => cleanText(s, 500)).filter((s) => s !== "").slice(0, MAX_LIST_ITEMS);

const CONFIDENCE_RANK: Record<Confidence, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

function capConfidence(value: Confidence, max: Confidence): Confidence {
  return CONFIDENCE_RANK[value] < CONFIDENCE_RANK[max] ? max : value;
}

/**
 * Applies every finding-level rule of 04 §7.2 to one persona's output.
 * Only the first {@link MAX_FINDINGS_PER_PERSONA} findings are considered.
 */
export function validatePersonaFindings(
  persona: string,
  model: string | null,
  findings: FindingOut[],
  ctx: ValidationContext,
): { findings: ValidatedFinding[] } & ValidationStats {
  const out: ValidatedFinding[] = [];
  let unsupportedRemoved = 0;
  let evidenceDropped = 0;

  for (const raw of findings.slice(0, MAX_FINDINGS_PER_PERSONA)) {
    const { evidence, dropped } = validateEvidence(raw.evidence, ctx);
    evidenceDropped += dropped;

    const userPremise = raw.userPremise?.trim() ? cleanText(raw.userPremise, 2000) : null;
    const premiseAllowed = PREMISE_TYPES.has(ctx.reviewType) && userPremise !== null;

    if (evidence.length === 0 && !premiseAllowed) {
      unsupportedRemoved += 1;
      continue;
    }

    let classification: Classification = raw.classification;
    let confidence: Confidence = raw.confidence;
    let severity: Severity = raw.severity;

    if (evidence.length === 0) {
      // Rests only on the developer's description: never a verified defect.
      if (classification === "VERIFIED_DEFECT") {
        // NOTE: a proposal is not built yet, so its concerns are design concerns.
        classification = ctx.reviewType === "PROPOSAL" ? "DESIGN_CONCERN" : "POTENTIAL_RISK";
      }
      confidence = capConfidence(confidence, "MEDIUM");
    }
    if (classification === "VERIFIED_DEFECT" && !(evidence.length > 0 && confidence === "HIGH")) {
      classification = "POTENTIAL_RISK";
    }
    if (severity === "CRITICAL" && confidence === "LOW") severity = "HIGH";

    // Keep each option's original index so the recommendation still points at the same option.
    const kept = raw.options
      .map((o, originalIndex) => ({ o, originalIndex }))
      .filter(({ o }) => o.title.trim() !== "")
      .slice(0, MAX_OPTIONS);
    const options: FixOption[] = kept.map(({ o }) => ({
        title: cleanText(o.title, 200),
        description: cleanText(o.description, 2000),
        pros: cleanList(o.pros),
        cons: cleanList(o.cons),
        effort: o.effort,
      }));

    const index = raw.recommendation.optionIndex;
    const mapped = index === null ? -1 : kept.findIndex((k) => k.originalIndex === index);
    const optionIndex = mapped >= 0 ? mapped : null;
    const rationale = cleanText(raw.recommendation.rationale, 2000);
    const recommendation = optionIndex === null && rationale === "" ? null : { optionIndex, rationale };

    const existing = raw.existingFindingId?.trim() ?? null;

    out.push({
      persona,
      model,
      existingFindingId: existing && ctx.priorFindingIds.has(existing) ? existing : null,
      title: cleanText(raw.title, MAX_TITLE_CHARS) || "Untitled finding",
      observation: cleanText(raw.observation),
      impact: cleanText(raw.impact),
      classification,
      severity,
      confidence,
      evidence,
      userPremise,
      options,
      recommendation,
      verification: cleanText(raw.verification),
      alsoRaisedBy: [],
    });
  }

  return { findings: out, unsupportedRemoved, evidenceDropped };
}

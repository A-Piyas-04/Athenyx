import type { Classification, ReleaseVerdict, Severity } from "@/generated/prisma/enums";
import type { PersonaKey } from "@/lib/ai/schemas";
import type { CiEvidence } from "@/lib/github/repo";
import type { ProjectMap } from "@/lib/repo/mapper";

/**
 * RELEASE runs (04 §10): fixed persona selection, deterministic context focus
 * and evidence, and verdict caps that always override the AI's verdict.
 */

export type ReleaseFinding = {
  id: string;
  title: string;
  persona: string;
  severity: Severity;
  classification: Classification;
};

export type ReleaseReport = {
  conditions: string[];
  blockingFindingIds: string[];
  ciEvidence: CiEvidence;
  testsPresent: boolean;
  acceptedRisks: number;
  limitations: string[];
};

export const RELEASE_DISCLAIMER = "Advisory only. Athenyx may miss defects. You decide whether to ship.";

/** Stack labels that mean authentication or payments are involved. */
const SENSITIVE_STACK = new Set(["nextauth", "authjs", "clerk", "stripe", "supabase", "firebase"]);

/** Always devops + quality; security when open serious security findings exist or auth/payment deps are used. */
export function selectReleasePersonas(map: ProjectMap, open: ReleaseFinding[], max: number): PersonaKey[] {
  const personas: PersonaKey[] = ["devops", "quality"];
  const seriousSecurity = open.some(
    (f) => f.persona === "security" && (f.severity === "HIGH" || f.severity === "CRITICAL"),
  );
  if (seriousSecurity || map.stack.some((s) => SENSITIVE_STACK.has(s))) personas.push("security");
  return personas.slice(0, Math.max(1, max));
}

const MIGRATION_RE = /(^|\/)(prisma\/migrations|migrations|drizzle|db\/migrate)\//;
const MAX_MIGRATIONS = 10;
const MAX_ENTRY_POINTS = 15;

/**
 * Release context focus (04 §10.3): configs, CI files, recent migrations and
 * entry points — chosen in code, so no planner call is spent on it.
 */
export function releaseContextFiles(map: ProjectMap, fileSet: ReadonlySet<string>): { files: string[]; keywords: string[] } {
  const migrations = map.tree
    .map((f) => f.path)
    .filter((p) => MIGRATION_RE.test(p))
    .sort()
    .slice(-MAX_MIGRATIONS); // newest last by timestamped names
  const files = [
    ...map.ciFiles,
    ...map.configFiles,
    ...migrations.reverse(),
    ...map.entryPoints.slice(0, MAX_ENTRY_POINTS),
  ].filter((p, i, all) => fileSet.has(p) && all.indexOf(p) === i);
  return { files, keywords: ["process.env"] };
}

export function ciSummary(ci: CiEvidence): string {
  if (ci.unavailable) return "CI results: unavailable (missing permission or no access).";
  if (ci.combinedStatus === "none") return "CI results: none reported for this commit.";
  const failing = ci.checks.filter((c) => c.conclusion && !["success", "neutral", "skipped"].includes(c.conclusion));
  return [
    `CI results: ${ci.combinedStatus} (${ci.checks.length} checks)`,
    ...failing.slice(0, 10).map((c) => `- ${c.name}: ${c.conclusion}`),
  ].join("\n");
}

/** Deterministic evidence for the synthesis prompt (no code). */
export function renderReleaseEvidence(input: {
  ci: CiEvidence;
  testFiles: string[];
  ciFiles: string[];
  open: ReleaseFinding[];
  acceptedRisks: number;
}): string {
  const bySeverity = (s: Severity) => input.open.filter((f) => f.severity === s).length;
  const serious = input.open.filter((f) => f.severity === "CRITICAL" || f.severity === "HIGH").slice(0, 15);
  return [
    ciSummary(input.ci),
    `Test files: ${input.testFiles.length}${input.testFiles.length === 0 ? " (none found)" : ""}`,
    `CI config files: ${input.ciFiles.length > 0 ? input.ciFiles.join(", ") : "(none)"}`,
    `Open findings: critical ${bySeverity("CRITICAL")}, high ${bySeverity("HIGH")}, medium ${bySeverity("MEDIUM")}, low ${bySeverity("LOW")}`,
    `Accepted risks: ${input.acceptedRisks}`,
    ...(serious.length > 0
      ? ["Open critical/high findings:", ...serious.map((f) => `- [${f.severity}] [${f.classification}] ${f.title}`)]
      : []),
  ].join("\n");
}

const RANK: Record<ReleaseVerdict, number> = { NO_GO: 0, CONDITIONAL_GO: 1, GO: 2 };
const atMost = (verdict: ReleaseVerdict, cap: ReleaseVerdict): ReleaseVerdict => (RANK[verdict] > RANK[cap] ? cap : verdict);

/**
 * Verdict caps (04 §10.5) — code wins over the AI:
 * - open CRITICAL, or open HIGH VERIFIED_DEFECT → NO_GO
 * - open HIGH, failing CI, or no test files → at most CONDITIONAL_GO
 */
export function applyVerdictCaps(input: {
  verdict: ReleaseVerdict | null;
  open: ReleaseFinding[];
  ci: CiEvidence;
  hasTests: boolean;
}): { verdict: ReleaseVerdict; blockingFindingIds: string[]; conditions: string[]; limitations: string[] } {
  const limitations: string[] = [];
  const conditions: string[] = [];
  let verdict: ReleaseVerdict = input.verdict ?? "CONDITIONAL_GO";
  if (input.verdict === null) limitations.push("The AI gave no verdict; Athenyx defaulted to Conditional Go.");

  const critical = input.open.filter((f) => f.severity === "CRITICAL");
  const highDefects = input.open.filter((f) => f.severity === "HIGH" && f.classification === "VERIFIED_DEFECT");
  const high = input.open.filter((f) => f.severity === "HIGH");

  if (critical.length > 0 || highDefects.length > 0) verdict = "NO_GO";
  if (high.length > 0) verdict = atMost(verdict, "CONDITIONAL_GO");

  const ciFailing = !input.ci.unavailable && input.ci.combinedStatus === "failure";
  if (ciFailing) {
    verdict = atMost(verdict, "CONDITIONAL_GO");
    const failing = input.ci.unavailable
      ? []
      : input.ci.checks.filter((c) => c.conclusion && !["success", "neutral", "skipped"].includes(c.conclusion)).map((c) => c.name);
    conditions.push(`Fix the failing CI checks${failing.length > 0 ? `: ${failing.slice(0, 5).join(", ")}` : ""}.`);
  }
  if (input.ci.unavailable || input.ci.combinedStatus === "none") {
    limitations.push("No CI results available for this commit.");
  }
  if (!input.hasTests) {
    verdict = atMost(verdict, "CONDITIONAL_GO");
    conditions.push("Add automated tests for the critical paths — no test files were found.");
  }

  const blocking = [...critical, ...high.filter((f) => !critical.includes(f))];
  for (const f of blocking.slice(0, 10)) conditions.push(`Resolve or explicitly accept: ${f.title}`);

  return { verdict, blockingFindingIds: blocking.map((f) => f.id), conditions, limitations };
}

/** Reads a stored `releaseReport` defensively (display only). */
export function readReleaseReport(value: unknown): ReleaseReport | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Partial<ReleaseReport>;
  const strings = (x: unknown) => (Array.isArray(x) ? x.filter((s): s is string => typeof s === "string") : []);
  const ci = v.ciEvidence && typeof v.ciEvidence === "object" ? (v.ciEvidence as CiEvidence) : ({ unavailable: true } as CiEvidence);
  return {
    conditions: strings(v.conditions),
    blockingFindingIds: strings(v.blockingFindingIds),
    ciEvidence: ci,
    testsPresent: v.testsPresent === true,
    acceptedRisks: typeof v.acceptedRisks === "number" ? v.acceptedRisks : 0,
    limitations: strings(v.limitations),
  };
}

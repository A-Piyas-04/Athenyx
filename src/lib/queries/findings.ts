import type { Finding, Prisma } from "@/generated/prisma/client";
import {
  CheckResult,
  Classification,
  FindingStatus,
  Severity,
  type Confidence,
} from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import {
  EvidenceItemSchema,
  FixOptionSchema,
  readJsonArray,
  RecommendationSchema,
  type EvidenceItem,
  type FixOption,
  type Recommendation,
} from "@/lib/review/types";

/** DB reads for Risk Center, finding detail and Solution Lab. Always project-scoped. */

export type FindingView = {
  id: string;
  title: string;
  persona: string;
  model: string | null;
  severity: Severity;
  classification: Classification;
  confidence: Confidence;
  status: FindingStatus;
  statusNote: string | null;
  observation: string;
  impact: string;
  userPremise: string | null;
  evidence: EvidenceItem[];
  options: FixOption[];
  recommendation: Recommendation | null;
  verification: string;
  chosenOptionIndex: number | null;
  firstSeenRunId: string;
  lastSeenRunId: string;
  lastSeenSha: string;
  createdAt: Date;
  updatedAt: Date;
};

export function toFindingView(row: Finding): FindingView {
  return {
    id: row.id,
    title: row.title,
    persona: row.persona,
    model: row.model,
    severity: row.severity,
    classification: row.classification,
    confidence: row.confidence,
    status: row.status,
    statusNote: row.statusNote,
    observation: row.observation,
    impact: row.impact,
    userPremise: row.userPremise,
    evidence: readJsonArray(row.evidence, EvidenceItemSchema),
    options: readJsonArray(row.options, FixOptionSchema),
    recommendation: RecommendationSchema.safeParse(row.recommendation).data ?? null,
    verification: row.verification,
    chosenOptionIndex: row.chosenOptionIndex,
    firstSeenRunId: row.firstSeenRunId,
    lastSeenRunId: row.lastSeenRunId,
    lastSeenSha: row.lastSeenSha,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// Risk Center filters (URL searchParams, 07)
// ---------------------------------------------------------------------------

export const DEFAULT_STATUSES: FindingStatus[] = ["OPEN", "IN_PROGRESS"];

export type FindingFilters = {
  statuses: FindingStatus[];
  severities: Severity[];
  persona: string | null;
  classification: Classification | null;
  q: string;
};

type Params = Record<string, string | string[] | undefined>;

function list(value: string | string[] | undefined): string[] {
  const raw = Array.isArray(value) ? value : value ? [value] : [];
  return raw.flatMap((v) => v.split(",")).map((v) => v.trim()).filter(Boolean);
}

function pick<T extends string>(values: string[], allowed: readonly T[]): T[] {
  return [...new Set(values.filter((v): v is T => (allowed as readonly string[]).includes(v)))];
}

/** Parses Risk Center filters. No status selected → Open + In progress (06). */
export function parseFindingFilters(params: Params): FindingFilters {
  const statuses = pick(list(params.status), Object.values(FindingStatus));
  const classification = pick(list(params.classification), Object.values(Classification))[0] ?? null;
  const persona = list(params.persona)[0] ?? null;
  const q = (Array.isArray(params.q) ? params.q[0] : params.q)?.trim().slice(0, 200) ?? "";
  return {
    statuses: statuses.length > 0 ? statuses : DEFAULT_STATUSES,
    severities: pick(list(params.severity), Object.values(Severity)),
    persona: persona && /^[a-z_]{1,40}$/.test(persona) ? persona : null,
    classification,
    q,
  };
}

export const MAX_LISTED_FINDINGS = 200;

export async function listFindings(projectId: string, filters: FindingFilters): Promise<FindingView[]> {
  const where: Prisma.FindingWhereInput = {
    projectId,
    status: { in: filters.statuses },
    ...(filters.severities.length > 0 ? { severity: { in: filters.severities } } : {}),
    ...(filters.persona ? { persona: filters.persona } : {}),
    ...(filters.classification ? { classification: filters.classification } : {}),
    ...(filters.q
      ? {
          OR: [
            { title: { contains: filters.q, mode: "insensitive" } },
            { observation: { contains: filters.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const rows = await db.finding.findMany({
    where,
    // Enum order in PostgreSQL is declaration order: CRITICAL first.
    orderBy: [{ severity: "asc" }, { updatedAt: "desc" }],
    take: MAX_LISTED_FINDINGS,
  });
  return rows.map(toFindingView);
}

export function countFindings(projectId: string): Promise<number> {
  return db.finding.count({ where: { projectId } });
}

/** Personas that have raised findings in this project (for the filter). */
export async function findingPersonas(projectId: string): Promise<string[]> {
  const rows = await db.finding.findMany({ where: { projectId }, distinct: ["persona"], select: { persona: true } });
  return rows.map((r) => r.persona).sort();
}

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------

export type CheckView = {
  id: string;
  runId: string;
  commitSha: string;
  result: CheckResult;
  reasoning: string;
  evidence: EvidenceItem[];
  createdAt: Date;
};

export async function getFindingDetail(projectId: string, findingId: string) {
  const row = await db.finding.findFirst({
    where: { id: findingId, projectId },
    include: {
      firstSeenRun: { select: { id: true, commitSha: true, type: true, createdAt: true } },
      checks: { orderBy: { createdAt: "desc" } },
      decisionLinks: {
        include: { decision: { select: { id: true, title: true, status: true, createdAt: true, commitSha: true } } },
      },
    },
  });
  if (!row) return null;
  return {
    finding: toFindingView(row),
    firstSeenRun: row.firstSeenRun,
    checks: row.checks.map(
      (c): CheckView => ({
        id: c.id,
        runId: c.runId,
        commitSha: c.commitSha,
        result: c.result,
        reasoning: c.reasoning,
        evidence: readJsonArray(c.evidence, EvidenceItemSchema),
        createdAt: c.createdAt,
      }),
    ),
    decisions: row.decisionLinks
      .map((l) => l.decision)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
  };
}

/** The run currently re-checking this finding, if any (so the detail page can keep polling). */
export async function activeRecheckFor(projectId: string, findingId: string): Promise<string | null> {
  const runs = await db.reviewRun.findMany({
    where: { projectId, type: "RECHECK", status: { in: ["QUEUED", "RUNNING"] } },
    select: { id: true, input: true },
  });
  const match = runs.find((r) => {
    const ids = (r.input as { targetFindingIds?: unknown } | null)?.targetFindingIds;
    return Array.isArray(ids) && ids.includes(findingId);
  });
  return match?.id ?? null;
}

/** Open findings for the Solution Lab picker. */
export async function solutionCandidates(projectId: string) {
  const rows = await db.finding.findMany({
    where: { projectId, status: { in: ["OPEN", "IN_PROGRESS"] } },
    orderBy: [{ severity: "asc" }, { updatedAt: "desc" }],
    select: { id: true, title: true, severity: true, status: true, persona: true, options: true },
    take: MAX_LISTED_FINDINGS,
  });
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    severity: r.severity,
    status: r.status,
    persona: r.persona,
    optionCount: readJsonArray(r.options, FixOptionSchema).length,
  }));
}

/** All findings of a project, for the decision form's link picker. */
export async function findingLinkOptions(projectId: string) {
  return db.finding.findMany({
    where: { projectId },
    orderBy: [{ status: "asc" }, { severity: "asc" }, { updatedAt: "desc" }],
    select: { id: true, title: true, severity: true, status: true },
    take: MAX_LISTED_FINDINGS,
  });
}

import type { Classification, Confidence, FindingStatus, Severity } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import {
  EvidenceItemSchema,
  FixOptionSchema,
  readJsonArray,
  RecommendationSchema,
} from "@/lib/review/types";

/** DB reads for Review Lab pages (no AI, no GitHub calls). Always scoped to the owner. */

export async function getRecentRuns(projectId: string, limit = 20) {
  return db.reviewRun.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      type: true,
      status: true,
      commitSha: true,
      branch: true,
      createdAt: true,
      startedAt: true,
      finishedAt: true,
      degraded: true,
    },
  });
}

/** The project's QUEUED/RUNNING run, if any (only one may be active). */
export async function getActiveRun(projectId: string) {
  return db.reviewRun.findFirst({
    where: { projectId, status: { in: ["QUEUED", "RUNNING"] } },
    select: { id: true, type: true },
  });
}

export type RecentRun = Awaited<ReturnType<typeof getRecentRuns>>[number];

/** A run of the given project, or null (the page renders 404). */
export async function getProjectRun(projectId: string, runId: string) {
  return db.reviewRun.findFirst({ where: { id: runId, projectId } });
}

const SEVERITY_RANK: Record<Severity, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFO: 4 };
const CONFIDENCE_RANK: Record<Confidence, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

/**
 * Findings reported by a run: those it created plus earlier findings it saw
 * again (linked). Sorted by severity, then confidence.
 */
export async function getRunFindings(projectId: string, runId: string) {
  const rows = await db.finding.findMany({
    where: { projectId, OR: [{ firstSeenRunId: runId }, { lastSeenRunId: runId }] },
  });
  return rows
    .map((row) => ({
      id: row.id,
      title: row.title,
      persona: row.persona,
      model: row.model,
      severity: row.severity as Severity,
      classification: row.classification as Classification,
      confidence: row.confidence as Confidence,
      status: row.status as FindingStatus,
      observation: row.observation,
      impact: row.impact,
      userPremise: row.userPremise,
      evidence: readJsonArray(row.evidence, EvidenceItemSchema),
      options: readJsonArray(row.options, FixOptionSchema),
      recommendation: RecommendationSchema.safeParse(row.recommendation).data ?? null,
      verification: row.verification,
      lastSeenSha: row.lastSeenSha,
      seenBefore: row.firstSeenRunId !== runId,
    }))
    .sort(
      (a, b) =>
        SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
        CONFIDENCE_RANK[a.confidence] - CONFIDENCE_RANK[b.confidence],
    );
}

/** Checks written by a RECHECK run, with their finding titles. */
export async function getRunChecks(projectId: string, runId: string) {
  const rows = await db.findingCheck.findMany({
    where: { runId, finding: { projectId } },
    orderBy: { createdAt: "asc" },
    include: { finding: { select: { id: true, title: true, severity: true, status: true, persona: true } } },
  });
  return rows.map((row) => ({
    id: row.id,
    result: row.result,
    reasoning: row.reasoning,
    commitSha: row.commitSha,
    evidence: readJsonArray(row.evidence, EvidenceItemSchema),
    finding: row.finding,
  }));
}

export type RunCheck = Awaited<ReturnType<typeof getRunChecks>>[number];

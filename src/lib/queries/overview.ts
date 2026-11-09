import type { Severity } from "@/generated/prisma/enums";
import { db } from "@/lib/db";

/** Overview reads (06 §3): DB only — no AI, no GitHub calls on load. */

export async function healthCounts(projectId: string) {
  const [bySeverity, byStatus] = await Promise.all([
    db.finding.groupBy({
      by: ["severity"],
      where: { projectId, status: { in: ["OPEN", "IN_PROGRESS"] } },
      _count: { _all: true },
    }),
    db.finding.groupBy({ by: ["status"], where: { projectId }, _count: { _all: true } }),
  ]);
  const open = Object.fromEntries(bySeverity.map((r) => [r.severity, r._count._all])) as Partial<Record<Severity, number>>;
  const status = Object.fromEntries(byStatus.map((r) => [r.status, r._count._all])) as Record<string, number | undefined>;
  return {
    open,
    totalOpen: bySeverity.reduce((sum, r) => sum + r._count._all, 0),
    acceptedRisks: status.ACCEPTED_RISK ?? 0,
    resolved: status.RESOLVED ?? 0,
  };
}

export async function topOpenRisks(projectId: string, take = 5) {
  return db.finding.findMany({
    where: { projectId, status: { in: ["OPEN", "IN_PROGRESS"] } },
    orderBy: [{ severity: "asc" }, { confidence: "asc" }, { updatedAt: "desc" }],
    take,
    select: { id: true, title: true, severity: true, classification: true, status: true, lastSeenSha: true },
  });
}

const SEVERITY_RANK: Record<Severity, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFO: 4 };

/** Files cited (primary evidence) by the most open findings, with their worst severity. */
export async function riskHotspots(projectId: string, take = 5) {
  const rows = await db.finding.findMany({
    where: { projectId, status: { in: ["OPEN", "IN_PROGRESS"] } },
    select: { evidence: true, severity: true },
    take: 500,
  });
  const byFile = new Map<string, { path: string; count: number; worst: Severity }>();
  for (const row of rows) {
    const first = Array.isArray(row.evidence) ? (row.evidence[0] as { path?: unknown } | undefined) : undefined;
    const path = typeof first?.path === "string" ? first.path : null;
    if (!path) continue;
    const entry = byFile.get(path) ?? { path, count: 0, worst: row.severity };
    entry.count += 1;
    if (SEVERITY_RANK[row.severity] < SEVERITY_RANK[entry.worst]) entry.worst = row.severity;
    byFile.set(path, entry);
  }
  return [...byFile.values()]
    .sort((a, b) => b.count - a.count || SEVERITY_RANK[a.worst] - SEVERITY_RANK[b.worst])
    .slice(0, take);
}

/** Open findings per specialist, for the Overview board strip. */
export async function openByPersona(projectId: string): Promise<Record<string, { total: number; serious: number }>> {
  const rows = await db.finding.groupBy({
    by: ["persona", "severity"],
    where: { projectId, status: { in: ["OPEN", "IN_PROGRESS"] } },
    _count: { _all: true },
  });
  const out: Record<string, { total: number; serious: number }> = {};
  for (const row of rows) {
    const entry = (out[row.persona] ??= { total: 0, serious: 0 });
    entry.total += row._count._all;
    if (row.severity === "CRITICAL" || row.severity === "HIGH") entry.serious += row._count._all;
  }
  return out;
}

/** The latest completed review (re-checks and release checks have their own places). */
export async function lastReview(projectId: string) {
  return db.reviewRun.findFirst({
    where: { projectId, status: "COMPLETED", type: { notIn: ["RECHECK", "RELEASE"] } },
    orderBy: { finishedAt: "desc" },
    select: { id: true, type: true, commitSha: true, branch: true, finishedAt: true, summary: true },
  });
}

export async function latestVerdict(projectId: string) {
  return db.reviewRun.findFirst({
    where: { projectId, type: "RELEASE", status: "COMPLETED", verdict: { not: null } },
    orderBy: { finishedAt: "desc" },
    select: { id: true, verdict: true, commitSha: true, branch: true, finishedAt: true },
  });
}

/**
 * True when the most recent finished run failed because GitHub access was
 * lost (03 §4). NOTE: derived from runs instead of a new DB column.
 */
export async function lastRunLostAccess(projectId: string, message: string): Promise<boolean> {
  const run = await db.reviewRun.findFirst({
    where: { projectId, status: { in: ["COMPLETED", "FAILED"] } },
    orderBy: { createdAt: "desc" },
    select: { status: true, error: true },
  });
  return run?.status === "FAILED" && run.error === message;
}

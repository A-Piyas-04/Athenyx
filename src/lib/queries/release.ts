import { db } from "@/lib/db";
import { readReleaseReport } from "@/lib/review/release";

/** DB reads for Release Gate (no AI, no GitHub calls on load). */

export async function releaseHistory(projectId: string, take = 20) {
  return db.reviewRun.findMany({
    where: { projectId, type: "RELEASE" },
    orderBy: { createdAt: "desc" },
    take,
    select: { id: true, status: true, verdict: true, branch: true, commitSha: true, createdAt: true, finishedAt: true },
  });
}

/** A completed RELEASE run with its parsed report and blocking findings. */
export async function releaseAssessment(projectId: string, runId?: string) {
  const run = await db.reviewRun.findFirst({
    where: { projectId, type: "RELEASE", status: "COMPLETED", verdict: { not: null }, ...(runId ? { id: runId } : {}) },
    orderBy: { createdAt: "desc" },
  });
  if (!run || !run.verdict) return null;
  const report = readReleaseReport(run.releaseReport);
  if (!report) return null;
  const blocking = await db.finding.findMany({
    where: { projectId, id: { in: report.blockingFindingIds } },
    select: { id: true, title: true, severity: true },
  });
  const order = new Map(report.blockingFindingIds.map((id, i) => [id, i]));
  blocking.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  return { run, verdict: run.verdict, report, blocking };
}

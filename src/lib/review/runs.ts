import type { Prisma, Project, ReviewRun } from "@/generated/prisma/client";
import { ApiError, conflict } from "@/lib/api";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { isAccessLost } from "@/lib/github/errors";
import { branchExists } from "@/lib/github/repo";
import { countRecentRuns, dailyLimitMessage } from "@/lib/limits";
import { z } from "zod";
import { MAX_RECHECK_FINDINGS } from "@/lib/review/recheck";
import { parseRunInput, type CreateRunBody, type RunInput } from "@/lib/review/types";

/**
 * Enqueueing a review (07 "Create run"). This is one of only two code paths
 * that can lead to AI calls, and only because the user pressed a button.
 * The run is just a QUEUED row; the worker picks it up.
 */

export const ACTIVE_RUN_MESSAGE = "A review is already running for this project.";
export const NO_BASELINE_MESSAGE = "No previous review baseline. Run a Project Health review first.";

export async function enqueueRun(userId: string, project: Project, body: CreateRunBody): Promise<ReviewRun> {
  const parsed = parseRunInput(body.type, body.input);
  if (!parsed.ok) throw new ApiError(400, "validation_error", parsed.message, parsed.details);
  const input = parsed.input;

  if (body.type === "LATEST_CHANGES" && !input.baseSha && !project.lastReviewedSha) {
    throw conflict(NO_BASELINE_MESSAGE);
  }

  // Review Lab always reviews the selected branch; only Release Gate may assess another branch.
  let branch = project.selectedBranch;
  if (body.type === "RELEASE" && body.branch && body.branch !== project.selectedBranch) {
    let exists: boolean;
    try {
      exists = await branchExists(
        { installationId: project.installationId, repoOwner: project.repoOwner, repoName: project.repoName },
        body.branch,
      );
    } catch (error) {
      if (isAccessLost(error)) throw new ApiError(403, "github_access_lost", error.message);
      throw error;
    }
    if (!exists) throw new ApiError(400, "validation_error", `Branch "${body.branch}" does not exist.`);
    branch = body.branch;
  }
  return createRunLocked(userId, project, body.type, branch, input);
}

/**
 * Creates a QUEUED run, enforcing one active run per project and the daily
 * limit. A per-project advisory lock makes the check race-free when two
 * requests arrive at once.
 */
async function createRunLocked(
  userId: string,
  project: Project,
  type: ReviewRun["type"],
  branch: string,
  input: RunInput,
): Promise<ReviewRun> {
  const limit = env.MAX_REVIEWS_PER_USER_PER_DAY;
  return db.$transaction(async (tx) => {
    // User lock first (daily limit is per user), then project lock (one active run). Fixed order: no deadlocks.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`user:${userId}`}))`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${project.id}))`;
    const active = await tx.reviewRun.findFirst({
      where: { projectId: project.id, status: { in: ["QUEUED", "RUNNING"] } },
      select: { id: true },
    });
    if (active) throw conflict(ACTIVE_RUN_MESSAGE);

    if ((await countRecentRuns(userId, new Date(), tx)) >= limit) {
      throw new ApiError(429, "rate_limited", dailyLimitMessage(limit));
    }

    return tx.reviewRun.create({
      data: { projectId: project.id, type, branch, input: input as Prisma.InputJsonValue },
    });
  });
}

/** Body of `POST /api/findings/recheck` (07). */
export const recheckSchema = z.object({
  projectId: z.string().min(1).max(64),
  findingIds: z.array(z.string().min(1).max(64)).min(1).max(MAX_RECHECK_FINDINGS, `Select at most ${MAX_RECHECK_FINDINGS} findings.`),
});

/**
 * Enqueues a RECHECK of 1–5 findings on the project's selected branch. Same
 * 409/429 rules as any review. Findings must belong to the project.
 */
export async function enqueueRecheck(userId: string, project: Project, findingIds: string[]): Promise<ReviewRun> {
  const unique = [...new Set(findingIds)];
  const count = await db.finding.count({ where: { id: { in: unique }, projectId: project.id } });
  if (count !== unique.length) throw new ApiError(400, "validation_error", "Some findings do not belong to this project.");
  return createRunLocked(userId, project, "RECHECK", project.selectedBranch, { targetFindingIds: unique });
}

/** The polling payload of `GET /api/runs/:runId` (07). */
export function runStatusPayload(run: ReviewRun) {
  return {
    id: run.id,
    type: run.type,
    status: run.status,
    stage: run.stage,
    commitSha: run.commitSha,
    branch: run.branch,
    personas: run.personas,
    personaStatus: run.personaStatus,
    error: run.error,
    degraded: run.degraded,
    createdAt: run.createdAt,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
  };
}

/** Cancels a queued or running run. A running run stops at its next stage check. */
export async function cancelRun(run: ReviewRun): Promise<ReviewRun["status"]> {
  if (run.status !== "QUEUED" && run.status !== "RUNNING") return run.status;
  const result = await db.reviewRun.updateMany({
    where: { id: run.id, status: { in: ["QUEUED", "RUNNING"] } },
    data: { status: "CANCELLED", ...(run.status === "QUEUED" ? { finishedAt: new Date() } : {}) },
  });
  if (result.count === 0) {
    const fresh = await db.reviewRun.findUnique({ where: { id: run.id }, select: { status: true } });
    return fresh?.status ?? run.status;
  }
  return "CANCELLED";
}

import type { RunStatus } from "@/generated/prisma/enums";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";

/**
 * Daily review limit (04 §12). Free AI tiers allow only a few requests a day,
 * so each user may start `MAX_REVIEWS_PER_USER_PER_DAY` reviews per 24 hours.
 */

export const LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * True when a run uses up one of the user's daily reviews. Runs still queued
 * or running count; finished runs count only if they made an LLM call.
 * NOTE: the plan excludes "FAILED with no LLM calls"; runs that finished
 * without any LLM call for another reason (cancelled early, "no new
 * commits") are excluded too, since they consumed no AI quota.
 */
export function countsTowardLimit(run: { status: RunStatus; usage: unknown }): boolean {
  if (run.status === "QUEUED" || run.status === "RUNNING") return true;
  return run.usage !== null && run.usage !== undefined;
}

/** Number of the user's runs in the last 24 hours that count toward the limit. */
export async function countRecentRuns(
  userId: string,
  now = new Date(),
  client: Pick<Prisma.TransactionClient, "reviewRun"> = db,
): Promise<number> {
  return client.reviewRun.count({
    where: {
      project: { userId },
      createdAt: { gte: new Date(now.getTime() - LIMIT_WINDOW_MS) },
      OR: [{ status: { in: ["QUEUED", "RUNNING"] } }, { usage: { not: Prisma.DbNull } }],
    },
  });
}

export function dailyLimitMessage(limit: number): string {
  return `You have reached the limit of ${limit} review${limit === 1 ? "" : "s"} per 24 hours. Free AI tiers allow only a few requests per day — please try again later.`;
}

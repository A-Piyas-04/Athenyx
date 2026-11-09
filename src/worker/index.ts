/**
 * Athenyx review worker (04 §11).
 *
 * The queue is the ReviewRun table: QUEUED runs are claimed with
 * `FOR UPDATE SKIP LOCKED`, executed by the review engine, and heartbeat at
 * every stage. Nothing here is triggered by GitHub — only by rows a user
 * created by pressing a button.
 */

// tsx does not load .env (Next.js does); Node ≥ 20.12 can. The imports below
// are hoisted but read no configuration until main() runs (env/db are lazy).
try {
  process.loadEnvFile?.(".env");
} catch {
  // No .env file: rely on the real environment.
}

import { getAiConfig } from "@/lib/ai/config";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { cleanupStaleSnapshots } from "@/lib/github/snapshot";
import { runReview } from "@/lib/review/engine";
import { describeError } from "@/lib/review/run-helpers";

const POLL_INTERVAL_MS = 2_000;
const STALE_AFTER_MS = 10 * 60_000;
const STALE_CHECK_INTERVAL_MS = 60_000;
const SHUTDOWN_GRACE_MS = 60_000;
const STALE_MESSAGE = "Worker restarted during review";

let stopping = false;
const active = new Set<Promise<void>>();

/** Atomically claims the oldest QUEUED run (raw SQL from 04 §11). */
async function claimNextRun(): Promise<string | null> {
  const rows = await db.$queryRaw<{ id: string }[]>`
    UPDATE "ReviewRun" SET status = 'RUNNING', "startedAt" = now(), "heartbeatAt" = now()
    WHERE id = (
      SELECT id FROM "ReviewRun" WHERE status = 'QUEUED'
      ORDER BY "createdAt" LIMIT 1 FOR UPDATE SKIP LOCKED
    ) RETURNING id`;
  return rows[0]?.id ?? null;
}

/**
 * Fails RUNNING runs whose heartbeat stopped (a crashed or killed worker).
 * Runs this process is executing are never touched.
 */
async function recoverStaleRuns(liveIds: ReadonlySet<string> = new Set()): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_AFTER_MS);
  const { count } = await db.reviewRun.updateMany({
    where: {
      status: "RUNNING",
      id: { notIn: [...liveIds] },
      OR: [{ heartbeatAt: { lt: cutoff } }, { heartbeatAt: null, startedAt: { lt: cutoff } }],
    },
    data: { status: "FAILED", error: STALE_MESSAGE, finishedAt: new Date() },
  });
  if (count > 0) console.warn(`[athenyx] Marked ${count} stale run(s) as failed: ${STALE_MESSAGE}.`);
  return count;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main(): Promise<void> {
  // Fail fast with a readable message if the configuration is incomplete.
  void env.DATABASE_URL;
  const ai = getAiConfig();
  const concurrency = env.WORKER_CONCURRENCY;
  console.info(
    `[athenyx] Worker started (concurrency ${concurrency}). Review models: ${ai.roles.review.map((e) => e.label).join(", ")}`,
  );

  await recoverStaleRuns();
  const removed = await cleanupStaleSnapshots();
  if (removed > 0) console.info(`[athenyx] Removed ${removed} leftover snapshot director${removed === 1 ? "y" : "ies"}.`);

  const liveIds = new Set<string>();
  let lastStaleCheck = Date.now();

  while (!stopping) {
    try {
      if (Date.now() - lastStaleCheck > STALE_CHECK_INTERVAL_MS) {
        lastStaleCheck = Date.now();
        await recoverStaleRuns(liveIds);
      }
      while (!stopping && active.size < concurrency) {
        const id = await claimNextRun();
        if (!id) break;
        console.info(`[athenyx] Claimed run ${id}`);
        liveIds.add(id);
        const job = runReview(id)
          .catch((error) => console.error(`[athenyx] Run ${id} crashed: ${describeError(error)}`))
          .finally(() => {
            liveIds.delete(id);
            active.delete(job);
            console.info(`[athenyx] Finished run ${id}`);
          });
        active.add(job);
      }
    } catch (error) {
      console.error(`[athenyx] Worker loop error: ${describeError(error)}`);
    }
    await sleep(POLL_INTERVAL_MS);
  }
}

async function shutdown(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  console.info(`[athenyx] ${signal} received; waiting for ${active.size} active review(s)…`);
  await Promise.race([Promise.allSettled([...active]), sleep(SHUTDOWN_GRACE_MS)]);
  await db.$disconnect().catch(() => undefined);
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  await db.$disconnect().catch(() => undefined);
  process.exit(1);
});

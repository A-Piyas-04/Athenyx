import { z } from "zod";
import { ApiError, json, parseBody, route } from "@/lib/api";
import { requireProject, requireUser } from "@/lib/authz";
import { db } from "@/lib/db";
import { enqueueRun } from "@/lib/review/runs";
import { createRunSchema } from "@/lib/review/types";
import { ReviewType } from "@/generated/prisma/enums";

type Context = { params: Promise<{ projectId: string }> };

/**
 * Starts a review. This only enqueues a QUEUED run — the worker does the work.
 * One of the only two endpoints that can lead to AI calls (07).
 */
export const POST = route(async (request: Request, ctx: Context) => {
  const user = await requireUser();
  const { projectId } = await ctx.params;
  const project = await requireProject(projectId, user.id);
  const body = await parseBody(request, createRunSchema);
  const run = await enqueueRun(user.id, project, body);
  return json({ runId: run.id }, 201);
});

const listQuery = z.object({
  type: z.enum(Object.values(ReviewType) as [ReviewType, ...ReviewType[]]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/** Recent runs of a project (newest first). */
export const GET = route(async (request: Request, ctx: Context) => {
  const user = await requireUser();
  const { projectId } = await ctx.params;
  const project = await requireProject(projectId, user.id);

  const params = Object.fromEntries(new URL(request.url).searchParams);
  const query = listQuery.safeParse({ type: params.type || undefined, limit: params.limit || undefined });
  if (!query.success) throw new ApiError(400, "validation_error", "Invalid query parameters.");

  const runs = await db.reviewRun.findMany({
    where: { projectId: project.id, ...(query.data.type ? { type: query.data.type } : {}) },
    orderBy: { createdAt: "desc" },
    take: query.data.limit,
    select: {
      id: true,
      type: true,
      status: true,
      stage: true,
      branch: true,
      commitSha: true,
      error: true,
      degraded: true,
      createdAt: true,
      startedAt: true,
      finishedAt: true,
    },
  });
  return json({ runs });
});

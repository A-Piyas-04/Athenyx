import { json, route } from "@/lib/api";
import { requireRun, requireUser } from "@/lib/authz";
import { cancelRun } from "@/lib/review/runs";

type Context = { params: Promise<{ runId: string }> };

/** Cancels a queued run immediately; a running run stops at its next stage and saves nothing. */
export const POST = route(async (_request: Request, ctx: Context) => {
  const user = await requireUser();
  const { runId } = await ctx.params;
  const run = await requireRun(runId, user.id);
  const status = await cancelRun(run);
  return json({ status });
});

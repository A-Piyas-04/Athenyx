import { json, route } from "@/lib/api";
import { requireRun, requireUser } from "@/lib/authz";
import { runStatusPayload } from "@/lib/review/runs";

type Context = { params: Promise<{ runId: string }> };

/** Run status for progress polling (every 2s while QUEUED/RUNNING). DB read only. */
export const GET = route(async (_request: Request, ctx: Context) => {
  const user = await requireUser();
  const { runId } = await ctx.params;
  const run = await requireRun(runId, user.id);
  return json(runStatusPayload(run));
});

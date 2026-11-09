import { json, parseBody, route } from "@/lib/api";
import { requireProject, requireUser } from "@/lib/authz";
import { enqueueRecheck, recheckSchema } from "@/lib/review/runs";

/**
 * Starts a RECHECK of 1–5 findings on the latest commit of the selected
 * branch. One of the only two endpoints that can lead to AI calls (07).
 */
export const POST = route(async (request: Request) => {
  const user = await requireUser();
  const body = await parseBody(request, recheckSchema);
  const project = await requireProject(body.projectId, user.id);
  const run = await enqueueRecheck(user.id, project, body.findingIds);
  return json({ runId: run.id }, 201);
});

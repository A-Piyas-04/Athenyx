import { json, parseBody, route } from "@/lib/api";
import { requireProject, requireUser } from "@/lib/authz";
import { createDecision, decisionBodySchema } from "@/lib/decisions/service";

type Context = { params: Promise<{ projectId: string }> };

/** Records a decision (optionally linked to findings of the same project). */
export const POST = route(async (request: Request, ctx: Context) => {
  const user = await requireUser();
  const { projectId } = await ctx.params;
  const project = await requireProject(projectId, user.id);
  const body = await parseBody(request, decisionBodySchema);
  const decision = await createDecision(project.id, body);
  return json({ decision }, 201);
});

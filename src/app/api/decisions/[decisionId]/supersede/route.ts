import { json, parseBody, route } from "@/lib/api";
import { requireDecision, requireUser } from "@/lib/authz";
import { decisionBodySchema, supersedeDecision } from "@/lib/decisions/service";

type Context = { params: Promise<{ decisionId: string }> };

/** Creates a replacement decision; the old one becomes SUPERSEDED and links to it. */
export const POST = route(async (request: Request, ctx: Context) => {
  const user = await requireUser();
  const { decisionId } = await ctx.params;
  const decision = await requireDecision(decisionId, user.id);
  const body = await parseBody(request, decisionBodySchema);
  const replacement = await supersedeDecision(decision, body);
  return json({ decision: replacement }, 201);
});

import { NextResponse } from "next/server";
import { json, parseBody, route } from "@/lib/api";
import { requireDecision, requireUser } from "@/lib/authz";
import { decisionPatchSchema, deleteDecision, updateDecision } from "@/lib/decisions/service";

type Context = { params: Promise<{ decisionId: string }> };

export const PATCH = route(async (request: Request, ctx: Context) => {
  const user = await requireUser();
  const { decisionId } = await ctx.params;
  const decision = await requireDecision(decisionId, user.id);
  const body = await parseBody(request, decisionPatchSchema);
  const updated = await updateDecision(decision, body);
  return json({ decision: updated });
});

export const DELETE = route(async (_request: Request, ctx: Context) => {
  const user = await requireUser();
  const { decisionId } = await ctx.params;
  const decision = await requireDecision(decisionId, user.id);
  await deleteDecision(decision);
  return new NextResponse(null, { status: 204 });
});

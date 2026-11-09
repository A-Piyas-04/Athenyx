import { json, parseBody, route } from "@/lib/api";
import { requireFinding, requireUser } from "@/lib/authz";
import { db } from "@/lib/db";
import { findingUpdateData, updateFindingSchema } from "@/lib/findings/status";

type Context = { params: Promise<{ findingId: string }> };

/** Updates user-controlled fields: status (with required notes) and the chosen fix option. No AI. */
export const PATCH = route(async (request: Request, ctx: Context) => {
  const user = await requireUser();
  const { findingId } = await ctx.params;
  const finding = await requireFinding(findingId, user.id);
  const body = await parseBody(request, updateFindingSchema);
  const updated = await db.finding.update({ where: { id: finding.id }, data: findingUpdateData(finding, body) });
  return json({ finding: updated });
});

import { ApiError, json, route } from "@/lib/api";
import { requireProject, requireUser } from "@/lib/authz";
import { db } from "@/lib/db";
import { isAccessLost } from "@/lib/github/errors";
import { getBranchHeadSha } from "@/lib/github/repo";

type Context = { params: Promise<{ projectId: string }> };

/**
 * Reports whether the selected branch has moved since the last review.
 *
 * This is a single lightweight GitHub call. It never downloads code and
 * never runs AI — reviews only ever start from an explicit user action.
 */
export const POST = route(async (_request: Request, ctx: Context) => {
  const user = await requireUser();
  const { projectId } = await ctx.params;
  const project = await requireProject(projectId, user.id);

  let headSha: string;
  try {
    headSha = await getBranchHeadSha(
      {
        installationId: project.installationId,
        repoOwner: project.repoOwner,
        repoName: project.repoName,
      },
      project.selectedBranch,
    );
  } catch (error) {
    if (isAccessLost(error)) {
      throw new ApiError(403, "github_access_lost", error.message);
    }
    throw error;
  }

  const updated = await db.project.update({
    where: { id: project.id },
    data: { latestKnownSha: headSha, latestCheckedAt: new Date() },
    select: {
      latestKnownSha: true,
      latestCheckedAt: true,
      lastReviewedSha: true,
    },
  });

  return json({
    latestKnownSha: updated.latestKnownSha,
    latestCheckedAt: updated.latestCheckedAt,
    lastReviewedSha: updated.lastReviewedSha,
    isBehind: updated.latestKnownSha !== updated.lastReviewedSha,
  });
});

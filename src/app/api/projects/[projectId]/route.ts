import { NextResponse } from "next/server";
import { ApiError, json, parseBody, route } from "@/lib/api";
import { requireProject, requireUser } from "@/lib/authz";
import { db } from "@/lib/db";
import { isAccessLost } from "@/lib/github/errors";
import { branchExists } from "@/lib/github/repo";
import { updateProjectSchema } from "@/lib/projects/schemas";

type Context = { params: Promise<{ projectId: string }> };

/**
 * Updates the project's selected branch.
 *
 * Existing runs and findings keep their own commit SHAs, so switching
 * branches never rewrites history — it only changes what the next review
 * looks at. The freshness fields are cleared because a different branch's
 * head has not been checked yet.
 */
export const PATCH = route(async (request: Request, ctx: Context) => {
  const user = await requireUser();
  const { projectId } = await ctx.params;
  const project = await requireProject(projectId, user.id);
  const body = await parseBody(request, updateProjectSchema);

  if (!body.selectedBranch || body.selectedBranch === project.selectedBranch) {
    return json({ project });
  }

  try {
    const exists = await branchExists(
      {
        installationId: project.installationId,
        repoOwner: project.repoOwner,
        repoName: project.repoName,
      },
      body.selectedBranch,
    );
    if (!exists) {
      throw new ApiError(
        400,
        "validation_error",
        `Branch "${body.selectedBranch}" does not exist in ${project.repoOwner}/${project.repoName}.`,
      );
    }
  } catch (error) {
    if (isAccessLost(error)) {
      throw new ApiError(403, "github_access_lost", error.message);
    }
    throw error;
  }

  const updated = await db.project.update({
    where: { id: project.id },
    data: {
      selectedBranch: body.selectedBranch,
      latestKnownSha: null,
      latestCheckedAt: null,
      // NOTE: the old branch's reviewed commit is not a valid Latest Changes baseline for the new
      // branch, so it is cleared; findings and runs keep their own SHAs.
      lastReviewedSha: null,
      lastReviewedAt: null,
    },
  });

  return json({ project: updated });
});

/** Disconnects a project, deleting its runs, findings and decisions. */
export const DELETE = route(async (_request: Request, ctx: Context) => {
  const user = await requireUser();
  const { projectId } = await ctx.params;
  const project = await requireProject(projectId, user.id);

  await db.project.delete({ where: { id: project.id } });

  return new NextResponse(null, { status: 204 });
});

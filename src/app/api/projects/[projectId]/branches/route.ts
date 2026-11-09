import { ApiError, json, route } from "@/lib/api";
import { requireProject, requireUser } from "@/lib/authz";
import { isAccessLost } from "@/lib/github/errors";
import { listBranches } from "@/lib/github/repo";

type Context = { params: Promise<{ projectId: string }> };

/** Lists the connected repository's branches (for Settings and Release Gate). */
export const GET = route(async (request: Request, ctx: Context) => {
  const user = await requireUser();
  const { projectId } = await ctx.params;
  const project = await requireProject(projectId, user.id);

  const query = new URL(request.url).searchParams.get("q") ?? undefined;

  try {
    const { branches, truncated } = await listBranches(
      {
        installationId: project.installationId,
        repoOwner: project.repoOwner,
        repoName: project.repoName,
      },
      query,
    );
    return json({ branches, truncated });
  } catch (error) {
    if (isAccessLost(error)) {
      throw new ApiError(403, "github_access_lost", error.message);
    }
    throw error;
  }
});

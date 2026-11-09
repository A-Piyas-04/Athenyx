import { ApiError, json, notFoundError, route } from "@/lib/api";
import { requireUser } from "@/lib/authz";
import { isAccessLost, isReauthRequired } from "@/lib/github/errors";
import { listBranches } from "@/lib/github/repo";
import { findUserRepo, getUserGithubToken } from "@/lib/github/user";

type Context = {
  params: Promise<{ installationId: string; repoId: string }>;
};

/**
 * Lists branches of a repository the user may connect.
 *
 * The user's own token decides visibility first; only then is the
 * installation token used to read branches.
 */
export const GET = route(async (request: Request, ctx: Context) => {
  const user = await requireUser();
  const { installationId: rawInstallationId, repoId: rawRepoId } =
    await ctx.params;

  const installationId = Number(rawInstallationId);
  const repoId = Number(rawRepoId);
  if (!Number.isInteger(installationId) || !Number.isInteger(repoId)) {
    throw new ApiError(400, "validation_error", "Invalid installation or repository id.");
  }

  const query = new URL(request.url).searchParams.get("q") ?? undefined;

  try {
    const token = await getUserGithubToken(user.id);
    const repo = await findUserRepo(token, installationId, repoId);
    if (!repo) throw notFoundError("Repository");

    const { branches, truncated } = await listBranches(
      {
        installationId,
        repoOwner: repo.owner,
        repoName: repo.name,
      },
      query,
    );

    return json({
      repo,
      branches,
      truncated,
    });
  } catch (error) {
    if (isReauthRequired(error)) {
      throw new ApiError(401, "github_reauth_required", error.message);
    }
    if (isAccessLost(error)) {
      throw new ApiError(403, "github_access_lost", error.message);
    }
    throw error;
  }
});

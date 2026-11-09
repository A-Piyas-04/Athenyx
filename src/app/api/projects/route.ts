import { ApiError, forbidden, json, parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/authz";
import { db } from "@/lib/db";
import { isAccessLost, isReauthRequired } from "@/lib/github/errors";
import { branchExists } from "@/lib/github/repo";
import { findUserRepo, getUserGithubToken } from "@/lib/github/user";
import { createProjectSchema } from "@/lib/projects/schemas";

/**
 * Connects a repository + branch as an Athenyx project.
 *
 * Access is re-verified with the user's own token, so a crafted request
 * cannot connect a repository the user cannot see. Connecting does not read
 * repository content and never runs AI — the project map is built on the
 * first review.
 */
export const POST = route(async (request: Request) => {
  const user = await requireUser();
  const body = await parseBody(request, createProjectSchema);

  try {
    const token = await getUserGithubToken(user.id);
    const repo = await findUserRepo(token, body.installationId, body.repoId);
    if (!repo) {
      throw forbidden(
        "That repository is not available through the selected installation.",
      );
    }

    const ref = {
      installationId: body.installationId,
      repoOwner: repo.owner,
      repoName: repo.name,
    };

    if (!(await branchExists(ref, body.branch))) {
      throw new ApiError(
        400,
        "validation_error",
        `Branch "${body.branch}" does not exist in ${repo.fullName}.`,
      );
    }

    // Idempotent: reconnecting an existing repository updates it in place.
    const existing = await db.project.findUnique({
      where: { userId_repoId: { userId: user.id, repoId: body.repoId } },
    });

    if (existing) {
      const project = await db.project.update({
        where: { id: existing.id },
        data: {
          installationId: body.installationId,
          repoOwner: repo.owner,
          repoName: repo.name,
          defaultBranch: repo.defaultBranch,
          ...(existing.selectedBranch === body.branch
            ? {}
            : { selectedBranch: body.branch, latestKnownSha: null, latestCheckedAt: null }),
        },
      });
      return json({ project }, 200);
    }

    const project = await db.project.create({
      data: {
        userId: user.id,
        installationId: body.installationId,
        repoId: body.repoId,
        repoOwner: repo.owner,
        repoName: repo.name,
        defaultBranch: repo.defaultBranch,
        selectedBranch: body.branch,
      },
    });

    return json({ project }, 201);
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

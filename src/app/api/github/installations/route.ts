import { ApiError, json, route } from "@/lib/api";
import { requireUser } from "@/lib/authz";
import { appInstallUrl } from "@/lib/github/app";
import { isReauthRequired } from "@/lib/github/errors";
import {
  getUserGithubToken,
  listUserInstallationsWithRepos,
} from "@/lib/github/user";

/** Lists the user's app installations and the repositories they granted. */
export const GET = route(async () => {
  const user = await requireUser();

  try {
    const token = await getUserGithubToken(user.id);
    const installations = await listUserInstallationsWithRepos(token);
    return json({ installations, installUrl: appInstallUrl() });
  } catch (error) {
    if (isReauthRequired(error)) {
      throw new ApiError(401, "github_reauth_required", error.message);
    }
    throw error;
  }
});

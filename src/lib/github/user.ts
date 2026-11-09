import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { GithubReauthRequired } from "@/lib/github/errors";
import { userOctokit } from "@/lib/github/app";

/** Refresh a token this many seconds before it actually expires. */
const EXPIRY_MARGIN_SECONDS = 60;

export type StoredToken = {
  access_token: string | null;
  refresh_token: string | null;
  expires_at: number | null;
};

/**
 * Whether a stored access token is still usable.
 *
 * GitHub App user tokens expire after 8 hours. A token with no recorded
 * expiry is treated as valid (GitHub Apps can be configured not to expire
 * user tokens).
 */
export function isTokenUsable(
  token: StoredToken,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): boolean {
  if (!token.access_token) return false;
  if (token.expires_at === null) return true;
  return token.expires_at - EXPIRY_MARGIN_SECONDS > nowSeconds;
}

type RefreshResponse = {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
  error?: string;
  error_description?: string;
};

/** Exchanges a refresh token for a new access token. */
async function refreshAccessToken(refreshToken: string): Promise<{
  accessToken: string;
  expiresAt: number | null;
  refreshToken: string | null;
  refreshTokenExpiresIn: number | null;
}> {
  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      client_id: env.AUTH_GITHUB_ID,
      client_secret: env.AUTH_GITHUB_SECRET,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    throw new GithubReauthRequired();
  }

  const data = (await response.json()) as RefreshResponse;
  if (data.error || !data.access_token) {
    // Typically "bad_refresh_token" — the 6-month refresh window elapsed or
    // the user revoked the authorization.
    throw new GithubReauthRequired();
  }

  return {
    accessToken: data.access_token,
    expiresAt:
      typeof data.expires_in === "number"
        ? Math.floor(Date.now() / 1000) + data.expires_in
        : null,
    refreshToken: data.refresh_token ?? null,
    refreshTokenExpiresIn: data.refresh_token_expires_in ?? null,
  };
}

/**
 * Returns a usable GitHub user access token, refreshing it when needed.
 *
 * This token is used only for listing the user's installations and the
 * repositories they can see. Repository content is read with installation
 * tokens instead.
 */
export async function getUserGithubToken(userId: string): Promise<string> {
  const account = await db.account.findFirst({
    where: { userId, provider: "github" },
    select: {
      id: true,
      access_token: true,
      refresh_token: true,
      expires_at: true,
    },
  });

  if (!account) throw new GithubReauthRequired();

  if (isTokenUsable(account)) {
    return account.access_token as string;
  }

  if (!account.refresh_token) throw new GithubReauthRequired();

  const refreshed = await refreshAccessToken(account.refresh_token);

  await db.account.update({
    where: { id: account.id },
    data: {
      access_token: refreshed.accessToken,
      expires_at: refreshed.expiresAt,
      ...(refreshed.refreshToken
        ? { refresh_token: refreshed.refreshToken }
        : {}),
      ...(refreshed.refreshTokenExpiresIn !== null
        ? { refresh_token_expires_in: refreshed.refreshTokenExpiresIn }
        : {}),
    },
  });

  return refreshed.accessToken;
}

export type UserRepo = {
  id: number;
  name: string;
  fullName: string;
  owner: string;
  defaultBranch: string;
  private: boolean;
};

export type UserInstallation = {
  id: number;
  account: { login: string; type: string };
  repositorySelection: string;
  repos: UserRepo[];
};

type RawRepo = {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  default_branch?: string;
  owner?: { login?: string } | null;
};

function toUserRepo(repo: RawRepo): UserRepo {
  return {
    id: repo.id,
    name: repo.name,
    fullName: repo.full_name,
    owner: repo.owner?.login ?? repo.full_name.split("/")[0],
    defaultBranch: repo.default_branch ?? "main",
    private: repo.private,
  };
}

/**
 * Lists the app installations the user can see, each with the repositories
 * they granted access to. Uses the user token so a user only ever sees
 * installations and repositories that are genuinely theirs.
 */
export async function listUserInstallationsWithRepos(
  token: string,
): Promise<UserInstallation[]> {
  const octokit = userOctokit(token);

  const installations = (await octokit.paginate("GET /user/installations", {
    per_page: 100,
  })) as Array<{
    id: number;
    account: { login?: string; type?: string } | null;
    repository_selection?: string;
  }>;

  return Promise.all(
    installations.map(async (installation) => {
      const repos = (await octokit.paginate(
        "GET /user/installations/{installation_id}/repositories",
        { installation_id: installation.id, per_page: 100 },
      )) as RawRepo[];

      return {
        id: installation.id,
        account: {
          login: installation.account?.login ?? "unknown",
          type: installation.account?.type ?? "User",
        },
        repositorySelection: installation.repository_selection ?? "selected",
        repos: repos
          .map(toUserRepo)
          .sort((a, b) => a.fullName.localeCompare(b.fullName)),
      };
    }),
  );
}

/**
 * Confirms the user can actually see this repository through this
 * installation. Called before connecting a project so a crafted request
 * cannot attach a repository the user has no access to.
 */
export async function findUserRepo(
  token: string,
  installationId: number,
  repoId: number,
): Promise<UserRepo | null> {
  const octokit = userOctokit(token);
  try {
    const repos = (await octokit.paginate(
      "GET /user/installations/{installation_id}/repositories",
      { installation_id: installationId, per_page: 100 },
    )) as RawRepo[];
    const match = repos.find((repo) => repo.id === repoId);
    return match ? toUserRepo(match) : null;
  } catch {
    return null;
  }
}

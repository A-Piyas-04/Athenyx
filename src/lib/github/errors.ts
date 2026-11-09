/** The user's GitHub authorization is gone or unusable; they must sign in again. */
export class GithubReauthRequired extends Error {
  constructor(message = "Your GitHub authorization has expired. Please sign in again.") {
    super(message);
    this.name = "GithubReauthRequired";
  }
}

export const ACCESS_LOST_MESSAGE = "Athenyx no longer has access to this repository. Reconnect in Settings.";

/** The app can no longer read a repository (uninstalled, or deselected). */
export class GithubAccessLost extends Error {
  constructor(message = ACCESS_LOST_MESSAGE) {
    super(message);
    this.name = "GithubAccessLost";
  }
}

type HttpLikeError = { status?: unknown };

function statusOf(error: unknown): number | null {
  const status = (error as HttpLikeError | null)?.status;
  return typeof status === "number" ? status : null;
}

/**
 * Converts GitHub's "you can't see this" responses into `GithubAccessLost`.
 * 404 is included because GitHub hides inaccessible repositories behind it.
 */
export function asAccessError(error: unknown): never {
  const status = statusOf(error);
  if (status === 403 || status === 404 || status === 401) {
    throw new GithubAccessLost();
  }
  throw error;
}

export function isAccessLost(error: unknown): error is GithubAccessLost {
  return error instanceof GithubAccessLost;
}

export function isReauthRequired(error: unknown): error is GithubReauthRequired {
  return error instanceof GithubReauthRequired;
}

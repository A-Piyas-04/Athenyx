import { App, Octokit } from "octokit";
import { env } from "@/lib/env";

/**
 * The Athenyx GitHub App.
 *
 * Repository reads use short-lived installation tokens, which Octokit caches
 * and refreshes. Access is read-only and limited to the repositories the user
 * selected when installing the app.
 */

let app: App | null = null;

export function githubApp(): App {
  app ??= new App({
    appId: env.GITHUB_APP_ID,
    privateKey: env.GITHUB_APP_PRIVATE_KEY,
  });
  return app;
}

/** An Octokit client authenticated as one installation of the app. */
export async function installationOctokit(
  installationId: number,
): Promise<Octokit> {
  return githubApp().getInstallationOctokit(installationId);
}

/** An Octokit client authenticated as the signed-in user. */
export function userOctokit(token: string): Octokit {
  return new Octokit({ auth: token });
}

/** The URL where a user installs the app (or edits its repository selection). */
export function appInstallUrl(): string {
  return `https://github.com/apps/${env.GITHUB_APP_SLUG}/installations/new`;
}

/** The URL where a user manages an existing installation's repository access. */
export function installationSettingsUrl(installationId: number): string {
  return `https://github.com/settings/installations/${installationId}`;
}

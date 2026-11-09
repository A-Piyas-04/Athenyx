# 03 — GitHub Integration

Athenyx uses **one GitHub App** for both sign-in (user-to-server OAuth) and repository reads (installation tokens). Access is **read-only** and limited to repositories the user selects during installation.

**Cost: free.** Creating and using a GitHub App, OAuth sign-in, and the REST API calls used here cost nothing and need no paid plan (works with free GitHub accounts and private repos). No public URL is needed for local development: the OAuth callback and setup redirect go through the user's browser to `http://localhost:3000`, and webhooks are disabled. Free API rate limits (about 5,000 requests/hour per installation and per user token) are far above what Athenyx uses (a few requests per review).

## 1. GitHub App configuration (document in root `README.md` setup section)

| Setting | Value |
|---|---|
| Homepage URL | `APP_URL` |
| Callback URL | `${APP_URL}/api/auth/callback/github` |
| "Request user authorization (OAuth) during installation" | ✅ enabled |
| Setup URL | `${APP_URL}/projects/new` (with "Redirect on update" ✅) |
| Webhook | **Disabled** (MVP needs none; pushes must not trigger anything) |
| Expire user authorization tokens | ✅ (default) — handle refresh |
| Where can it be installed | Any account |

**Repository permissions (all Read-only):**

| Permission | Why |
|---|---|
| Metadata: Read | Required baseline |
| Contents: Read | Tarball download, branches, compare |
| Checks: Read | Release Gate CI evidence |
| Commit statuses: Read | Release Gate CI evidence |

No write permissions. No account/organization permissions.

## 2. Sign-in (Auth.js)

- `src/lib/auth.ts`: Auth.js with `GitHub` provider using `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET` (the GitHub App's client credentials), Prisma adapter, database sessions.
- On sign-in, store `githubLogin` on `User` (from the profile `login`).
- Account row holds `access_token`, `refresh_token`, `expires_at`.
- `getUserGithubToken(userId)` in `src/lib/github/user.ts`:
  - If `expires_at` is in the future (with 60s margin) → return `access_token`.
  - Else refresh via `POST https://github.com/login/oauth/access_token` with `grant_type=refresh_token`, update the Account row, return the new token.
  - If refresh fails → throw `GithubReauthRequired`; UI shows "Reconnect GitHub" (sign out + sign in).
- The **user token is only used** for: listing the user's installations and the repositories they can access in each installation. Everything else uses installation tokens.

## 3. Connecting a project (`/projects/new`)

Flow:

1. Page lists installations via user token: `GET /user/installations`, and for each `GET /user/installations/{installation_id}/repositories` (paginate).
2. If none: show a button **"Install Athenyx on GitHub"** linking to `https://github.com/apps/${GITHUB_APP_SLUG}/installations/new`. Explain: "Choose *Only select repositories* to limit access."
3. User picks a repository → load branches with the installation token: `GET /repos/{owner}/{repo}/branches` (paginate, max 300 shown, with a search box). Default select the repo's `default_branch`.
4. User clicks **Connect** → `POST /api/projects` with `{ installationId, repoId, branch }`.
5. Server **re-verifies** with the user token that `repoId` is in `GET /user/installations/{installationId}/repositories` (prevents connecting repos the user can't see). Then creates `Project` (unique per `userId+repoId`; if it exists, return it).
6. Redirect to `/p/{projectId}/overview`. **Do not** fetch a snapshot or run AI at connect time. (The project map is built on the first review.)

"Manage repository access" in Settings links to `https://github.com/settings/installations/{installationId}` (for org installs, GitHub redirects correctly).

## 4. Installation client (`src/lib/github/app.ts`)

```ts
import { App } from "octokit";
export const githubApp = new App({ appId: env.GITHUB_APP_ID, privateKey: env.GITHUB_APP_PRIVATE_KEY });
export async function installationOctokit(installationId: number) {
  return githubApp.getInstallationOctokit(installationId);
}
```

Octokit handles installation token caching. Convert `\n`-escaped private keys to real newlines in `env.ts`.

If an installation call returns 404/403 (app uninstalled or repo removed from selection), mark the run FAILED with message "Athenyx no longer has access to this repository. Reconnect in Settings." and surface a banner in the header.

## 5. Repository helpers (`src/lib/github/repo.ts`)

| Function | GitHub endpoint | Used by |
|---|---|---|
| `listBranches(project)` | `GET /repos/{o}/{r}/branches` | connect page, settings |
| `getBranchHeadSha(project, branch)` | `GET /repos/{o}/{r}/branches/{branch}` → `commit.sha` | Check for Updates; run RESOLVING_COMMIT |
| `compareCommits(project, base, head)` | `GET /repos/{o}/{r}/compare/{base}...{head}` | LATEST_CHANGES, RECHECK |
| `getCiEvidence(project, sha)` | `GET /repos/{o}/{r}/commits/{sha}/check-runs` + `GET .../commits/{sha}/status` | RELEASE |

`compareCommits` returns `{ status, aheadBy, behindBy, files: { filename, status, additions, deletions, patch?, previous_filename? }[] }`. GitHub caps compare at 300 files; if `files.length === 300`, add limitation "Diff truncated by GitHub at 300 files." Patches may be missing for large files; then read both versions from the snapshot? **No** — only the head snapshot is downloaded; record limitation "Patch unavailable for X" and include the head version of the file.

`getCiEvidence` returns `{ checks: { name, status, conclusion }[], combinedStatus: "success"|"failure"|"pending"|"none", totalCount }`. If permissions are missing (403), return `{ unavailable: true }` and add a limitation — don't fail the run.

## 6. Snapshot (`src/lib/github/snapshot.ts`)

```ts
async function downloadSnapshot(project, sha, runId): Promise<{ dir: string; cleanup: () => Promise<void> }>
```

1. `octokit.rest.repos.downloadTarballArchive({ owner, repo, ref: sha })` (follows redirect to codeload). Stream to `${os.tmpdir()}/athenyx/${runId}/repo.tar.gz`.
2. Abort if size > `MAX_SNAPSHOT_MB` → run FAILED: "Repository snapshot exceeds the size limit."
3. Extract with `tar.x({ file, cwd: dir, strip: 1, filter })` where `filter` rejects paths matched by `filters.ts` ignore rules early (don't even write `node_modules`, `.git`, build dirs) and rejects symlinks/hardlinks (security: prevents path escape).
4. Reject any entry whose resolved path escapes `dir`.
5. `cleanup()` deletes `${os.tmpdir()}/athenyx/${runId}` recursively. The engine calls it in `finally`.
6. Worker startup also deletes any leftover `${os.tmpdir()}/athenyx/*` older than 1 hour.

## 7. "Check for Updates" (no AI)

`POST /api/projects/:id/check-updates`:
- `getBranchHeadSha(selectedBranch)` → update `latestKnownSha`, `latestCheckedAt`.
- Return `{ latestKnownSha, lastReviewedSha, isBehind: latestKnownSha !== lastReviewedSha }`.
- Header shows: "New commits since last review" badge when behind, with **Refresh & Review** button (goes to Review Lab with Project Health or Latest Changes preselected — user still clicks Start).

## 8. Changing branch

Settings → Branch select → `PATCH /api/projects/:id { selectedBranch }`. Existing findings/runs stay as they are (tied to their SHAs). Set `latestKnownSha = null`. Show a notice: "Previous findings were reviewed on branch X at <sha>."

import { installationOctokit } from "@/lib/github/app";
import { asAccessError } from "@/lib/github/errors";

/** The minimum a caller needs to address a repository. */
export type RepoRef = {
  installationId: number;
  repoOwner: string;
  repoName: string;
};

export type Branch = {
  name: string;
  sha: string;
};

/** GitHub returns up to 100 branches per page; three pages is plenty for the UI. */
const MAX_BRANCH_PAGES = 3;
export const MAX_BRANCHES = 300;

/**
 * Lists branches, newest-page-first up to {@link MAX_BRANCHES}.
 *
 * `query` filters client-side (GitHub has no branch search endpoint), so the
 * connect and settings pickers stay usable on repositories with many branches.
 */
export async function listBranches(
  ref: RepoRef,
  query?: string,
): Promise<{ branches: Branch[]; truncated: boolean }> {
  const octokit = await installationOctokit(ref.installationId);
  const collected: Branch[] = [];
  let truncated = false;

  try {
    const iterator = octokit.paginate.iterator(octokit.rest.repos.listBranches, {
      owner: ref.repoOwner,
      repo: ref.repoName,
      per_page: 100,
    });

    let page = 0;
    for await (const { data } of iterator) {
      for (const branch of data) {
        collected.push({ name: branch.name, sha: branch.commit.sha });
      }
      page += 1;
      if (page >= MAX_BRANCH_PAGES) {
        truncated = collected.length >= MAX_BRANCHES;
        break;
      }
    }
  } catch (error) {
    asAccessError(error);
  }

  const needle = query?.trim().toLowerCase();
  const branches = needle
    ? collected.filter((branch) => branch.name.toLowerCase().includes(needle))
    : collected;

  return {
    branches: branches.slice(0, MAX_BRANCHES),
    truncated,
  };
}

/** Resolves a branch to the exact commit SHA at its head. */
export async function getBranchHeadSha(
  ref: RepoRef,
  branch: string,
): Promise<string> {
  const octokit = await installationOctokit(ref.installationId);
  try {
    const { data } = await octokit.rest.repos.getBranch({
      owner: ref.repoOwner,
      repo: ref.repoName,
      branch,
    });
    return data.commit.sha;
  } catch (error) {
    asAccessError(error);
  }
}

/** True when the branch exists in the repository. */
export async function branchExists(
  ref: RepoRef,
  branch: string,
): Promise<boolean> {
  const octokit = await installationOctokit(ref.installationId);
  try {
    await octokit.rest.repos.getBranch({
      owner: ref.repoOwner,
      repo: ref.repoName,
      branch,
    });
    return true;
  } catch (error) {
    if ((error as { status?: number })?.status === 404) return false;
    return asAccessError(error);
  }
}

export type RepoInfo = {
  id: number;
  owner: string;
  name: string;
  defaultBranch: string;
  private: boolean;
};

/** Looks a repository up by its numeric id through an installation token. */
export async function getRepoById(
  installationId: number,
  repoId: number,
): Promise<RepoInfo> {
  const octokit = await installationOctokit(installationId);
  try {
    const { data } = await octokit.request("GET /repositories/{repository_id}", {
      repository_id: repoId,
    });
    return {
      id: data.id,
      owner: data.owner.login,
      name: data.name,
      defaultBranch: data.default_branch,
      private: data.private,
    };
  } catch (error) {
    asAccessError(error);
  }
}

export type CompareFile = {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  patch?: string;
  previous_filename?: string;
};

export type CompareResult = {
  status: string;
  aheadBy: number;
  behindBy: number;
  files: CompareFile[];
  /** True when GitHub capped the file list (300 files). */
  truncated: boolean;
};

/** GitHub caps the compare file list at this many files (03 §5). */
export const COMPARE_FILE_CAP = 300;

/** Diff between two commits (`base...head`), for LATEST_CHANGES and RECHECK. */
export async function compareCommits(ref: RepoRef, base: string, head: string): Promise<CompareResult> {
  const octokit = await installationOctokit(ref.installationId);
  try {
    const { data } = await octokit.rest.repos.compareCommitsWithBasehead({
      owner: ref.repoOwner,
      repo: ref.repoName,
      basehead: `${base}...${head}`,
      per_page: 100,
    });
    const files: CompareFile[] = (data.files ?? []).map((f) => ({
      filename: f.filename,
      status: f.status,
      additions: f.additions,
      deletions: f.deletions,
      ...(f.patch !== undefined ? { patch: f.patch } : {}),
      ...(f.previous_filename ? { previous_filename: f.previous_filename } : {}),
    }));
    return {
      status: data.status,
      aheadBy: data.ahead_by,
      behindBy: data.behind_by,
      files,
      truncated: files.length >= COMPARE_FILE_CAP,
    };
  } catch (error) {
    // Access was just confirmed by resolving the branch head, so a 404 here
    // means the base commit is gone (e.g. after a force-push), not lost access.
    if ((error as { status?: number })?.status === 404) throw new CompareUnavailable();
    asAccessError(error);
  }
}

export class CompareUnavailable extends Error {
  constructor(
    message = "Could not compare with the previously reviewed commit — it may no longer exist on GitHub (for example after a force-push). Run a Project Health review instead.",
  ) {
    super(message);
    this.name = "CompareUnavailable";
  }
}

export type CiCheck = { name: string; status: string; conclusion: string | null };

export type CiEvidence =
  | {
      unavailable: false;
      checks: CiCheck[];
      combinedStatus: "success" | "failure" | "pending" | "none";
      totalCount: number;
    }
  | { unavailable: true };

const FAILING_CONCLUSIONS = new Set(["failure", "timed_out", "cancelled", "action_required", "startup_failure"]);

/** Combines check runs and legacy commit statuses into one state (03 §5). */
export function combineCiState(
  checks: CiCheck[],
  statuses: { state: string }[],
): "success" | "failure" | "pending" | "none" {
  if (checks.length === 0 && statuses.length === 0) return "none";
  const failed =
    checks.some((c) => c.conclusion !== null && FAILING_CONCLUSIONS.has(c.conclusion)) ||
    statuses.some((s) => s.state === "failure" || s.state === "error");
  if (failed) return "failure";
  const pending = checks.some((c) => c.status !== "completed") || statuses.some((s) => s.state === "pending");
  return pending ? "pending" : "success";
}

/**
 * CI results for a commit (check runs + commit statuses), for Release Gate.
 * Missing permissions (403/404) return `{ unavailable: true }` — never an error.
 */
export async function getCiEvidence(ref: RepoRef, sha: string): Promise<CiEvidence> {
  const octokit = await installationOctokit(ref.installationId);
  try {
    const [runs, combined] = await Promise.all([
      octokit.rest.checks.listForRef({ owner: ref.repoOwner, repo: ref.repoName, ref: sha, per_page: 100 }),
      octokit.rest.repos.getCombinedStatusForRef({ owner: ref.repoOwner, repo: ref.repoName, ref: sha, per_page: 100 }),
    ]);
    const checks: CiCheck[] = [
      ...runs.data.check_runs.map((c) => ({ name: c.name, status: c.status, conclusion: c.conclusion ?? null })),
      ...combined.data.statuses.map((s) => ({
        name: s.context,
        status: s.state === "pending" ? "in_progress" : "completed",
        conclusion: s.state === "pending" ? null : s.state === "error" ? "failure" : s.state,
      })),
    ];
    return {
      unavailable: false,
      checks,
      combinedStatus: combineCiState(
        runs.data.check_runs.map((c) => ({ name: c.name, status: c.status, conclusion: c.conclusion ?? null })),
        combined.data.statuses,
      ),
      totalCount: runs.data.total_count + combined.data.statuses.length,
    };
  } catch (error) {
    const status = (error as { status?: number })?.status;
    if (status === 403 || status === 404) return { unavailable: true };
    throw error;
  }
}

/** Short display form of a commit SHA. */
export function shortSha(sha: string | null | undefined): string | null {
  return sha ? sha.slice(0, 7) : null;
}

/** Link to a commit on GitHub. */
export function commitUrl(
  owner: string,
  name: string,
  sha: string,
): string {
  return `https://github.com/${owner}/${name}/commit/${sha}`;
}

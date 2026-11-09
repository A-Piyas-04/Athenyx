import { createWriteStream } from "node:fs";
import { mkdir, readdir, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import * as tar from "tar";
import { env } from "@/lib/env";
import { installationOctokit } from "@/lib/github/app";
import { asAccessError } from "@/lib/github/errors";
import type { RepoRef } from "@/lib/github/repo";
import {
  classifyFile,
  ignoredDirOf,
  isSecretPath,
  normalizeRepoPath,
  type ExcludedFile,
} from "@/lib/repo/filters";

/**
 * Repository snapshots (03 §6): the tarball at one exact SHA, extracted into a
 * per-run temp directory that the engine deletes in `finally`.
 *
 * Extraction is defensive: only regular files and directories are written,
 * nothing outside the target directory, and ignored/secret/oversized files are
 * never written to disk at all.
 */

export class SnapshotTooLarge extends Error {
  constructor(message = "Repository snapshot exceeds the size limit.") {
    super(message);
    this.name = "SnapshotTooLarge";
  }
}

/** Root for every run's snapshot: `${os.tmpdir()}/athenyx`. */
export function snapshotBaseDir(): string {
  return path.join(os.tmpdir(), "athenyx");
}

/** Run ids become directory names, so only allow cuid-like ids. */
function runDir(baseDir: string, runId: string): string {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(runId)) throw new Error("Invalid run id for snapshot directory.");
  return path.join(baseDir, runId);
}

export type Snapshot = {
  /** Directory holding the extracted repository files. */
  dir: string;
  /** Entries never written to disk (secret, ignored, too large), for coverage. */
  skipped: ExcludedFile[];
  /** Unsafe archive entries that were refused (links, path escapes, devices). */
  rejected: string[];
  /** Limitations caused by extraction, user-safe. */
  limitations: string[];
  /** Deletes the whole run directory. Safe to call more than once. */
  cleanup: () => Promise<void>;
};

// ---------------------------------------------------------------------------
// Download
// ---------------------------------------------------------------------------

/**
 * Streams `source` into `file`, aborting with {@link SnapshotTooLarge} as soon
 * as more than `maxBytes` arrive. A partial file is removed on failure.
 */
export async function saveLimitedStream(
  source: Readable,
  file: string,
  maxBytes: number,
): Promise<number> {
  let total = 0;
  const limiter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      total += chunk.length;
      if (total > maxBytes) callback(new SnapshotTooLarge());
      else callback(null, chunk);
    },
  });
  try {
    await pipeline(source, limiter, createWriteStream(file));
    return total;
  } catch (error) {
    await rm(file, { force: true });
    throw error;
  }
}

/** Fetches the tarball body as a Node stream (Octokit follows the codeload redirect). */
async function fetchTarball(ref: RepoRef, sha: string): Promise<Readable> {
  const octokit = await installationOctokit(ref.installationId);
  let body: unknown;
  try {
    const response = await octokit.rest.repos.downloadTarballArchive({
      owner: ref.repoOwner,
      repo: ref.repoName,
      ref: sha,
      request: { parseSuccessResponseBody: false },
    });
    body = response.data;
  } catch (error) {
    return asAccessError(error);
  }

  if (body instanceof Readable) return body;
  if (body && typeof (body as WebReadableStream).getReader === "function") {
    return Readable.fromWeb(body as WebReadableStream);
  }
  // Defensive: some transports buffer the body.
  if (body instanceof ArrayBuffer) return Readable.from(Buffer.from(body));
  throw new Error("Unexpected tarball response body.");
}

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------

/** Entry types that may be written. Everything else (links, devices, fifos) is refused. */
const SAFE_TYPES = new Set(["File", "OldFile", "ContiguousFile", "Directory"]);

/**
 * Bound on the total bytes written while extracting. Per-file size is already
 * capped at 200KB by the filters; this guards against archives with huge file
 * counts. NOTE: 4× the compressed limit is a simple, generous bound.
 */
export function maxExtractedBytes(maxSnapshotBytes: number): number {
  return maxSnapshotBytes * 4;
}

type ExtractOptions = { maxExtractedBytes: number };

/**
 * Removes the archive's top-level directory (`owner-repo-sha/`), mirroring
 * `strip: 1`. Returns null for the root entry itself.
 */
function stripRoot(entryPath: string): string | null {
  const parts = entryPath.replaceAll("\\", "/").split("/").filter((p) => p !== "");
  if (parts.length <= 1) return null;
  return parts.slice(1).join("/");
}

/** True when `relative` stays inside `dir` after resolution. */
export function isInside(dir: string, relative: string): boolean {
  if (path.isAbsolute(relative) || /^[A-Za-z]:/.test(relative)) return false;
  if (relative.split(/[\\/]/).includes("..")) return false;
  const resolved = path.resolve(dir, relative);
  return resolved === dir || resolved.startsWith(dir + path.sep);
}

/**
 * Extracts a GitHub tarball into `dir`. Unsafe entries are refused and
 * reported; ignored, secret and oversized files are skipped without writing.
 */
export async function extractSnapshot(
  archive: string,
  dir: string,
  options: ExtractOptions,
): Promise<Omit<Snapshot, "cleanup" | "dir">> {
  await mkdir(dir, { recursive: true });
  const root = path.resolve(dir);
  const skipped: ExcludedFile[] = [];
  const skippedDirs = new Set<string>();
  const rejected: string[] = [];
  let written = 0;
  let tooBig = false;

  const skipIgnoredDir = (ignoredDir: string) => {
    if (skippedDirs.has(ignoredDir)) return;
    skippedDirs.add(ignoredDir);
    skipped.push({ path: `${ignoredDir}/`, reason: "ignored" });
  };

  await tar.x({
    file: archive,
    cwd: root,
    strip: 1,
    preservePaths: false,
    preserveOwner: false,
    noChmod: true,
    filter: (entryPath, entry) => {
      const stats = entry as tar.ReadEntry;
      const relative = stripRoot(entryPath);
      if (relative === null) return stats.type === "Directory";

      if (!SAFE_TYPES.has(stats.type) || !isInside(root, relative)) {
        rejected.push(normalizeRepoPath(relative));
        return false;
      }

      const repoPath = normalizeRepoPath(relative);
      const isDir = stats.type === "Directory";
      const ignoredDir = ignoredDirOf(repoPath, isDir);
      if (ignoredDir) {
        skipIgnoredDir(ignoredDir);
        return false;
      }
      if (isDir) return true;

      const reason = isSecretPath(repoPath) ? "secret" : classifyFile(repoPath, stats.size ?? 0);
      if (reason) {
        skipped.push({ path: repoPath, reason });
        return false;
      }

      written += stats.size ?? 0;
      if (written > options.maxExtractedBytes) {
        tooBig = true;
        return false;
      }
      return true;
    },
  });

  if (tooBig) throw new SnapshotTooLarge();

  const limitations: string[] = [];
  if (rejected.length > 0) {
    limitations.push(
      `${rejected.length} unsafe archive entr${rejected.length === 1 ? "y was" : "ies were"} skipped (links or paths outside the repository).`,
    );
  }
  return { skipped, rejected, limitations };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Deletes one run's snapshot directory. */
export async function cleanupSnapshot(runId: string, baseDir = snapshotBaseDir()): Promise<void> {
  await rm(runDir(baseDir, runId), { recursive: true, force: true });
}

/**
 * Deletes leftover run directories older than `maxAgeMs` (worker startup, 03 §6).
 * Returns how many were removed.
 */
export async function cleanupStaleSnapshots(
  maxAgeMs = 60 * 60 * 1000,
  baseDir = snapshotBaseDir(),
  now = Date.now(),
): Promise<number> {
  let entries: string[];
  try {
    entries = await readdir(baseDir);
  } catch {
    return 0; // nothing extracted yet
  }
  let removed = 0;
  for (const name of entries) {
    const target = path.join(baseDir, name);
    try {
      const info = await stat(target);
      if (now - info.mtimeMs > maxAgeMs) {
        await rm(target, { recursive: true, force: true });
        removed += 1;
      }
    } catch {
      // Removed concurrently; ignore.
    }
  }
  return removed;
}

export type DownloadOptions = {
  maxBytes?: number;
  baseDir?: string;
  /** Test seam: supplies the tarball stream instead of calling GitHub. */
  fetch?: (ref: RepoRef, sha: string) => Promise<Readable>;
};

/**
 * Downloads and extracts the repository at `sha` for one run.
 * The caller must invoke `cleanup()` in `finally`; on failure here the run
 * directory is removed before the error propagates.
 */
export async function downloadSnapshot(
  ref: RepoRef,
  sha: string,
  runId: string,
  options: DownloadOptions = {},
): Promise<Snapshot> {
  const baseDir = options.baseDir ?? snapshotBaseDir();
  const maxBytes = options.maxBytes ?? env.MAX_SNAPSHOT_MB * 1024 * 1024;
  const base = runDir(baseDir, runId);
  const dir = path.join(base, "repo");
  const archive = path.join(base, "repo.tar.gz");
  const cleanup = () => rm(base, { recursive: true, force: true });

  try {
    await mkdir(base, { recursive: true });
    const stream = await (options.fetch ?? fetchTarball)(ref, sha);
    await saveLimitedStream(stream, archive, maxBytes);
    const result = await extractSnapshot(archive, dir, {
      maxExtractedBytes: maxExtractedBytes(maxBytes),
    });
    // The archive is no longer needed once extracted.
    await rm(archive, { force: true });
    return { dir, ...result, cleanup };
  } catch (error) {
    await cleanup();
    throw error;
  }
}

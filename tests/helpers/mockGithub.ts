import path from "node:path";
import { Readable } from "node:stream";
import { downloadSnapshot } from "@/lib/github/snapshot";
import type { CompareResult, RepoRef } from "@/lib/github/repo";
import { entriesFromDir, makeTarGz, type TarEntry } from "./tarball";

/**
 * GitHub stand-ins (09 §2): branch heads, compare results and snapshots. The
 * snapshot goes through the real `downloadSnapshot` (safe extraction, filters,
 * cleanup) with the fixture tarball instead of a download.
 */

export const FIXTURE_DIR = path.join(__dirname, "..", "fixtures", "sample-next-app");

export function fixtureTarball(prefix: string, overrides: Record<string, string> = {}): Buffer {
  const entries: TarEntry[] = entriesFromDir(FIXTURE_DIR, prefix).map((entry) => {
    if (entry.type !== "file") return entry;
    const relative = entry.name.slice(prefix.length + 1);
    return relative in overrides ? { ...entry, content: overrides[relative] } : entry;
  });
  return makeTarGz(entries);
}

export function mockGithub(options: { baseDir: string }) {
  const state = {
    head: "1111111111111111111111111111111111111111",
    tarballs: new Map<string, Buffer>(),
    compare: null as CompareResult | null,
    calls: { head: 0, compare: 0, snapshot: 0 },
    snapshotDirs: [] as string[],
  };
  return {
    state,
    getBranchHeadSha: async () => {
      state.calls.head += 1;
      return state.head;
    },
    compareCommits: async (): Promise<CompareResult> => {
      state.calls.compare += 1;
      if (!state.compare) throw new Error("mockGithub: no compare result configured");
      return state.compare;
    },
    downloadSnapshot: async (ref: RepoRef, sha: string, runId: string) => {
      state.calls.snapshot += 1;
      const tarball = state.tarballs.get(sha);
      if (!tarball) throw new Error(`mockGithub: no tarball for ${sha}`);
      const snapshot = await downloadSnapshot(ref, sha, runId, {
        baseDir: options.baseDir,
        maxBytes: 5 * 1024 * 1024,
        fetch: async () => Readable.from([tarball]),
      });
      state.snapshotDirs.push(path.dirname(snapshot.dir));
      return snapshot;
    },
  };
}

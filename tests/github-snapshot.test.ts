import { existsSync, lstatSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { mkdir, rm, utimes } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  cleanupSnapshot,
  cleanupStaleSnapshots,
  downloadSnapshot,
  extractSnapshot,
  isInside,
  saveLimitedStream,
  SnapshotTooLarge,
} from "@/lib/github/snapshot";
import { MAX_FILE_BYTES } from "@/lib/repo/filters";
import { makeTarGz, type TarEntry } from "./helpers/tarball";

const ref = { installationId: 1, repoOwner: "acme", repoName: "app" };
let work: string;

beforeEach(() => {
  work = mkdtempSync(path.join(os.tmpdir(), "athenyx-test-"));
});
afterEach(async () => {
  await rm(work, { recursive: true, force: true });
});

function listFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => !e.isDirectory())
    .map((e) => path.relative(dir, path.join(e.parentPath, e.name)).split(path.sep).join("/"))
    .sort();
}

const hostile: TarEntry[] = [
  { type: "dir", name: "acme-app-abc123/" },
  { type: "file", name: "acme-app-abc123/a.ts", content: "export const a = 1;\n" },
  { type: "dir", name: "acme-app-abc123/src/" },
  { type: "file", name: "acme-app-abc123/src/b.ts", content: "export const b = 2;\n" },
  { type: "symlink", name: "acme-app-abc123/passwd", target: "/etc/passwd" },
  { type: "symlink", name: "acme-app-abc123/src/inner-link.ts", target: "../a.ts" },
  { type: "hardlink", name: "acme-app-abc123/hard.ts", target: "acme-app-abc123/a.ts" },
  { type: "file", name: "acme-app-abc123/../../escape.txt", content: "escaped" },
  { type: "file", name: "acme-app-abc123/src/../../../escape2.txt", content: "escaped" },
  { type: "file", name: "acme-app-abc123/.env", content: "SECRET=1" },
  { type: "file", name: "acme-app-abc123/.env.example", content: "SECRET=" },
  { type: "file", name: "acme-app-abc123/node_modules/pkg/index.js", content: "module.exports = 1" },
  { type: "file", name: "acme-app-abc123/node_modules/pkg/other.js", content: "module.exports = 2" },
  { type: "file", name: "acme-app-abc123/big.ts", content: "x".repeat(MAX_FILE_BYTES + 1) },
];

describe("extractSnapshot", () => {
  it("rejects symlinks, hardlinks and path-escape entries; skips secret/ignored/oversized files", async () => {
    const archive = path.join(work, "repo.tar.gz");
    writeFileSync(archive, makeTarGz(hostile));
    const dir = path.join(work, "run", "repo");

    const result = await extractSnapshot(archive, dir, { maxExtractedBytes: 10 * 1024 * 1024 });

    expect(listFiles(dir)).toEqual([".env.example", "a.ts", "src/b.ts"]);
    for (const file of listFiles(dir)) expect(lstatSync(path.join(dir, file)).isSymbolicLink()).toBe(false);
    expect(existsSync(path.join(work, "escape.txt"))).toBe(false);
    expect(existsSync(path.join(work, "run", "escape.txt"))).toBe(false);
    expect(existsSync(path.join(work, "escape2.txt"))).toBe(false);

    expect(result.rejected.sort()).toEqual(
      ["../../escape.txt", "hard.ts", "passwd", "src/../../../escape2.txt", "src/inner-link.ts"].sort(),
    );
    expect(result.skipped).toEqual(
      expect.arrayContaining([
        { path: ".env", reason: "secret" },
        { path: "node_modules/", reason: "ignored" },
        { path: "big.ts", reason: "too_large" },
      ]),
    );
    // One entry for the whole ignored directory.
    expect(result.skipped.filter((s) => s.path.startsWith("node_modules"))).toHaveLength(1);
    expect(result.limitations).toEqual([
      "5 unsafe archive entries were skipped (links or paths outside the repository).",
    ]);
  });

  it("fails when the extracted size exceeds the bound", async () => {
    const archive = path.join(work, "repo.tar.gz");
    writeFileSync(
      archive,
      makeTarGz([
        { type: "dir", name: "r/" },
        { type: "file", name: "r/a.ts", content: "a".repeat(1000) },
        { type: "file", name: "r/b.ts", content: "b".repeat(1000) },
      ]),
    );
    await expect(extractSnapshot(archive, path.join(work, "x"), { maxExtractedBytes: 1500 })).rejects.toBeInstanceOf(
      SnapshotTooLarge,
    );
  });
});

describe("isInside", () => {
  it("accepts nested paths and rejects escapes", () => {
    expect(isInside("/tmp/run", "src/a.ts")).toBe(true);
    expect(isInside("/tmp/run", "../a.ts")).toBe(false);
    expect(isInside("/tmp/run", "src/../../a.ts")).toBe(false);
    expect(isInside("/tmp/run", "/etc/passwd")).toBe(false);
    expect(isInside("/tmp/run", "C:/Windows")).toBe(false);
  });
});

describe("saveLimitedStream", () => {
  it("aborts over the limit and removes the partial file", async () => {
    const file = path.join(work, "big.tar.gz");
    const source = Readable.from([Buffer.alloc(600), Buffer.alloc(600)]);
    await expect(saveLimitedStream(source, file, 1000)).rejects.toThrow("Repository snapshot exceeds the size limit.");
    expect(existsSync(file)).toBe(false);
  });

  it("writes streams within the limit", async () => {
    const file = path.join(work, "ok.bin");
    expect(await saveLimitedStream(Readable.from([Buffer.alloc(400)]), file, 1000)).toBe(400);
    expect(existsSync(file)).toBe(true);
  });
});

describe("downloadSnapshot", () => {
  const tarball = () => makeTarGz(hostile.slice(0, 4));

  it("extracts into <base>/<runId>/repo and cleanup removes the run directory", async () => {
    const snapshot = await downloadSnapshot(ref, "abc123", "run1", {
      baseDir: work,
      maxBytes: 1024 * 1024,
      fetch: async () => Readable.from([tarball()]),
    });
    expect(snapshot.dir).toBe(path.join(work, "run1", "repo"));
    expect(listFiles(snapshot.dir)).toEqual(["a.ts", "src/b.ts"]);
    // The archive is deleted after extraction.
    expect(existsSync(path.join(work, "run1", "repo.tar.gz"))).toBe(false);

    await snapshot.cleanup();
    expect(existsSync(path.join(work, "run1"))).toBe(false);
    await snapshot.cleanup(); // idempotent
  });

  it("fails with the size message and leaves nothing behind", async () => {
    await expect(
      downloadSnapshot(ref, "abc123", "run2", {
        baseDir: work,
        maxBytes: 10,
        fetch: async () => Readable.from([tarball()]),
      }),
    ).rejects.toThrow("Repository snapshot exceeds the size limit.");
    expect(existsSync(path.join(work, "run2"))).toBe(false);
  });

  it("removes the run directory when fetching fails", async () => {
    await expect(
      downloadSnapshot(ref, "abc123", "run3", {
        baseDir: work,
        fetch: async () => {
          throw new Error("network down");
        },
        maxBytes: 1000,
      }),
    ).rejects.toThrow("network down");
    expect(existsSync(path.join(work, "run3"))).toBe(false);
  });

  it("refuses run ids that are not plain identifiers", async () => {
    await expect(downloadSnapshot(ref, "abc", "../evil", { baseDir: work, maxBytes: 10 })).rejects.toThrow(
      "Invalid run id",
    );
  });
});

describe("cleanup helpers", () => {
  it("cleanupSnapshot deletes one run directory", async () => {
    await mkdir(path.join(work, "runA", "repo"), { recursive: true });
    await cleanupSnapshot("runA", work);
    expect(existsSync(path.join(work, "runA"))).toBe(false);
  });

  it("cleanupStaleSnapshots removes only directories older than the max age", async () => {
    await mkdir(path.join(work, "old"), { recursive: true });
    await mkdir(path.join(work, "fresh"), { recursive: true });
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    await utimes(path.join(work, "old"), twoHoursAgo, twoHoursAgo);

    expect(await cleanupStaleSnapshots(60 * 60 * 1000, work)).toBe(1);
    expect(readdirSync(work)).toEqual(["fresh"]);
    expect(await cleanupStaleSnapshots(60 * 60 * 1000, path.join(work, "missing"))).toBe(0);
  });
});

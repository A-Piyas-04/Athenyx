import { mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { downloadSnapshot, type Snapshot } from "@/lib/github/snapshot";
import { buildContextBundle, expandContext, splitLines } from "@/lib/repo/context";
import { loadSnapshotText, readerFromMap, scanSnapshot, type SnapshotFiles } from "@/lib/repo/files";
import { createImportResolver, localImportsOf } from "@/lib/repo/imports";
import { buildProjectMap, type ProjectMap } from "@/lib/repo/mapper";
import { REDACTED } from "@/lib/repo/redact";
import { entriesFromDir, makeTarGz } from "./helpers/tarball";

/**
 * Phase 2 end-to-end: fixture repo → tarball → safe extraction → filters →
 * project map → context expansion → ContextBundle. No network, no AI.
 */

const FIXTURE = path.join(__dirname, "fixtures", "sample-next-app");
const PREFIX = "acme-sample-next-app-0123abc";
const SHA = "0123abc0123abc0123abc0123abc0123abc0123a";

let work: string;
let snapshot: Snapshot;
let files: SnapshotFiles;
let text: Map<string, string>;
let map: ProjectMap;

beforeAll(async () => {
  work = mkdtempSync(path.join(os.tmpdir(), "athenyx-fixture-"));
  const tarball = makeTarGz([
    ...entriesFromDir(FIXTURE, PREFIX),
    // What a real repository might also contain.
    { type: "file", name: `${PREFIX}/node_modules/left-pad/index.js`, content: "module.exports = () => {}" },
    { type: "file", name: `${PREFIX}/.next/cache/data.json`, content: "{}" },
    { type: "file", name: `${PREFIX}/.git/config`, content: "[core]" },
    { type: "file", name: `${PREFIX}/.env.local`, content: "LOCAL_SECRET=abc" },
  ]);
  snapshot = await downloadSnapshot(
    { installationId: 1, repoOwner: "acme", repoName: "sample-next-app" },
    SHA,
    "fixture-run",
    { baseDir: work, maxBytes: 5 * 1024 * 1024, fetch: async () => Readable.from([tarball]) },
  );
  files = await scanSnapshot(snapshot.dir, snapshot.skipped);
  text = await loadSnapshotText(files);
  map = buildProjectMap({ commitSha: SHA, files: files.files, read: readerFromMap(text) });
});

afterAll(async () => {
  await snapshot?.cleanup();
  await rm(work, { recursive: true, force: true });
});

describe("fixture snapshot filters", () => {
  it("keeps secret, ignored and binary files out of the readable set", () => {
    const readable = files.files.map((f) => f.path);
    expect(readable).not.toContain(".env");
    expect(readable).not.toContain(".env.local");
    expect(readable).not.toContain("public/logo.png");
    expect(readable.some((p) => p.startsWith("node_modules/") || p.startsWith(".next/") || p.startsWith(".git/"))).toBe(
      false,
    );
    expect(readable).toContain(".env.example");
    expect(files.excluded).toEqual(
      expect.arrayContaining([
        { path: ".env", reason: "secret" },
        { path: ".env.local", reason: "secret" },
        { path: "node_modules/", reason: "ignored" },
        { path: ".next/", reason: "ignored" },
        { path: ".git/", reason: "ignored" },
        { path: "public/logo.png", reason: "ignored" },
      ]),
    );
  });
});

describe("fixture project map", () => {
  it("detects nextjs, react, typescript and prisma", () => {
    expect(map.stack).toEqual(expect.arrayContaining(["nextjs", "react", "typescript", "prisma"]));
    expect(map.primarySupported).toBe(true);
    expect(map.usesAI).toBe(false);
    expect(map.testFiles).toEqual(["lib/format.test.ts"]);
    expect(map.entryPoints).toEqual(
      expect.arrayContaining(["app/api/expenses/[id]/route.ts", "app/page.tsx", "middleware.ts"]),
    );
    expect(map.configFiles).toEqual(expect.arrayContaining(["tsconfig.json", "next.config.mjs", "prisma/schema.prisma"]));
  });
});

describe("fixture imports", () => {
  it("resolves the @/lib/x alias", () => {
    const read = readerFromMap(text);
    const resolver = createImportResolver(files.files, read);
    expect(localImportsOf("app/api/expenses/[id]/route.ts", read, resolver)).toEqual(["lib/auth.ts", "lib/db.ts"]);
    expect(localImportsOf("lib/payments.ts", read, resolver)).toEqual(["lib/config.ts"]);
  });
});

describe("fixture context bundle", () => {
  function bundle(budgetTokens: number) {
    const read = readerFromMap(text);
    const candidates = expandContext({
      files: files.files,
      read,
      plannerFiles: ["app/api/expenses/[id]/route.ts", "lib/payments.ts", ".env", "lib/split.ts"],
      keywords: ["splitEvenly", "PAYMENTS_SECRET_KEY"],
    });
    return {
      candidates,
      bundle: buildContextBundle({
        projectMap: map,
        snapshot: { repo: "acme/sample-next-app", branch: "main", commitSha: SHA },
        candidates,
        read,
        budgetTokens,
        filterExclusions: files.excluded,
      }),
    };
  }

  it("never includes .env or node_modules content, and redacts secrets with line count preserved", () => {
    const { bundle: b, candidates } = bundle(30_000);
    const paths = candidates.map((c) => c.path);
    expect(paths).toContain("lib/config.ts"); // pulled in as an import of lib/payments.ts
    expect(paths).not.toContain(".env");

    expect(b.text).not.toContain("fixture_live_9c1d2e3f4a5b6c7d8e9f"); // .env value
    expect(b.text).not.toContain("module.exports = () => {}"); // node_modules content
    expect(b.text).not.toContain('<repository_file path=".env"');
    expect(b.text).not.toMatch(/<repository_file path="node_modules/);
    expect(b.text).toContain(".env (secret)");

    // lib/config.ts secret is redacted, its line count unchanged.
    expect(b.text).not.toContain("pk_fixture_3f9a8b7c6d5e4f10a1b2");
    const config = b.files.find((f) => f.path === "lib/config.ts")!;
    expect(config.totalLines).toBe(splitLines(text.get("lib/config.ts")!).length);
    expect(config.lines.join("\n")).toContain(`PAYMENTS_API_KEY = "${REDACTED}"`);
    expect(b.limitations).toContain("1 possible secret redacted");

    // The injection comment is just data inside a tag-wrapped block (if included at all).
    expect(b.text).toMatch(/^<project_map>/);
  });

  it("excludes lower-priority files with reason budget when the budget is small", () => {
    const { bundle: b } = bundle(3_000);
    const budgetExcluded = b.filesExcluded.filter((e) => e.reason === "budget");
    expect(budgetExcluded.length).toBeGreaterThan(0);
    expect(b.filesIncluded[0]).toBe("app/api/expenses/[id]/route.ts");
    for (const e of budgetExcluded) expect(b.filesIncluded).not.toContain(e.path);
  });
});

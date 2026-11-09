import { describe, expect, it } from "vitest";
import {
  buildProjectMap,
  isPrimarilyJsTs,
  NON_JS_LIMITATION,
  parsePackageManifest,
  projectMapLimitations,
  renderProjectMap,
  renderTree,
} from "@/lib/repo/mapper";

function mapOf(files: Record<string, string>) {
  const entries = Object.entries(files);
  return buildProjectMap({
    commitSha: "abc123",
    files: entries.map(([path, text]) => ({ path, size: text.length })),
    read: (p) => files[p] ?? null,
  });
}

const pkg = (deps: Record<string, string>, devDeps: Record<string, string> = {}) =>
  JSON.stringify({ name: "demo", dependencies: deps, devDependencies: devDeps, scripts: { dev: "next dev" } });

describe("buildProjectMap", () => {
  it("detects the stack from dependencies and files", () => {
    const map = mapOf({
      "package.json": pkg(
        { next: "15", react: "19", "@prisma/client": "5", stripe: "1", "next-auth": "5" },
        { tailwindcss: "4", vitest: "2" },
      ),
      "tsconfig.json": "{}",
      "app/page.tsx": "",
      "prisma/schema.prisma": "",
    });
    expect(map.stack).toEqual(
      expect.arrayContaining(["nextjs", "react", "typescript", "prisma", "tailwind", "vitest", "stripe", "nextauth"]),
    );
    expect(map.usesAI).toBe(false);
    expect(map.packageManifests[0]).toMatchObject({
      path: "package.json",
      name: "demo",
      dependencies: ["@prisma/client", "next", "next-auth", "react", "stripe"],
      devDependencies: ["tailwindcss", "vitest"],
      scripts: { dev: "next dev" },
    });
  });

  it("detects scoped prefix rules like @auth/*", () => {
    expect(mapOf({ "package.json": pkg({ "@auth/prisma-adapter": "1" }) }).stack).toContain("authjs");
  });

  it.each([["openai"], ["@anthropic-ai/sdk"], ["@langchain/core"], ["ai"], ["@google/generative-ai"]])(
    "sets usesAI for %s",
    (dep) => {
      expect(mapOf({ "package.json": pkg({ [dep]: "1" }), "a.ts": "" }).usesAI).toBe(true);
    },
  );

  it("does not treat names that merely contain 'ai' as AI usage", () => {
    expect(mapOf({ "package.json": pkg({ "tailwind-merge": "1", aiohttp: "1" }) }).usesAI).toBe(false);
  });

  it("classifies tests, CI, config and entry points", () => {
    const map = mapOf({
      "package.json": pkg({ next: "15" }),
      "app/page.tsx": "",
      "app/api/users/route.ts": "",
      "app/(auth)/login/page.tsx": "",
      "pages/index.tsx": "",
      "src/index.ts": "",
      "middleware.ts": "",
      "lib/x.ts": "",
      "lib/x.test.ts": "",
      "src/__tests__/a.ts": "",
      "e2e/login.spec.ts": "",
      "tests/fixtures/data.json": "",
      ".github/workflows/ci.yml": "",
      ".gitlab-ci.yml": "",
      "next.config.mjs": "",
      "tsconfig.json": "{}",
      "Dockerfile": "",
      "docker-compose.yml": "",
      "prisma/schema.prisma": "",
      "vercel.json": "",
    });
    expect([...map.testFiles].sort()).toEqual(["e2e/login.spec.ts", "lib/x.test.ts", "src/__tests__/a.ts"]);
    expect(map.ciFiles.sort()).toEqual([".github/workflows/ci.yml", ".gitlab-ci.yml"]);
    expect(map.configFiles).toEqual(
      expect.arrayContaining([
        "next.config.mjs",
        "tsconfig.json",
        "Dockerfile",
        "docker-compose.yml",
        "prisma/schema.prisma",
        ".github/workflows/ci.yml",
        "vercel.json",
      ]),
    );
    expect(map.entryPoints.sort()).toEqual(
      ["app/(auth)/login/page.tsx", "app/api/users/route.ts", "app/page.tsx", "middleware.ts", "pages/index.tsx", "src/index.ts"].sort(),
    );
    expect(map.entryPoints).not.toContain("lib/x.ts");
  });

  it("counts languages by extension and reports JS/TS as primary", () => {
    const map = mapOf({ "a.ts": "", "b.tsx": "", "c.js": "", "d.py": "", "README.md": "", "x.css": "" });
    expect(map.languages).toEqual({ TypeScript: 2, JavaScript: 1, Python: 1, CSS: 1 });
    expect(map.primarySupported).toBe(true);
    expect(projectMapLimitations(map)).toEqual([]);
  });

  it("flags non-JS repositories", () => {
    const map = mapOf({ "a.py": "", "b.py": "", "c.py": "", "web/app.js": "", "style.css": "", "s.css": "", "t.css": "" });
    expect(map.primarySupported).toBe(false);
    expect(projectMapLimitations(map)).toEqual([NON_JS_LIMITATION]);
  });

  it("treats a repository without code as unsupported", () => {
    expect(isPrimarilyJsTs({})).toBe(false);
  });

  it("survives a malformed package.json", () => {
    expect(parsePackageManifest("package.json", "{ not json")).toBeNull();
    const map = mapOf({ "package.json": "{ not json", "a.ts": "" });
    expect(map.packageManifests).toEqual([]);
    expect(map.fileCount).toBe(2);
  });
});

describe("renderTree / renderProjectMap", () => {
  it("expands small trees fully", () => {
    expect(renderTree(["a/b/c.ts", "a/d.ts", "e.ts"])).toBe(["a/", "  b/", "    c.ts", "  d.ts", "e.ts"].join("\n"));
  });

  it("collapses deep directories to stay within the line budget", () => {
    const paths = Array.from({ length: 50 }, (_, i) => `src/deep/nested/file${i}.ts`).concat(["README.md", "src/index.ts"]);
    const text = renderTree(paths, 10);
    expect(text.split("\n").length).toBeLessThanOrEqual(11);
    expect(text).toContain("(50 files)");
    expect(text).toContain("README.md");
  });

  it("renders a compact summary with dependency names only", () => {
    const map = mapOf({ "package.json": pkg({ next: "15.0.3" }), "app/page.tsx": "" });
    const text = renderProjectMap(map);
    expect(text).toContain("stack: nextjs, typescript");
    expect(text).toContain("dependencies: next");
    expect(text).not.toContain("15.0.3");
    expect(text).toContain("tree:");
  });
});

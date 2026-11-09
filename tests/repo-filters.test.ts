import { describe, expect, it } from "vitest";
import {
  classifyFile,
  classifyPath,
  ignoredDirOf,
  isBinaryContent,
  isSecretPath,
  isTestPath,
  MAX_FILE_BYTES,
} from "@/lib/repo/filters";

describe("classifyPath", () => {
  it.each([
    "node_modules/react/index.js",
    "packages/web/node_modules/x/a.ts",
    ".git/config",
    "dist/index.js",
    ".next/server/app.js",
    "coverage/lcov.info",
    "vendor/lib.php",
    "src/__pycache__/x.pyc",
    "bin/run",
  ])("ignores files in ignored directories: %s", (p) => {
    expect(classifyPath(p)).toBe("ignored");
  });

  it.each([
    "package-lock.json",
    "web/yarn.lock",
    "pnpm-lock.yaml",
    "bun.lockb",
    "public/app.min.js",
    "dist.js.map",
    "public/logo.png",
    "fonts/inter.woff2",
    "docs/spec.pdf",
    "release.zip",
    "src/__snapshots__/a.test.ts.snap",
  ])("ignores lockfiles, bundles and media: %s", (p) => {
    expect(classifyPath(p)).toBe("ignored");
  });

  it.each([
    ".env",
    ".env.local",
    "apps/api/.env.production",
    "certs/server.pem",
    "server.key",
    "cert.p12",
    "cert.pfx",
    "id_rsa",
    "id_rsa.pub",
    "android/release.keystore",
    "credentials.json",
    "service-account-prod.json",
    ".npmrc",
    ".netrc",
  ])("treats %s as a secret file", (p) => {
    expect(classifyPath(p)).toBe("secret");
    expect(isSecretPath(p)).toBe(true);
  });

  it.each([".env.example", ".env.sample", "config/.env.example"])("allows template %s", (p) => {
    expect(classifyPath(p)).toBeNull();
  });

  it("allows ordinary source files, including files named like ignored dirs", () => {
    expect(classifyPath("src/lib/split.ts")).toBeNull();
    expect(classifyPath("scripts/build")).toBeNull();
    expect(classifyPath("src/build.ts")).toBeNull();
    expect(classifyPath("src/distance.ts")).toBeNull();
  });
});

describe("ignoredDirOf", () => {
  it("returns the ignored directory prefix", () => {
    expect(ignoredDirOf("a/node_modules/b/c.js")).toBe("a/node_modules");
    expect(ignoredDirOf("src/x.ts")).toBeNull();
  });

  it("checks the last segment only for directories", () => {
    expect(ignoredDirOf("build")).toBeNull();
    expect(ignoredDirOf("build", true)).toBe("build");
  });
});

describe("classifyFile", () => {
  it("excludes files above the size limit", () => {
    expect(classifyFile("src/big.ts", MAX_FILE_BYTES + 1)).toBe("too_large");
    expect(classifyFile("src/ok.ts", MAX_FILE_BYTES)).toBeNull();
  });

  it("detects binary content by a null byte in the first 8KB", () => {
    expect(classifyFile("data.bin", 10, Buffer.from([1, 2, 0, 3]))).toBe("binary");
    expect(classifyFile("data.txt", 5, Buffer.from("hello"))).toBeNull();
  });

  it("only sniffs the first 8KB", () => {
    const late = Buffer.alloc(9000, 65);
    late[8500] = 0;
    expect(isBinaryContent(late)).toBe(false);
  });

  it("path rules win over size", () => {
    expect(classifyFile(".env", MAX_FILE_BYTES * 2)).toBe("secret");
  });
});

describe("isTestPath", () => {
  it.each(["src/a.test.ts", "a.spec.tsx", "src/__tests__/a.ts", "tests/x.ts", "e2e/login.ts", "test/a.js"])(
    "recognises %s",
    (p) => expect(isTestPath(p)).toBe(true),
  );
  it("rejects source files", () => {
    expect(isTestPath("src/testing.ts")).toBe(false);
    expect(isTestPath("src/latest.ts")).toBe(false);
  });
});

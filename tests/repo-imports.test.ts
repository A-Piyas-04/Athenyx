import { describe, expect, it } from "vitest";
import {
  createImportResolver,
  findImporters,
  loadPathAliases,
  localImportsOf,
  parseImportSpecifiers,
  parseJsonc,
  resolveImport,
} from "@/lib/repo/imports";

function repo(files: Record<string, string>) {
  const read = (p: string) => files[p] ?? null;
  return { read, resolver: createImportResolver(Object.keys(files), read) };
}

describe("parseImportSpecifiers", () => {
  it("finds static, side-effect, re-export, require and dynamic imports", () => {
    const source = `
      import React from "react";
      import { a, b } from './a';
      import type { T } from "../types";
      import * as ns from "@/lib/ns";
      import "./styles.css";
      export { x } from "./x";
      export * from './all';
      const legacy = require("./legacy");
      const lazy = await import("./lazy");
      import {
        multi,
        line,
      } from "./multi";
    `;
    expect(parseImportSpecifiers(source)).toEqual([
      "react",
      "./a",
      "../types",
      "@/lib/ns",
      "./styles.css",
      "./x",
      "./all",
      "./legacy",
      "./lazy",
      "./multi",
    ]);
  });
});

describe("resolveImport", () => {
  const { resolver } = repo({
    "src/lib/a.ts": "",
    "src/lib/b.tsx": "",
    "src/lib/util/index.ts": "",
    "src/lib/esm.ts": "",
    "src/app/page.tsx": "",
    "src/styles.css": "",
    "tsconfig.json": JSON.stringify({ compilerOptions: { paths: { "@/*": ["./src/*"] } } }),
  });

  it("resolves relative paths with extensions", () => {
    expect(resolveImport("src/app/page.tsx", "../lib/a", resolver)).toBe("src/lib/a.ts");
    expect(resolveImport("src/lib/a.ts", "./b", resolver)).toBe("src/lib/b.tsx");
  });

  it("resolves directory index files", () => {
    expect(resolveImport("src/lib/a.ts", "./util", resolver)).toBe("src/lib/util/index.ts");
  });

  it("maps .js specifiers to .ts sources", () => {
    expect(resolveImport("src/lib/a.ts", "./esm.js", resolver)).toBe("src/lib/esm.ts");
  });

  it("resolves exact files such as stylesheets", () => {
    expect(resolveImport("src/app/page.tsx", "../styles.css", resolver)).toBe("src/styles.css");
  });

  it("resolves tsconfig path aliases", () => {
    expect(resolveImport("src/app/page.tsx", "@/lib/a", resolver)).toBe("src/lib/a.ts");
    expect(resolveImport("src/app/page.tsx", "@/lib/util", resolver)).toBe("src/lib/util/index.ts");
  });

  it("ignores packages, missing files and paths outside the repository", () => {
    expect(resolveImport("src/app/page.tsx", "react", resolver)).toBeNull();
    expect(resolveImport("src/app/page.tsx", "@scope/pkg", resolver)).toBeNull();
    expect(resolveImport("src/app/page.tsx", "./missing", resolver)).toBeNull();
    expect(resolveImport("src/lib/a.ts", "../../../etc/passwd", resolver)).toBeNull();
    expect(resolveImport("src/lib/a.ts", "/abs/path", resolver)).toBeNull();
  });
});

describe("loadPathAliases", () => {
  it("parses JSONC with comments and trailing commas, honouring baseUrl", () => {
    const tsconfig = `{
      // comment
      "compilerOptions": {
        /* block */
        "baseUrl": "src",
        "paths": { "~/*": ["./*"], "#config": ["config/index.ts"], },
      },
    }`;
    expect(loadPathAliases((p) => (p === "tsconfig.json" ? tsconfig : null))).toEqual([
      { pattern: "~/*", targets: ["src/*"] },
      { pattern: "#config", targets: ["src/config/index.ts"] },
    ]);
  });

  it("keeps // inside strings", () => {
    expect(parseJsonc(`{ "url": "https://x.test" }`)).toEqual({ url: "https://x.test" });
  });

  it("falls back to jsconfig.json and tolerates broken configs", () => {
    const jsconfig = JSON.stringify({ compilerOptions: { paths: { "@/*": ["./*"] } } });
    expect(loadPathAliases((p) => (p === "jsconfig.json" ? jsconfig : null))).toEqual([
      { pattern: "@/*", targets: ["*"] },
    ]);
    expect(loadPathAliases((p) => (p === "tsconfig.json" ? "{ nope" : null))).toEqual([]);
  });
});

describe("localImportsOf / findImporters", () => {
  const files = {
    "tsconfig.json": JSON.stringify({ compilerOptions: { paths: { "@/*": ["./*"] } } }),
    "lib/split.ts": `export const split = 1;`,
    "lib/other.ts": `import { split } from "./split"; import x from "react";`,
    "app/page.tsx": `import { split } from "@/lib/split"; import { o } from "@/lib/other";`,
    "app/unrelated.ts": `const split = "./split"; // mentions split but imports nothing`,
    "README.md": `import { split } from "./lib/split"`,
  };
  const { read, resolver } = repo(files);

  it("returns resolved local imports only, unique and in order", () => {
    expect(localImportsOf("app/page.tsx", read, resolver)).toEqual(["lib/split.ts", "lib/other.ts"]);
    expect(localImportsOf("lib/other.ts", read, resolver)).toEqual(["lib/split.ts"]);
    expect(localImportsOf("README.md", read, resolver)).toEqual([]);
  });

  it("finds files that really import a target", () => {
    expect(findImporters("lib/split.ts", read, resolver).sort()).toEqual(["app/page.tsx", "lib/other.ts"]);
    expect(findImporters("lib/split.ts", read, resolver, 1)).toHaveLength(1);
  });
});

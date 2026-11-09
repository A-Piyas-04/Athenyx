import { describe, expect, it } from "vitest";
import { findTestsFor, searchKeyword, searchKeywords } from "@/lib/repo/search";

const files: Record<string, string> = {
  "lib/a.test.ts": "createPayment()",
  "lib/a.ts": "export function createPayment() {}",
  "lib/b.ts": "createPayment(); settleUp();",
  "lib/c.ts": "createPayment",
  "lib/d.ts": "createPayment",
  "lib/e.ts": "CREATEPAYMENT",
};
const paths = Object.keys(files);
const read = (p: string) => files[p] ?? null;

describe("searchKeyword", () => {
  it("is case-sensitive and capped at 3 hits per keyword", () => {
    const hits = searchKeyword("createPayment", paths, read);
    expect(hits).toEqual(["lib/a.ts", "lib/b.ts", "lib/c.ts"]);
    expect(hits).not.toContain("lib/e.ts");
  });

  it("prefers non-test files but falls back to tests", () => {
    const only = { "x.test.ts": "needle", "y.ts": "needle" };
    expect(searchKeyword("needle", Object.keys(only), (p) => only[p as keyof typeof only])).toEqual([
      "y.ts",
      "x.test.ts",
    ]);
  });

  it("treats regex metacharacters literally", () => {
    const src = { "a.ts": "value.(x)+", "b.ts": "valueXx" };
    expect(searchKeyword(".(x)+", Object.keys(src), (p) => src[p as keyof typeof src])).toEqual(["a.ts"]);
  });

  it("ignores too-short keywords and skipped files", () => {
    expect(searchKeyword("a", paths, read)).toEqual([]);
    expect(searchKeyword("createPayment", paths, read, { skip: new Set(["lib/a.ts"]) })).toEqual([
      "lib/b.ts",
      "lib/c.ts",
      "lib/d.ts",
    ]);
  });
});

describe("searchKeywords", () => {
  it("does not return the same file twice across keywords", () => {
    const hits = searchKeywords(["createPayment", "settleUp"], paths, read);
    const unique = new Set(hits.map((h) => h.path));
    expect(unique.size).toBe(hits.length);
    expect(hits.filter((h) => h.keyword === "settleUp")).toEqual([]);
  });
});

describe("findTestsFor", () => {
  it("finds sibling and __tests__ test files", () => {
    const set = new Set(["lib/x.ts", "lib/x.test.ts", "lib/__tests__/x.ts", "lib/y.spec.tsx", "lib/y.tsx"]);
    expect(findTestsFor("lib/x.ts", set).sort()).toEqual(["lib/__tests__/x.ts", "lib/x.test.ts"]);
    expect(findTestsFor("lib/y.tsx", set)).toEqual(["lib/y.spec.tsx"]);
    expect(findTestsFor("lib/x.test.ts", set)).toEqual([]);
  });
});

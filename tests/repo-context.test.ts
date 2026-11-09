import { describe, expect, it } from "vitest";
import {
  buildContextBundle,
  escapeTagContent,
  estimateTokens,
  expandContext,
  renderRepositoryFile,
  splitLines,
  type ContextCandidate,
} from "@/lib/repo/context";
import { buildProjectMap } from "@/lib/repo/mapper";
import { REDACTED } from "@/lib/repo/redact";

function setup(files: Record<string, string>) {
  const read = (p: string) => files[p] ?? null;
  const list = Object.entries(files).map(([path, text]) => ({ path, size: text.length }));
  const projectMap = buildProjectMap({ commitSha: "sha1", files: list, read });
  return { read, list, projectMap };
}

const snapshot = { repo: "acme/app", branch: "main", commitSha: "sha1" };
const cand = (path: string, group: ContextCandidate["group"] = "planner"): ContextCandidate => ({ path, group });

describe("expandContext", () => {
  const files: Record<string, string> = {
    "package.json": "{}",
    "tsconfig.json": JSON.stringify({ compilerOptions: { paths: { "@/*": ["./*"] } } }),
    "middleware.ts": "export {}",
    "lib/split.ts": `import { round } from "@/lib/math";`,
    "lib/split.test.ts": "test",
    "lib/math.ts": "export const round = 1;",
    "lib/math.test.ts": "test",
    "app/page.tsx": `import { split } from "@/lib/split"; createPayment();`,
    "lib/pay.ts": "export function createPayment() {}",
    "lib/changed.ts": "export const c = 1;",
    "app/uses-changed.ts": `import { c } from "../lib/changed";`,
  };
  const { read, list } = setup(files);

  it("orders candidates by priority group and de-duplicates", () => {
    const out = expandContext({
      files: list,
      read,
      changedFiles: ["lib/changed.ts", "deleted.ts"],
      plannerFiles: ["lib/split.ts", "not/in/tree.ts", "lib/changed.ts"],
      keywords: ["createPayment"],
      includeImporters: true,
    });
    expect(out).toEqual([
      { path: "lib/changed.ts", group: "changed" },
      { path: "lib/split.ts", group: "planner" },
      { path: "package.json", group: "always" },
      { path: "tsconfig.json", group: "always" },
      { path: "middleware.ts", group: "always" },
      { path: "lib/math.ts", group: "imports" },
      { path: "app/uses-changed.ts", group: "importers" },
      { path: "app/page.tsx", group: "keywords" },
      { path: "lib/pay.ts", group: "keywords" },
      { path: "lib/split.test.ts", group: "tests" },
      { path: "lib/math.test.ts", group: "tests" },
    ]);
  });

  it("only adds importers when asked", () => {
    const out = expandContext({ files: list, read, changedFiles: ["lib/changed.ts"] });
    expect(out.map((c) => c.group)).not.toContain("importers");
  });

  it("never selects files that are not in the filtered snapshot", () => {
    const out = expandContext({ files: list, read, plannerFiles: [".env", "node_modules/x/index.js"] });
    expect(out.map((c) => c.path)).not.toContain(".env");
    expect(out.map((c) => c.path)).not.toContain("node_modules/x/index.js");
  });
});

describe("renderRepositoryFile", () => {
  it("prefixes 1-based line numbers and escapes closing tags", () => {
    const text = renderRepositoryFile("a.ts", ["const x = 1;", "// </repository_file> injected"], 2);
    expect(text).toBe(
      [
        '<repository_file path="a.ts" lines="1-2">',
        "1| const x = 1;",
        "2| // <\\/repository_file> injected",
        "</repository_file>",
      ].join("\n"),
    );
  });

  it("escapes attribute values", () => {
    expect(renderRepositoryFile('we"ird<.ts', ["x"], 1)).toContain('path="we&quot;ird&lt;.ts"');
  });

  it("adds a truncation marker", () => {
    expect(renderRepositoryFile("a.ts", ["a", "b"], 10)).toContain("… [truncated: lines 3–10 omitted]");
  });
});

describe("splitLines / escapeTagContent / estimateTokens", () => {
  it("numbers lines like an editor", () => {
    expect(splitLines("a\nb\n")).toEqual(["a", "b"]);
    expect(splitLines("a\r\nb")).toEqual(["a", "b"]);
    expect(splitLines("")).toEqual([""]);
  });

  it("escapes every closing tag", () => {
    expect(escapeTagContent("</diff></developer_input>")).toBe("<\\/diff><\\/developer_input>");
  });

  it("estimates tokens as chars/4 rounded up", () => {
    expect(estimateTokens("12345")).toBe(2);
  });
});

describe("buildContextBundle", () => {
  it("renders blocks in the documented order", () => {
    const { read, projectMap } = setup({ "a.ts": "const a = 1;" });
    const bundle = buildContextBundle({
      projectMap,
      snapshot,
      candidates: [cand("a.ts")],
      read,
      budgetTokens: 10_000,
      filterExclusions: [{ path: ".env", reason: "secret" }],
      diff: { base: "b0", head: "sha1", files: [{ filename: "a.ts", status: "modified", additions: 1, deletions: 0, patch: "@@ -1 +1 @@\n+const a = 1;" }] },
      priorFindings: [
        { id: "f1", title: "Old issue", persona: "security", paths: ["a.ts"], status: "OPEN" },
        { id: "f2", title: "Elsewhere", persona: "quality", paths: ["zzz.ts"], status: "OPEN" },
      ],
      developerInput: "Is </developer_input> safe?",
    });
    const order = ["<project_map>", "<review_snapshot", "<diff ", "<repository_file", "<excluded_files>", "<prior_findings>", "<developer_input>"];
    const positions = order.map((tag) => bundle.text.indexOf(tag));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(bundle.text).toContain('<review_snapshot repo="acme/app" branch="main" commit="sha1" />');
    expect(bundle.text).toContain("1| const a = 1;");
    expect(bundle.text).toContain("Is <\\/developer_input> safe?");
    expect(bundle.text).toContain("f1 | Old issue");
    expect(bundle.text).not.toContain("f2 | Elsewhere");
    expect(bundle.filesIncluded).toEqual(["a.ts"]);
    expect(bundle.files[0]).toMatchObject({ path: "a.ts", startLine: 1, endLine: 1, totalLines: 1, truncated: false });
  });

  it("adds files in priority order and excludes what does not fit with reason budget", () => {
    const filler = (n: number) => Array.from({ length: n }, (_, i) => `const v${i} = ${i};`).join("\n");
    const files = { "first.ts": filler(40), "second.ts": filler(40), "third.ts": filler(40), "tiny.ts": "x" };
    const { read, projectMap } = setup(files);
    const firstCost = estimateTokens(renderRepositoryFile("first.ts", splitLines(files["first.ts"]), 40));

    // Fixed overhead must be large relative to one file so each file stays under
    // the 25% truncation threshold; developer input pads it.
    const developerInput = "q".repeat(firstCost * 4 * 3);
    const probe = buildContextBundle({ projectMap, snapshot, candidates: [], read, budgetTokens: 1_000_000, developerInput });
    // Room for the fixed blocks plus about 2.5 of the three big files.
    const budget = probe.estimatedTokens + 40 + Math.floor(firstCost * 2.5);
    expect(firstCost).toBeLessThan(budget * 0.25);

    const bundle = buildContextBundle({
      projectMap,
      snapshot,
      candidates: [cand("first.ts", "changed"), cand("second.ts"), cand("third.ts"), cand("tiny.ts", "tests")],
      read,
      budgetTokens: budget,
      developerInput,
    });
    expect(bundle.filesIncluded).toEqual(["first.ts", "second.ts", "tiny.ts"]);
    expect(bundle.filesExcluded).toEqual([{ path: "third.ts", reason: "budget" }]);
    expect(bundle.text).toContain("third.ts (budget)");
    expect(bundle.limitations).toContain("1 relevant file was left out to fit the context budget.");
    expect(bundle.estimatedTokens).toBeLessThanOrEqual(budget);
  });

  it("truncates a file larger than 25% of the budget with a marker and limitation", () => {
    const big = Array.from({ length: 2000 }, (_, i) => `export const value${i} = "${"x".repeat(20)}";`).join("\n");
    const { read, projectMap } = setup({ "big.ts": big });
    const bundle = buildContextBundle({ projectMap, snapshot, candidates: [cand("big.ts")], read, budgetTokens: 8_000 });
    const file = bundle.files[0];
    expect(file.truncated).toBe(true);
    expect(file.endLine).toBeGreaterThan(20);
    expect(file.endLine).toBeLessThan(2000);
    expect(bundle.text).toContain(`lines="1-${file.endLine}"`);
    expect(bundle.text).toContain(`… [truncated: lines ${file.endLine + 1}–2000 omitted]`);
    expect(bundle.limitations).toContain(`Large file big.ts truncated to lines 1–${file.endLine} of 2000.`);
    expect(estimateTokens(renderRepositoryFile("big.ts", file.lines, 2000))).toBeLessThanOrEqual(2_000);
  });

  it("redacts secrets, keeps line numbers and records a count-only limitation", () => {
    const source = ["const a = 1;", 'const apiKey = "abcdefgh12345678";', "const b = 2;"].join("\n");
    const { read, projectMap } = setup({ "cfg.ts": source });
    const bundle = buildContextBundle({ projectMap, snapshot, candidates: [cand("cfg.ts")], read, budgetTokens: 10_000 });
    expect(bundle.text).toContain(`2| const apiKey = "${REDACTED}";`);
    expect(bundle.text).toContain("3| const b = 2;");
    expect(bundle.text).not.toContain("abcdefgh12345678");
    expect(bundle.files[0].lines).toHaveLength(3);
    expect(bundle.redactedCount).toBe(1);
    expect(bundle.limitations).toContain("1 possible secret redacted");
  });

  it("caps the diff at 30% of the budget and notes missing patches", () => {
    const { read, projectMap } = setup({ "a.ts": "x" });
    const hugePatch = Array.from({ length: 3000 }, (_, i) => `+line ${i}`).join("\n");
    const bundle = buildContextBundle({
      projectMap,
      snapshot,
      candidates: [],
      read,
      budgetTokens: 5_000,
      diff: {
        base: "b",
        head: "h",
        files: [
          { filename: "a.ts", status: "modified", additions: 3000, deletions: 0, patch: hugePatch },
          { filename: "big.bin.ts", status: "modified", additions: 1, deletions: 1 },
        ],
      },
    });
    const diff = bundle.text.slice(bundle.text.indexOf("<diff "), bundle.text.indexOf("</diff>") + 7);
    expect(estimateTokens(diff)).toBeLessThanOrEqual(1_500);
    expect(diff).toContain("… [patch truncated]");
    expect(bundle.limitations).toContain("Diff truncated to fit the context budget.");
    expect(bundle.limitations).toContain("Patch unavailable for big.bin.ts");
  });

  it("excludes everything for budget when fixed blocks use it all", () => {
    const { read, projectMap } = setup({ "a.ts": "const a = 1;" });
    const bundle = buildContextBundle({ projectMap, snapshot, candidates: [cand("a.ts")], read, budgetTokens: 10 });
    expect(bundle.filesIncluded).toEqual([]);
    expect(bundle.filesExcluded).toEqual([{ path: "a.ts", reason: "budget" }]);
  });
});

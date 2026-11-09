import { describe, expect, it } from "vitest";
import type { FindingOut } from "@/lib/ai/schemas";
import type { IncludedFile } from "@/lib/repo/context";
import { locateQuote, validateEvidence, validatePersonaFindings, type ValidationContext } from "@/lib/review/validate";

const SHA = "a".repeat(40);

const routeLines = [
  'import { getSession } from "@/lib/auth";', //  1
  'import { db } from "@/lib/db";', //  2
  "", //  3
  "export async function DELETE(req: Request, { params }: Ctx) {", //  4
  "  const session = await getSession(req);", //  5
  "  if (!session) return new Response(null, { status: 401 });", //  6
  "  const { id } = await params;", //  7
  "  await db.expense.delete({ where: { id } });", //  8
  "  return new Response(null, { status: 204 });", //  9
  "}", // 10
  ...Array.from({ length: 30 }, (_, i) => `// filler ${i + 11}`), // 11..40
];

function file(path: string, lines: string[]): IncludedFile {
  return { path, startLine: 1, endLine: lines.length, totalLines: lines.length, truncated: false, lines };
}

const ctx: ValidationContext = {
  reviewType: "PROJECT_HEALTH",
  commitSha: SHA,
  files: new Map([["app/api/expenses/[id]/route.ts", file("app/api/expenses/[id]/route.ts", routeLines)]]),
  priorFindingIds: new Set(["prior-1"]),
};

function finding(over: Partial<FindingOut> = {}): FindingOut {
  return {
    existingFindingId: null,
    title: "Expense delete lacks ownership check",
    observation: "Any signed-in user can delete any expense.",
    impact: "Data loss.",
    classification: "VERIFIED_DEFECT",
    severity: "HIGH",
    confidence: "HIGH",
    evidence: [
      {
        path: "app/api/expenses/[id]/route.ts",
        startLine: 8,
        endLine: 8,
        symbol: "DELETE",
        quote: "await db.expense.delete({ where: { id } });",
      },
    ],
    userPremise: null,
    options: [
      { title: "Check group membership", description: "d", pros: ["p"], cons: ["c"], effort: "SMALL" },
      { title: "Scope the query", description: "d", pros: [], cons: [], effort: null },
    ],
    recommendation: { optionIndex: 0, rationale: "Simplest." },
    verification: "Try deleting another group's expense.",
    ...over,
  };
}

describe("locateQuote", () => {
  it("matches the cited range with whitespace normalisation", () => {
    expect(locateQuote(routeLines, 8, 8, "await   db.expense.delete({ where: { id } });")).toEqual({ startLine: 8, endLine: 8 });
  });

  it("re-anchors a quote within ±10 lines and narrows to the matching lines", () => {
    expect(locateQuote(routeLines, 15, 15, "await db.expense.delete({ where: { id } });")).toEqual({ startLine: 8, endLine: 8 });
  });

  it("strips copied line-number prefixes from quotes", () => {
    expect(locateQuote(routeLines, 5, 6, "5| const session = await getSession(req);\n6|   if (!session)")).toEqual({
      startLine: 5,
      endLine: 6,
    });
  });

  it("beyond ±10 lines, anchors only a quote that occurs exactly once; rejects trivial quotes", () => {
    expect(locateQuote(routeLines, 30, 30, "await db.expense.delete({ where: { id } });")).toEqual({ startLine: 8, endLine: 8 });
    const twice = Array.from({ length: 50 }, (_, i) => (i === 29 || i === 39 ? "total = compute();" : `line ${i + 1}`));
    expect(locateQuote(twice, 1, 1, "total = compute();")).toBeNull(); // two matches, none near → ambiguous
    expect(locateQuote(routeLines, 10, 10, "}")).toBeNull();
  });

  it("matches JSX closing tags shown escaped and quotes copied from a diff", () => {
    const jsx = ["<div>", "  <span>{total}</span>", "</div>"];
    expect(locateQuote(jsx, 2, 2, "<span>{total}<\\/span>")).toEqual({ startLine: 2, endLine: 2 });
    expect(locateQuote(routeLines, 8, 8, "+  await db.expense.delete({ where: { id } });")).toEqual({ startLine: 8, endLine: 8 });
  });
});

describe("validateEvidence", () => {
  it("drops evidence citing files that were not included in the context", () => {
    const { evidence, dropped } = validateEvidence(
      [{ path: "lib/secret.ts", startLine: 1, endLine: 2, symbol: null, quote: "anything here" }],
      ctx,
    );
    expect(evidence).toEqual([]);
    expect(dropped).toBe(1);
  });

  it("drops out-of-range or unmatched quotes", () => {
    const { evidence } = validateEvidence(
      [{ path: "app/api/expenses/[id]/route.ts", startLine: 500, endLine: 510, symbol: null, quote: "requireOwner(session)" }],
      ctx,
    );
    expect(evidence).toEqual([]);
  });

  it("replaces the model's quote with the snapshot lines and attaches the SHA", () => {
    const { evidence } = validateEvidence(
      [{ path: "./app/api/expenses/[id]/route.ts", startLine: 7, endLine: 8, symbol: "DELETE", quote: "db.expense.delete" }],
      ctx,
    );
    expect(evidence).toEqual([
      {
        path: "app/api/expenses/[id]/route.ts",
        startLine: 8,
        endLine: 8,
        symbol: "DELETE",
        snippet: "  await db.expense.delete({ where: { id } });",
        commitSha: SHA,
      },
    ]);
  });

  it("clamps evidence to at most 30 lines", () => {
    const long = Array.from({ length: 60 }, (_, i) => `line number ${i + 1}`);
    const files = new Map([["x.ts", file("x.ts", long)]]);
    const quote = long.slice(0, 40).join("\n");
    const { evidence } = validateEvidence([{ path: "x.ts", startLine: 1, endLine: 40, symbol: null, quote }], { files, commitSha: SHA });
    expect(evidence[0].endLine - evidence[0].startLine).toBe(29);
    expect(evidence[0].snippet.split("\n")).toHaveLength(30);
  });

  it("only sees the lines that were shown for a truncated file", () => {
    const shown = file("big.ts", ["const a = 1;", "const b = 2;"]);
    const files = new Map([["big.ts", { ...shown, totalLines: 500, truncated: true }]]);
    const { evidence } = validateEvidence(
      [{ path: "big.ts", startLine: 300, endLine: 300, symbol: null, quote: "const hidden = 3;" }],
      { files, commitSha: SHA },
    );
    expect(evidence).toEqual([]);
  });
});

describe("validatePersonaFindings", () => {
  it("keeps a well-evidenced verified defect", () => {
    const { findings } = validatePersonaFindings("security", "gemini:m", [finding()], ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ classification: "VERIFIED_DEFECT", severity: "HIGH", persona: "security", model: "gemini:m" });
  });

  it("drops findings without valid evidence and counts them", () => {
    const result = validatePersonaFindings(
      "security",
      null,
      [finding({ evidence: [{ path: "nope.ts", startLine: 1, endLine: 1, symbol: null, quote: "made up code" }] })],
      ctx,
    );
    expect(result.findings).toEqual([]);
    expect(result.unsupportedRemoved).toBe(1);
  });

  it("keeps evidence-less findings with a userPremise for PROPOSAL/ISSUE, downgraded", () => {
    const premise = finding({ evidence: [], userPremise: "The proposal caches balances in Redis.", confidence: "HIGH" });
    const proposal = validatePersonaFindings("architecture", null, [premise], { ...ctx, reviewType: "PROPOSAL" });
    expect(proposal.findings[0]).toMatchObject({ classification: "DESIGN_CONCERN", confidence: "MEDIUM", evidence: [] });

    const issue = validatePersonaFindings("reliability", null, [premise], { ...ctx, reviewType: "ISSUE" });
    expect(issue.findings[0]).toMatchObject({ classification: "POTENTIAL_RISK", confidence: "MEDIUM" });

    const health = validatePersonaFindings("architecture", null, [premise], ctx);
    expect(health.findings).toEqual([]);
  });

  it("downgrades VERIFIED_DEFECT without HIGH confidence, and CRITICAL with LOW confidence", () => {
    const { findings } = validatePersonaFindings(
      "security",
      null,
      [finding({ confidence: "MEDIUM" }), finding({ title: "Other", severity: "CRITICAL", confidence: "LOW" })],
      ctx,
    );
    expect(findings[0].classification).toBe("POTENTIAL_RISK");
    expect(findings[1]).toMatchObject({ severity: "HIGH", classification: "POTENTIAL_RISK" });
  });

  it("nulls unknown existingFindingIds and keeps known ones", () => {
    const { findings } = validatePersonaFindings(
      "security",
      null,
      [finding({ existingFindingId: "made-up" }), finding({ existingFindingId: "prior-1" })],
      ctx,
    );
    expect(findings.map((f) => f.existingFindingId)).toEqual([null, "prior-1"]);
  });

  it("truncates options to 3 and drops out-of-range recommendations", () => {
    const four = Array.from({ length: 4 }, (_, i) => ({ title: `o${i}`, description: "", pros: [], cons: [], effort: null }));
    const { findings } = validatePersonaFindings(
      "security",
      null,
      [finding({ options: four, recommendation: { optionIndex: 3, rationale: "" } })],
      ctx,
    );
    expect(findings[0].options).toHaveLength(3);
    expect(findings[0].recommendation).toBeNull();
  });

  it("keeps at most 4 findings per persona and caps title length", () => {
    const many = Array.from({ length: 6 }, (_, i) => finding({ title: `${"T".repeat(150)} ${i}` }));
    const { findings } = validatePersonaFindings("security", null, many, ctx);
    expect(findings).toHaveLength(4);
    expect(findings[0].title.length).toBeLessThanOrEqual(100);
  });
});

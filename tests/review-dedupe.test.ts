import { describe, expect, it } from "vitest";
import { dedupeFindings, sortAndCap, titleSimilarity } from "@/lib/review/dedupe";
import { resolveLinks } from "@/lib/review/store";
import type { ValidatedFinding } from "@/lib/review/validate";

const SHA = "b".repeat(40);

function vf(over: Partial<ValidatedFinding> = {}): ValidatedFinding {
  return {
    persona: "security",
    model: null,
    existingFindingId: null,
    title: "Expense delete lacks ownership check",
    observation: "Observation.",
    impact: "Impact.",
    classification: "POTENTIAL_RISK",
    severity: "HIGH",
    confidence: "HIGH",
    evidence: [{ path: "app/api/expenses/[id]/route.ts", startLine: 5, endLine: 8, symbol: null, snippet: "x", commitSha: SHA }],
    userPremise: null,
    options: [{ title: "A", description: "", pros: [], cons: [], effort: null }],
    recommendation: null,
    verification: "",
    alsoRaisedBy: [],
    ...over,
  };
}

describe("title similarity", () => {
  it("ignores case, punctuation and stopwords", () => {
    expect(titleSimilarity("Missing ownership check on expense delete", "Expense DELETE route: no ownership check")).toBeGreaterThanOrEqual(0.5);
    expect(titleSimilarity("Float money math loses cents", "Expense delete lacks ownership check")).toBe(0);
  });
});

describe("dedupeFindings", () => {
  it("merges overlapping findings with similar titles, keeping the higher severity", () => {
    const security = vf({ severity: "HIGH" });
    const quality = vf({
      persona: "quality",
      title: "Ownership check missing for expense delete",
      severity: "CRITICAL",
      evidence: [
        { path: "app/api/expenses/[id]/route.ts", startLine: 7, endLine: 9, symbol: null, snippet: "y", commitSha: SHA },
        { path: "lib/auth.ts", startLine: 1, endLine: 3, symbol: null, snippet: "z", commitSha: SHA },
      ],
      options: [
        { title: "A", description: "", pros: [], cons: [], effort: null },
        { title: "B", description: "", pros: [], cons: [], effort: null },
      ],
      recommendation: { optionIndex: 1, rationale: "B" },
    });
    const [merged, ...rest] = dedupeFindings([security, quality]);
    expect(rest).toEqual([]);
    expect(merged.severity).toBe("CRITICAL");
    expect(merged.persona).toBe("quality");
    expect(merged.evidence).toHaveLength(3);
    expect(merged.options).toHaveLength(2);
    expect(merged.recommendation?.optionIndex).toBe(1);
    expect(merged.observation).toContain("(Also raised by: Security Adversary)");
  });

  it("keeps non-overlapping or dissimilar findings apart", () => {
    const a = vf();
    const otherLines = vf({ title: a.title, evidence: [{ ...a.evidence[0], startLine: 30, endLine: 35 }] });
    const otherTitle = vf({ title: "Response leaks internal error details" });
    expect(dedupeFindings([a, otherLines, otherTitle])).toHaveLength(3);
  });

  it("never merges premise-only findings by overlap, but merges the same existing id", () => {
    const premise = vf({ evidence: [], userPremise: "p" });
    expect(dedupeFindings([premise, { ...premise }])).toHaveLength(2);
    expect(dedupeFindings([vf({ existingFindingId: "f1" }), vf({ existingFindingId: "f1", title: "Different words" })])).toHaveLength(1);
  });
});

describe("sortAndCap", () => {
  it("sorts by severity then confidence and caps the count", () => {
    const findings = [
      vf({ title: "low", severity: "LOW" }),
      vf({ title: "high-med", severity: "HIGH", confidence: "MEDIUM" }),
      vf({ title: "high-high", severity: "HIGH", confidence: "HIGH" }),
      vf({ title: "crit", severity: "CRITICAL" }),
    ];
    const { kept, omitted } = sortAndCap(findings, 3);
    expect(kept.map((f) => f.title)).toEqual(["crit", "high-high", "high-med"]);
    expect(omitted).toBe(1);
  });
});

describe("resolveLinks", () => {
  const prior = [
    {
      id: "old-1",
      title: "Missing ownership check on expense delete",
      status: "OPEN" as const,
      evidence: [{ path: "app/api/expenses/[id]/route.ts", startLine: 6, endLine: 8, symbol: null, snippet: "", commitSha: "c" }],
    },
  ];

  it("links to the model's existing id, or to a matching prior finding", () => {
    expect(resolveLinks([vf({ existingFindingId: "old-1" })], prior)).toEqual(["old-1"]);
    expect(resolveLinks([vf()], prior)).toEqual(["old-1"]);
    expect(resolveLinks([vf({ title: "Unrelated risk entirely" })], prior)).toEqual([null]);
  });

  it("never links two new findings to the same stored finding", () => {
    expect(resolveLinks([vf(), vf({ existingFindingId: "old-1" })], prior)).toEqual(["old-1", null]);
  });
});

/* eslint-disable @typescript-eslint/no-explicit-any */
// Branch-only data adapter for the real Athenyx pages. No Prisma connection is opened.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const stateFile = join(process.cwd(), "tmp", "athenyx-preview-state.json");
const now = Date.now();
const hours = (n: number) => new Date(now - n * 3_600_000);
const sha = "9f8e7d6a38a2df04b195a09d9cf8f71234567890";
const oldSha = "31a2b89a38a2df04b195a09d9cf8f71234567890";
const projectId = "preview-project";
const userId = "preview-user";

function finding(id: string, title: string, severity: string, persona: string, path: string, line: number, observation: string, options: string[], status = "OPEN", classification = "VERIFIED_DEFECT") {
  return {
    id, projectId, firstSeenRunId: "preview-health", lastSeenRunId: "preview-ask", lastSeenSha: sha,
    persona, model: "Preview sample", title, observation, impact: "This can affect data accuracy or user trust.",
    classification, severity, confidence: "HIGH", status, statusNote: null, userPremise: null,
    evidence: [{ path, startLine: line, endLine: line + 1, symbol: null, snippet: "const record = await db.findUnique({ where: { id } });\nawait db.update({ where: { id }, data });", commitSha: sha }],
    options: options.map((text, i) => ({ title: text, description: i ? "A broader change that may need more testing." : "A focused fix at the affected code path.", pros: i ? ["Reusable across related routes"] : ["Small change", "Easy to verify"], cons: i ? ["Larger implementation effort"] : ["Other routes need their own checks"], effort: i ? "MEDIUM" : "SMALL" })),
    recommendation: { optionIndex: 0, rationale: "Addresses the observed issue with the smallest change." },
    verification: "Add a regression test for the affected case and confirm the result on a new commit.",
    chosenOptionIndex: null, createdAt: hours(48), updatedAt: hours(10),
  };
}

function seed() {
  const project = {
    id: projectId, userId, installationId: 1, repoId: 1, repoOwner: "acme", repoName: "splitwise-lite",
    defaultBranch: "main", selectedBranch: "main", latestKnownSha: sha, latestCheckedAt: hours(1),
    lastReviewedSha: oldSha, lastReviewedAt: hours(10), projectMap: null, createdAt: hours(72), updatedAt: hours(10),
  };
  const findings = [
    finding("preview-f1", "Expense delete checks login, not ownership", "CRITICAL", "security", "app/api/expenses/[id]/route.ts", 48, "The route checks for a session but does not confirm that the user belongs to the expense's group.", ["Check group membership before deleting", "Centralize expense authorization in a shared helper"]),
    finding("preview-f2", "Expense update allows changing another group's expense", "HIGH", "security", "app/api/expenses/[id]/route.ts", 89, "The update route accepts an expense id without checking that the current user belongs to its group.", ["Verify group membership before update", "Scope the update query to accessible group ids"]),
    finding("preview-f3", "Uneven splits lose a cent", "HIGH", "data_integrity", "lib/split.ts", 32, "Rounding each participant's share independently can leave the total one cent short.", ["Distribute the remainder across the first shares", "Store amounts as integer cents"]),
    finding("preview-f4", "Group invitation tokens never expire", "MEDIUM", "security", "app/api/groups/route.ts", 121, "Invitation tokens remain valid indefinitely.", ["Add an expiration time", "Rotate tokens when resent"], "OPEN", "POTENTIAL_RISK"),
    finding("preview-f5", "Balance updates are not transactional", "MEDIUM", "data_integrity", "lib/balances.ts", 74, "A failure between expense creation and balance update can leave balances inconsistent.", ["Wrap both writes in one transaction", "Recalculate balances from expenses"], "OPEN", "POTENTIAL_RISK"),
    finding("preview-f6", "Split calculation has no boundary tests", "LOW", "quality", "tests/split.test.ts", 1, "The tests do not cover odd totals, one cent, or many participants.", ["Add table-driven boundary cases", "Add property tests for total preservation"], "OPEN", "DESIGN_CONCERN"),
    finding("preview-f7", "Guest access remains after invitation revocation", "MEDIUM", "security", "lib/invitations.ts", 56, "Revoking a link does not remove existing guest memberships.", ["Remove guest memberships on revocation"], "ACCEPTED_RISK", "POTENTIAL_RISK"),
    finding("preview-f8", "Duplicate deliveries create extra entries", "LOW", "reliability", "app/api/webhooks/route.ts", 24, "A delivery id guard was added to prevent duplicate entries.", ["Keep the idempotency guard"], "RESOLVED"),
  ];
  const baseRun = { projectId, status: "COMPLETED", stage: "DONE", branch: "main", commitSha: sha, baseSha: null, input: {}, personas: ["security", "data_integrity", "quality"], personaStatus: { security: "done", data_integrity: "done", quality: "done" }, coverage: { filesIncluded: ["app/api/expenses/[id]/route.ts", "lib/split.ts", "lib/balances.ts"], filesExcluded: [], limitations: [], specialists: [] }, answer: null, verdict: null, releaseReport: null, error: null, usage: null, degraded: false, heartbeatAt: null, createdAt: hours(10), startedAt: hours(10), finishedAt: hours(10) };
  const runs = [
    { ...baseRun, id: "preview-ask", type: "ASK", input: { question: "How is expense access controlled?" }, answer: "Expense authorization is currently checked at the session level. The route should also verify membership in the expense's group.", summary: "Authorization is only checked at the session level." },
    { ...baseRun, id: "preview-health", type: "PROJECT_HEALTH", commitSha: oldSha, createdAt: hours(48), finishedAt: hours(48), summary: "Six risks were found across expense access, split calculations and invitation handling." },
    { ...baseRun, id: "preview-release", type: "RELEASE", verdict: "CONDITIONAL_GO", createdAt: hours(12), finishedAt: hours(12), summary: "Release only after reviewing the critical access finding and high severity defects.", releaseReport: { conditions: ["Resolve the critical authorization issue", "Verify split totals in tests"], blockingFindingIds: ["preview-f1", "preview-f2", "preview-f3"], ciEvidence: { unavailable: false, checks: [{ name: "build", status: "completed", conclusion: "success" }], combinedStatus: "success", totalCount: 1 }, testsPresent: true, acceptedRisks: 1, limitations: [] } },
  ];
  const decisions = [{ id: "preview-decision", projectId, title: "Distribute rounding remainder to first shares", context: "Uneven splits lose a cent.", chosenOption: "Distribute the remainder across the first shares", rationale: "Keeps the total exact without a reconciliation step.", alternatives: [{ title: "Round each share", whyNot: "Does not preserve the total." }], constraints: null, assumptions: null, relatedFiles: ["lib/split.ts"], status: "PROPOSED", commitSha: sha, supersededById: null, createdAt: hours(8), updatedAt: hours(8) }];
  return { project: [project], finding: findings, reviewRun: runs, decision: decisions, decisionFinding: [{ decisionId: "preview-decision", findingId: "preview-f3" }], findingCheck: [] as any[] };
}

type Store = ReturnType<typeof seed>;
let store: Store = seed();
let nextId = 1;
function load() {
  try {
    store = JSON.parse(readFileSync(stateFile, "utf8"), (key, value) =>
      key.endsWith("At") && typeof value === "string" ? new Date(value) : value,
    ) as Store;
    const ids = [...store.reviewRun, ...store.decision, ...store.findingCheck].map((row) => Number(String(row.id).match(/preview-(?:new|run|check)-(\d+)/)?.[1] || 0));
    nextId = Math.max(nextId, ...ids.map((id) => id + 1));
  } catch {
    store = seed();
    save();
  }
}
function save() {
  mkdirSync(join(process.cwd(), "tmp"), { recursive: true });
  writeFileSync(stateFile, JSON.stringify(store));
}
// Not loaded at import: `db.ts` imports this module unconditionally, and normal
// mode must not touch the filesystem. Every read and write calls `load()` first.

const fields = (row: any, shape: any) => {
  if (!shape) return row;
  const result: any = {};
  for (const [key, spec] of Object.entries(shape)) {
    if (!spec) continue;
    if (key === "_count") { result._count = { findings: store.finding.filter((f) => f.projectId === row.id && ["OPEN", "IN_PROGRESS"].includes(f.status)).length, findingLinks: store.decisionFinding.filter((l) => l.decisionId === row.id).length }; continue; }
    if (key === "firstSeenRun") result[key] = fields(store.reviewRun.find((r) => r.id === row.firstSeenRunId), (spec as any).select);
    else if (key === "checks") result[key] = store.findingCheck.filter((c) => c.findingId === row.id);
    else if (key === "decisionLinks") result[key] = store.decisionFinding.filter((l) => l.findingId === row.id).map((l) => ({ ...l, decision: fields(store.decision.find((d) => d.id === l.decisionId), (spec as any).include?.decision?.select) }));
    else if (key === "findingLinks") result[key] = store.decisionFinding.filter((l) => l.decisionId === row.id).map((l) => ({ ...l, finding: fields(store.finding.find((f) => f.id === l.findingId), (spec as any).include?.finding?.select) }));
    else if (key === "finding") result[key] = fields(store.finding.find((f) => f.id === row.findingId), (spec as any).select);
    else result[key] = row[key];
  }
  return result;
};
const enumOrder: Record<string, string[]> = { severity: ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"], status: ["OPEN", "IN_PROGRESS", "RESOLVED", "ACCEPTED_RISK", "DISMISSED"], confidence: ["HIGH", "MEDIUM", "LOW"] };
function match(row: any, where: any): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, value]) => {
    if (key === "OR") return (value as any[]).some((v) => match(row, v));
    if (key === "AND") return (value as any[]).every((v) => match(row, v));
    if (key === "NOT") return !match(row, value);
    if (key === "finding") return match(store.finding.find((f) => f.id === row.findingId), value);
    if (key === "project") return match(store.project.find((p) => p.id === row.projectId), value);
    if (key === "userId_repoId") return match(row, value);
    const actual = row?.[key];
    if (value && typeof value === "object" && !(value instanceof Date) && !Array.isArray(value)) {
      const v = value as any;
      if ("in" in v) return v.in.includes(actual);
      if ("notIn" in v) return !v.notIn.includes(actual);
      if ("not" in v) return actual !== v.not;
      if ("contains" in v) return String(actual || "").toLowerCase().includes(String(v.contains).toLowerCase());
      if ("gte" in v) return actual >= v.gte;
      return match(actual, value);
    }
    return actual === value;
  });
}
function query(model: keyof Store, args: any = {}) {
  load();
  let rows: any[] = [...store[model]].filter((row) => match(row, args.where));
  if (args.distinct) rows = rows.filter((row, i) => rows.findIndex((other) => args.distinct.every((k: string) => other[k] === row[k])) === i);
  const sorts = Array.isArray(args.orderBy) ? args.orderBy : args.orderBy ? [args.orderBy] : [];
  rows.sort((a, b) => { for (const sort of sorts) { const [key, dir] = Object.entries(sort)[0] as [string, string]; const av = enumOrder[key] ? enumOrder[key].indexOf(a[key]) : a[key]; const bv = enumOrder[key] ? enumOrder[key].indexOf(b[key]) : b[key]; const cmp = av < bv ? -1 : av > bv ? 1 : 0; if (cmp) return dir === "desc" ? -cmp : cmp; } return 0; });
  if (args.take) rows = rows.slice(0, args.take);
  return rows.map((row) => args.select ? fields(row, args.select) : args.include ? { ...row, ...fields(row, args.include) } : row);
}
function modelApi(model: keyof Store) {
  return {
    findMany: async (args?: any) => query(model, args),
    findFirst: async (args?: any) => query(model, args)[0] ?? null,
    findUnique: async (args?: any) => query(model, args)[0] ?? null,
    count: async (args?: any) => query(model, args).length,
    groupBy: async (args: any) => { const map = new Map<string, any>(); for (const row of query(model, { where: args.where })) { const group = Object.fromEntries(args.by.map((k: string) => [k, row[k]])); const id = JSON.stringify(group); const entry = map.get(id) ?? { ...group, _count: { _all: 0 } }; entry._count._all++; map.set(id, entry); } return [...map.values()]; },
    create: async ({ data }: any) => { load(); const { findingLinks, ...base } = data; const defaults = model === "decision" ? { status: "ACCEPTED", supersededById: null, commitSha: null, constraints: null, assumptions: null, alternatives: [], relatedFiles: [] } : {}; const row = { id: `preview-new-${nextId++}`, ...defaults, ...base, createdAt: new Date(), updatedAt: new Date() }; (store[model] as any[]).push(row); if (model === "decision" && findingLinks?.create) for (const link of findingLinks.create) store.decisionFinding.push({ decisionId: row.id, findingId: link.findingId }); save(); return row; },
    createMany: async ({ data }: any) => { load(); for (const item of data) (store[model] as any[]).push(item); save(); return { count: data.length }; },
    update: async ({ where, data }: any) => { load(); const row = (store[model] as any[]).find((r) => match(r, where)); if (!row) throw new Error(`Preview ${model} not found`); Object.assign(row, data, { updatedAt: new Date() }); save(); return row; },
    updateMany: async ({ where, data }: any) => { load(); const rows = (store[model] as any[]).filter((r) => match(r, where)); rows.forEach((r) => Object.assign(r, data, { updatedAt: new Date() })); save(); return { count: rows.length }; },
    delete: async ({ where }: any) => { load(); const rows = store[model] as any[]; const i = rows.findIndex((r) => match(r, where)); if (i < 0) throw new Error(`Preview ${model} not found`); const row = rows.splice(i, 1)[0]; save(); return row; },
    deleteMany: async ({ where }: any) => { load(); const rows = store[model] as any[]; const before = rows.length; for (let i = rows.length - 1; i >= 0; i--) if (match(rows[i], where)) rows.splice(i, 1); save(); return { count: before - rows.length }; },
  };
}
export const previewDb = {
  project: modelApi("project"), finding: modelApi("finding"), reviewRun: modelApi("reviewRun"),
  decision: modelApi("decision"), decisionFinding: modelApi("decisionFinding"), findingCheck: modelApi("findingCheck"),
  $transaction: async (fn: any) => fn(previewDb),
  $executeRaw: async () => 0,
};

export function previewRun(type: string, branch: string, input: any) {
  load();
  const base = store.reviewRun[0];
  const id = `preview-run-${nextId++}`;
  const run: any = { ...base, id, type, branch, input, createdAt: new Date(), startedAt: new Date(), finishedAt: new Date(), summary: "Sample review completed. Explore the findings and the decision flow using the real app screens.", answer: type === "ASK" ? "Sample answer: review the evidence and linked fix options below." : null, verdict: null, releaseReport: null };
  if (type === "RELEASE") { run.verdict = "CONDITIONAL_GO"; run.releaseReport = store.reviewRun.find((r) => r.type === "RELEASE")?.releaseReport; }
  if (type === "RECHECK") { run.input = { targetFindingIds: input.targetFindingIds || [] }; for (const findingId of run.input.targetFindingIds) store.findingCheck.push({ id: `preview-check-${nextId++}`, findingId, runId: id, commitSha: sha, result: "STILL_PRESENT", reasoning: "Sample re-check: the finding is still present in this preview.", evidence: [], createdAt: new Date() } as never); }
  if (type !== "RECHECK" && type !== "RELEASE") {
    for (const finding of store.finding) if (["OPEN", "IN_PROGRESS"].includes(finding.status)) finding.lastSeenRunId = id;
  }
  store.reviewRun.push(run);
  save();
  return run;
}
export function previewReset() { store = seed(); save(); }

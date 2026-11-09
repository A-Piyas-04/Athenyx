import { existsSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from "vitest";
import { AiUnavailableError } from "@/lib/ai/errors";
import { db } from "@/lib/db";
import { runReview, type EngineDeps } from "@/lib/review/engine";
import { enqueueRun } from "@/lib/review/runs";
import { readCoverage } from "@/lib/review/types";
import { finding, mockAi, personaOutput, synthesisOutput, type MockHandler } from "./helpers/mockAi";
import { FIXTURE_DIR, fixtureTarball, mockGithub } from "./helpers/mockGithub";

/**
 * End-to-end engine tests (09 §2): real PostgreSQL (separate `_test` DB),
 * real snapshot extraction of the fixture repo, mocked LLM and GitHub.
 */

const url = inject("testDatabaseUrl");
if (url) {
  Object.assign(process.env, {
    DATABASE_URL: url,
    AUTH_SECRET: "test-secret",
    AUTH_GITHUB_ID: "test",
    AUTH_GITHUB_SECRET: "test",
    GITHUB_APP_ID: "1",
    GITHUB_APP_SLUG: "athenyx-test",
    GITHUB_APP_PRIVATE_KEY: "test-key",
    MAX_REVIEWS_PER_USER_PER_DAY: "3",
    MAX_PERSONAS_PER_RUN: "3",
  });
}

const SHA1 = "1111111111111111111111111111111111111111";
const SHA2 = "2222222222222222222222222222222222222222";
const ROUTE = "app/api/expenses/[id]/route.ts";
const SPLIT = "lib/split.ts";

const DELETE_QUOTE = "await db.expense.delete({ where: { id } });";
const SPLIT_QUOTE = "const each = Number((amount / memberIds.length).toFixed(2));";

const ownershipFinding = (over: Record<string, unknown> = {}) =>
  finding({
    title: "Expense delete has no ownership check",
    classification: "VERIFIED_DEFECT",
    severity: "HIGH",
    confidence: "HIGH",
    evidence: [{ path: ROUTE, startLine: 29, endLine: 29, symbol: "DELETE", quote: DELETE_QUOTE }],
    ...over,
  });

const floatFinding = (over: Record<string, unknown> = {}) =>
  finding({
    title: "Even split loses cents with floating point",
    severity: "MEDIUM",
    confidence: "HIGH",
    classification: "VERIFIED_DEFECT",
    // Off by two lines on purpose: the validator re-anchors it.
    evidence: [{ path: SPLIT, startLine: 7, endLine: 7, symbol: "splitEvenly", quote: SPLIT_QUOTE }],
    ...over,
  });

const inventedFinding = finding({
  title: "Hardcoded admin password",
  severity: "CRITICAL",
  confidence: "HIGH",
  evidence: [{ path: "lib/admin.ts", startLine: 1, endLine: 2, symbol: null, quote: 'const password = "hunter2"' }],
});

const planner = (personas: string[], files: string[] = [ROUTE, SPLIT]) => ({
  personas,
  files,
  keywords: ["splitEvenly"],
  reason: "test",
});

let tmp: string;
let gh: ReturnType<typeof mockGithub>;
let userId: string;
let projectId: string;

function deps(ai: ReturnType<typeof mockAi>): EngineDeps {
  return {
    callJson: ai.callJson,
    getBranchHeadSha: gh.getBranchHeadSha,
    compareCommits: gh.compareCommits,
    downloadSnapshot: gh.downloadSnapshot,
    budgets: () => ({ review: 30_000, light: 5_000 }),
    maxPersonas: () => 3,
    getCiEvidence: async () => ({ unavailable: true }),
  };
}

/** Creates a run already claimed by the worker (status RUNNING). */
async function claimedRun(type: string, input: Record<string, unknown> = {}) {
  const run = await db.reviewRun.create({
    data: { projectId, type: type as never, branch: "main", input: input as never, status: "RUNNING", startedAt: new Date() },
  });
  return run.id;
}

const loadRun = (id: string) => db.reviewRun.findUniqueOrThrow({ where: { id } });

describe.skipIf(!url)("review engine (database)", () => {
  beforeAll(() => {
    tmp = mkdtempSync(path.join(os.tmpdir(), "athenyx-engine-"));
  });

  afterAll(async () => {
    await rm(tmp, { recursive: true, force: true });
    await db.$disconnect();
  });

  beforeEach(async () => {
    await db.$executeRawUnsafe(
      'TRUNCATE "DecisionFinding", "Decision", "FindingCheck", "Finding", "ReviewRun", "Project", "Session", "Account", "User" CASCADE',
    );
    gh = mockGithub({ baseDir: tmp });
    gh.state.head = SHA1;
    gh.state.tarballs.set(SHA1, fixtureTarball("acme-sample-next-app-1111111"));
    const user = await db.user.create({ data: { name: "Test", githubLogin: "test" } });
    userId = user.id;
    const project = await db.project.create({
      data: {
        userId,
        installationId: 1,
        repoId: 42,
        repoOwner: "acme",
        repoName: "sample-next-app",
        defaultBranch: "main",
        selectedBranch: "main",
      },
    });
    projectId = project.id;
  });

  it("PROJECT_HEALTH pins the SHA, validates evidence, stores findings and updates the project", async () => {
    const ai = mockAi({
      planner: planner(["security", "quality"]),
      "persona.security": personaOutput({ findings: [ownershipFinding(), inventedFinding] }),
      "persona.quality": personaOutput({ findings: [floatFinding()] }),
      synthesis: synthesisOutput({ summary: "Two issues found." }),
    });
    const runId = await claimedRun("PROJECT_HEALTH");
    await runReview(runId, deps(ai));

    const run = await loadRun(runId);
    expect(run.status).toBe("COMPLETED");
    expect(run.stage).toBe("DONE");
    expect(run.commitSha).toBe(SHA1);
    expect(run.personas).toEqual(["security", "quality"]);
    expect(run.summary).toBe("Two issues found.");
    expect(run.answer).toBeNull();
    expect(run.usage).toMatchObject({ calls: 4 });

    const findings = await db.finding.findMany({ where: { projectId }, orderBy: { severity: "asc" } });
    expect(findings.map((f) => f.title).sort()).toEqual([
      "Even split loses cents with floating point",
      "Expense delete has no ownership check",
    ]);
    const split = findings.find((f) => f.persona === "quality")!;
    const evidence = split.evidence as { path: string; startLine: number; snippet: string; commitSha: string }[];
    expect(evidence[0]).toMatchObject({ path: SPLIT, startLine: 5, commitSha: SHA1 });
    expect(evidence[0].snippet).toBe(readFileSync(path.join(FIXTURE_DIR, SPLIT), "utf8").split("\n")[4]);
    expect(split.model).toBe("gemini:primary-model");
    expect(split.lastSeenSha).toBe(SHA1);

    const coverage = readCoverage(run.coverage)!;
    expect(coverage.filesIncluded).toContain(ROUTE);
    expect(coverage.filesExcluded).toEqual(expect.arrayContaining([{ path: ".env", reason: "secret" }]));
    expect(coverage.limitations.some((l) => l.includes("1 unsupported finding removed"))).toBe(true);
    expect(coverage.specialists?.map((s) => [s.persona, s.status, s.findingCount])).toEqual([
      ["security", "done", 1],
      ["quality", "done", 1],
    ]);
    // The board record: per-specialist work and the arbiter's tally agree with each other.
    const board = coverage.board!;
    expect(board.arbiter).toMatchObject({ unsupported: 1, kept: 2, omitted: 0 });
    expect(board.arbiter.raised).toBe(coverage.specialists!.reduce((sum, s) => sum + (s.raised ?? 0), 0));
    expect(board.arbiter.raised).toBeGreaterThanOrEqual(board.arbiter.kept + board.arbiter.unsupported);
    expect(board.defaultSelection).toBe(false);

    // Every persona saw the same bundle; secrets never reached a prompt.
    const personaCalls = ai.calls.filter((c) => c.task.startsWith("persona."));
    expect(personaCalls[0].context).toBe(personaCalls[1].context);
    expect(personaCalls[0].context).toContain(`<repository_file path="${ROUTE}"`);
    expect(personaCalls[0].context).not.toContain("fixture_live_9c1d2e3f4a5b6c7d8e9f");
    expect(personaCalls[0].system).not.toContain("<repository_file path=");

    const project = await db.project.findUniqueOrThrow({ where: { id: projectId } });
    expect(project.lastReviewedSha).toBe(SHA1);
    expect(project.latestKnownSha).toBe(SHA1);
    expect(project.projectMap).toMatchObject({ commitSha: SHA1 });

    // Snapshot cleaned up.
    expect(gh.state.snapshotDirs.every((d) => !existsSync(d))).toBe(true);
  });

  it("a second run links repeated issues instead of duplicating them", async () => {
    const first = mockAi({
      planner: planner(["security"]),
      "persona.security": personaOutput({ findings: [ownershipFinding()] }),
      synthesis: synthesisOutput(),
    });
    const run1 = await claimedRun("PROJECT_HEALTH");
    await runReview(run1, deps(first));
    const [stored] = await db.finding.findMany({ where: { projectId } });

    gh.state.head = SHA2;
    gh.state.tarballs.set(SHA2, fixtureTarball("acme-sample-next-app-2222222"));
    const second = mockAi({
      planner: planner(["security", "quality"]),
      "persona.security": (call: { context: string }) => {
        expect(call.context).toContain(`${stored.id} | Expense delete has no ownership check`);
        return personaOutput({ findings: [ownershipFinding({ existingFindingId: stored.id })] });
      },
      // Same issue again without the id: the deterministic safety net links it too.
      "persona.quality": personaOutput({ findings: [ownershipFinding({ title: "No ownership check on expense delete" })] }),
      synthesis: synthesisOutput(),
    } as Record<string, MockHandler | unknown>);
    const run2 = await claimedRun("PROJECT_HEALTH");
    await runReview(run2, deps(second));

    const findings = await db.finding.findMany({ where: { projectId } });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ id: stored.id, firstSeenRunId: run1, lastSeenRunId: run2, lastSeenSha: SHA2 });
  });

  it("a RESOLVED finding that reappears is reopened with a STILL_PRESENT check", async () => {
    const ai = () =>
      mockAi({
        planner: planner(["security"]),
        "persona.security": personaOutput({ findings: [ownershipFinding()] }),
        synthesis: synthesisOutput(),
      });
    await runReview(await claimedRun("PROJECT_HEALTH"), deps(ai()));
    const [stored] = await db.finding.findMany({ where: { projectId } });
    await db.finding.update({ where: { id: stored.id }, data: { status: "RESOLVED", statusNote: "[manual] fixed" } });

    const run2 = await claimedRun("PROJECT_HEALTH");
    await runReview(run2, deps(ai()));
    const reopened = await db.finding.findUniqueOrThrow({ where: { id: stored.id }, include: { checks: true } });
    expect(reopened.status).toBe("OPEN");
    expect(reopened.checks).toEqual([expect.objectContaining({ result: "STILL_PRESENT", runId: run2 })]);
  });

  it("LATEST_CHANGES with no new commits completes without AI calls or downloads", async () => {
    await db.project.update({ where: { id: projectId }, data: { lastReviewedSha: SHA1 } });
    const ai = mockAi({});
    const runId = await claimedRun("LATEST_CHANGES");
    await runReview(runId, deps(ai));
    const run = await loadRun(runId);
    expect(run).toMatchObject({ status: "COMPLETED", summary: "No new commits since the last reviewed commit.", baseSha: SHA1 });
    expect(run.usage).toBeNull();
    expect(ai.count()).toBe(0);
    expect(gh.state.calls.snapshot).toBe(0);
  });

  it("LATEST_CHANGES focuses on changed files and the diff", async () => {
    await db.project.update({ where: { id: projectId }, data: { lastReviewedSha: SHA1 } });
    gh.state.head = SHA2;
    gh.state.tarballs.set(SHA2, fixtureTarball("acme-sample-next-app-2222222"));
    gh.state.compare = {
      status: "ahead",
      aheadBy: 1,
      behindBy: 0,
      truncated: false,
      files: [{ filename: "lib/payments.ts", status: "modified", additions: 3, deletions: 1, patch: "@@ -1 +1 @@\n-old\n+new" }],
    };
    const ai = mockAi({
      planner: (call: { context: string }) => {
        expect(call.context).toContain("<changed_files>\nlib/payments.ts (modified, +3 -1)");
        return planner(["reliability"], []);
      },
      "persona.reliability": personaOutput(),
      synthesis: synthesisOutput({ summary: "No significant issues." }),
    } as Record<string, MockHandler | unknown>);
    const runId = await claimedRun("LATEST_CHANGES");
    await runReview(runId, deps(ai));

    const run = await loadRun(runId);
    expect(run.status).toBe("COMPLETED");
    expect(run.baseSha).toBe(SHA1);
    const context = ai.calls.find((c) => c.task === "persona.reliability")!.context;
    expect(context).toContain(`<diff base="${SHA1}" head="${SHA2}">`);
    // The changed file is the first repository file in the bundle.
    expect(context.indexOf('<repository_file path="lib/payments.ts"')).toBeLessThan(context.indexOf("<repository_file path=\"package.json\""));
    expect(readCoverage(run.coverage)!.filesIncluded[0]).toBe("lib/payments.ts");
    expect(ai.calls.find((c) => c.task === "persona.reliability")!.prompt).toContain("<diff>");
  });

  it("one failing reviewer leaves a limitation; all failing fails the run", async () => {
    const someFail = mockAi({
      planner: planner(["security", "quality"]),
      "persona.security": () => {
        throw new Error("boom");
      },
      "persona.quality": personaOutput({ findings: [floatFinding()] }),
      synthesis: synthesisOutput(),
    });
    const ok = await claimedRun("PROJECT_HEALTH");
    await runReview(ok, deps(someFail));
    const run = await loadRun(ok);
    expect(run.status).toBe("COMPLETED");
    expect(readCoverage(run.coverage)!.limitations).toContain("Security Adversary reviewer failed.");

    const allFail = mockAi({
      planner: planner(["security"]),
      "persona.security": () => {
        throw new AiUnavailableError("Free AI quota is used up for today on all configured models. Try again after X.");
      },
    });
    const failed = await claimedRun("PROJECT_HEALTH");
    await runReview(failed, deps(allFail));
    const failedRun = await loadRun(failed);
    expect(failedRun.status).toBe("FAILED");
    expect(failedRun.error).toMatch(/quota is used up/);
    expect(gh.state.snapshotDirs.every((d) => !existsSync(d))).toBe(true);
  });

  it("an unusable planner falls back to default reviewers", async () => {
    const ai = mockAi({
      planner: () => {
        throw new Error("invalid output");
      },
      "persona.architecture": personaOutput(),
      "persona.security": personaOutput(),
      "persona.quality": personaOutput(),
      synthesis: synthesisOutput(),
    });
    const runId = await claimedRun("PROJECT_HEALTH");
    await runReview(runId, deps(ai));
    const run = await loadRun(runId);
    expect(run.status).toBe("COMPLETED");
    expect(run.personas).toEqual(["architecture", "security", "quality"]);
  });

  it("marks degraded runs when a reviewer used a fallback model", async () => {
    const ai = mockAi(
      {
        planner: planner(["security"]),
        "persona.security": personaOutput({ findings: [ownershipFinding()] }),
        synthesis: synthesisOutput(),
      },
      { degradedTasks: ["persona.security"] },
    );
    const runId = await claimedRun("PROJECT_HEALTH");
    await runReview(runId, deps(ai));
    const run = await loadRun(runId);
    expect(run.degraded).toBe(true);
    const [stored] = await db.finding.findMany({ where: { projectId } });
    expect(stored.model).toBe("gemini:fallback-model");
    expect(readCoverage(run.coverage)!.specialists![0].degraded).toBe(true);
  });

  it("a cancelled run saves no findings", async () => {
    let runId = "";
    const ai = mockAi({
      planner: planner(["security", "quality"]),
      "persona.security": async () => {
        await db.reviewRun.update({ where: { id: runId }, data: { status: "CANCELLED" } });
        return personaOutput({ findings: [ownershipFinding()] });
      },
      "persona.quality": personaOutput(),
      synthesis: synthesisOutput(),
    });
    runId = await claimedRun("PROJECT_HEALTH");
    await runReview(runId, deps(ai));
    const run = await loadRun(runId);
    expect(run.status).toBe("CANCELLED");
    expect(run.finishedAt).not.toBeNull();
    expect(await db.finding.count({ where: { projectId } })).toBe(0);
    expect(ai.count("persona.quality")).toBe(0);
  });

  it("ASK stores a grounded answer and flags references to unseen files", async () => {
    const ai = mockAi({
      planner: planner(["security"], [ROUTE, "lib/auth.ts"]),
      "persona.security": (call: { context: string; prompt: string }) => {
        expect(call.context).toContain("<developer_input>\nQuestion:\nWhere is authorization checked for expense routes?");
        expect(call.prompt).toContain("Answer the developer's question");
        return personaOutput({ answer: `Only login is checked, at \`${ROUTE}:23\`.` });
      },
      synthesis: synthesisOutput({
        summary: "Login is checked; ownership is not.",
        answer: `Authorization is only a login check (\`${ROUTE}:23\`). See also \`lib/permissions.ts:4\`.`,
      }),
    } as Record<string, MockHandler | unknown>);
    const runId = await claimedRun("ASK", { question: "Where is authorization checked for expense routes?" });
    await runReview(runId, deps(ai));
    const run = await loadRun(runId);
    expect(run.status).toBe("COMPLETED");
    expect(run.answer).toContain(`${ROUTE}:23`);
    expect(readCoverage(run.coverage)!.limitations.some((l) => l.includes("lib/permissions.ts"))).toBe(true);
    expect(readCoverage(run.coverage)!.specialists![0].answer).toContain("Only login is checked");
  });

  it("PROPOSAL keeps premise-based concerns as design concerns", async () => {
    const ai = mockAi({
      planner: planner(["architecture", "product_ux"]),
      "persona.architecture": personaOutput({
        answer: "Caching balances adds invalidation risk for little gain at this size.",
        findings: [
          finding({
            title: "Cached balances can go stale after expense edits",
            classification: "VERIFIED_DEFECT",
            confidence: "HIGH",
            severity: "MEDIUM",
            userPremise: "The proposal caches computed group balances in Redis.",
          }),
        ],
      }),
      "persona.product_ux": personaOutput(),
      synthesis: synthesisOutput({ answer: "The proposal is not needed yet." }),
    });
    const runId = await claimedRun("PROPOSAL", { brief: "Add Redis caching for balances" });
    await runReview(runId, deps(ai));
    const [stored] = await db.finding.findMany({ where: { projectId } });
    expect(stored).toMatchObject({
      classification: "DESIGN_CONCERN",
      confidence: "MEDIUM",
      userPremise: "The proposal caches computed group balances in Redis.",
    });
    expect(stored.evidence).toEqual([]);
    expect((await loadRun(runId)).answer).toBe("The proposal is not needed yet.");
  });

  it("ISSUE returns an investigation answer", async () => {
    const ai = mockAi({
      planner: planner(["reliability", "quality"], [SPLIT]),
      "persona.reliability": personaOutput({ answer: "1. Rounding in `lib/split.ts:5`. Check: split 10 between 3." }),
      "persona.quality": personaOutput({ findings: [floatFinding()] }),
      synthesis: synthesisOutput({ answer: "Most likely cause: rounding in `lib/split.ts:5`." }),
    });
    const runId = await claimedRun("ISSUE", { symptom: "Balances are off by a cent" });
    await runReview(runId, deps(ai));
    const run = await loadRun(runId);
    expect(run.status).toBe("COMPLETED");
    expect(run.answer).toContain("lib/split.ts:5");
    expect(readCoverage(run.coverage)!.limitations.filter((l) => l.includes("not part of this review"))).toEqual([]);
  });

  it("access loss fails the run with the reconnect message", async () => {
    const { GithubAccessLost } = await import("@/lib/github/errors");
    const runId = await claimedRun("PROJECT_HEALTH");
    await runReview(runId, {
      ...deps(mockAi({})),
      getBranchHeadSha: async () => {
        throw new GithubAccessLost();
      },
    });
    expect(await loadRun(runId)).toMatchObject({
      status: "FAILED",
      error: "Athenyx no longer has access to this repository. Reconnect in Settings.",
    });
  });

  it("leaves no temp directories behind", async () => {
    expect(existsSync(tmp) ? readdirSync(tmp) : []).toEqual([]);
  });
});

describe.skipIf(!url)("enqueueRun (database)", () => {
  beforeEach(async () => {
    await db.$executeRawUnsafe('TRUNCATE "ReviewRun", "Project", "User" CASCADE');
    const user = await db.user.create({ data: { name: "Q" } });
    userId = user.id;
    const project = await db.project.create({
      data: { userId, installationId: 1, repoId: 7, repoOwner: "o", repoName: "r", defaultBranch: "main", selectedBranch: "main" },
    });
    projectId = project.id;
  });

  const project = () => db.project.findUniqueOrThrow({ where: { id: projectId } });

  it("rejects a second active run with 409", async () => {
    await enqueueRun(userId, await project(), { type: "PROJECT_HEALTH" });
    await expect(enqueueRun(userId, await project(), { type: "PROJECT_HEALTH" })).rejects.toMatchObject({
      status: 409,
      message: "A review is already running for this project.",
    });
  });

  it("rejects LATEST_CHANGES without a baseline with 409", async () => {
    await expect(enqueueRun(userId, await project(), { type: "LATEST_CHANGES" })).rejects.toMatchObject({ status: 409 });
  });

  it("validates input per type with 400", async () => {
    await expect(enqueueRun(userId, await project(), { type: "ASK", input: {} })).rejects.toMatchObject({ status: 400 });
  });

  it("enforces the daily limit with 429, ignoring runs that used no AI", async () => {
    const usage = { inputTokens: 1, outputTokens: 1, calls: 1, retries: 0, fallbacks: 0, models: [] };
    for (let i = 0; i < 3; i++) {
      await db.reviewRun.create({ data: { projectId, type: "PROJECT_HEALTH", branch: "main", status: "COMPLETED", usage } });
    }
    await db.reviewRun.create({ data: { projectId, type: "PROJECT_HEALTH", branch: "main", status: "FAILED" } });
    await expect(enqueueRun(userId, await project(), { type: "PROJECT_HEALTH" })).rejects.toMatchObject({
      status: 429,
      message: expect.stringContaining("limit of 3 reviews"),
    });
  });

  it("creates a QUEUED run on the selected branch with cleaned input", async () => {
    const run = await enqueueRun(userId, await project(), { type: "ISSUE", input: { symptom: " slow ", log: "" } });
    expect(run).toMatchObject({ status: "QUEUED", stage: "QUEUED", branch: "main", input: { symptom: "slow" } });
  });
});

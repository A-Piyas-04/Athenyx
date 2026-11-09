import type { Prisma, Project, ReviewRun } from "@/generated/prisma/client";
import type { ReleaseVerdict, ReviewType } from "@/generated/prisma/enums";
import {
  addUsage,
  callJson as defaultCallJson,
  emptyUsage,
  estimateInputTokens,
  type CallJson,
  type Usage,
} from "@/lib/ai/client";
import { getAiConfig } from "@/lib/ai/config";
import {
  AiBudgetError,
  AiConfigError,
  AiContextTooLargeError,
  AiUnavailableError,
} from "@/lib/ai/errors";
import { jsonInstructions } from "@/lib/ai/json";
import { buildPlannerRequest } from "@/lib/ai/prompts/planner";
import { PERSONAS, personaName } from "@/lib/ai/prompts/personas";
import { SHARED_RULES } from "@/lib/ai/prompts/shared";
import { buildSynthesisRequest } from "@/lib/ai/prompts/synthesis";
import { EVIDENCE_REMINDER, REVIEW_TASKS, renderDeveloperInput } from "@/lib/ai/prompts/tasks";
import {
  PersonaOutput,
  PlannerOutput,
  SynthesisOutput,
  type PersonaKey,
} from "@/lib/ai/schemas";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { GithubAccessLost } from "@/lib/github/errors";
import {
  compareCommits as defaultCompareCommits,
  getCiEvidence as defaultGetCiEvidence,
  type CiEvidence,
  CompareUnavailable,
  getBranchHeadSha as defaultGetBranchHeadSha,
  type CompareResult,
  type RepoRef,
} from "@/lib/github/repo";
import {
  downloadSnapshot as defaultDownloadSnapshot,
  SnapshotTooLarge,
  type Snapshot,
} from "@/lib/github/snapshot";
import {
  buildContextBundle,
  expandContext,
  type ContextBundle,
  type DiffInput,
  type PriorFinding,
} from "@/lib/repo/context";
import { loadSnapshotText, readerFromMap, scanSnapshot } from "@/lib/repo/files";
import { buildProjectMap, projectMapLimitations } from "@/lib/repo/mapper";
import { unknownAnswerReferences } from "@/lib/review/answer";
import { executeRecheck } from "@/lib/review/recheck";
import { describeError, ReviewFailure, sameCommit, usageData } from "@/lib/review/run-helpers";
import { dedupeFindings, sortAndCap } from "@/lib/review/dedupe";
import { postProcessPlan, type ReviewPlan } from "@/lib/review/plan";
import {
  applyVerdictCaps,
  releaseContextFiles,
  renderReleaseEvidence,
  selectReleasePersonas,
  type ReleaseFinding,
  type ReleaseReport,
} from "@/lib/review/release";
import {
  assertNotCancelled,
  createPersonaStatusTracker,
  heartbeat,
  RunCancelled,
  setStage,
} from "@/lib/review/progress";
import { saveFindings, type PriorFindingRecord } from "@/lib/review/store";
import {
  EvidenceItemSchema,
  readJsonArray,
  readRunInput,
  REVIEW_TYPES,
  type Coverage,
  type SpecialistReport,
} from "@/lib/review/types";
import { validatePersonaFindings, type ValidatedFinding } from "@/lib/review/validate";
import type { BoardReport } from "@/lib/review/types";

/** Why a release run used its fixed specialists (04 §10: devops + quality, security when warranted). */
function releaseSelectionReason(personas: string[]): string {
  const base = "Release assessments always include DevOps and Quality.";
  return personas.includes("security")
    ? `${base} Security joined because there are open serious security findings or the project uses auth or payment libraries.`
    : base;
}

/**
 * `runReview(runId)` — turns a claimed (RUNNING) ReviewRun into validated,
 * stored findings (04 §1). Every external effect goes through `EngineDeps` so
 * the pipeline can be tested with a mocked LLM and GitHub.
 */

export type EngineDeps = {
  callJson: CallJson;
  getBranchHeadSha: (ref: RepoRef, branch: string) => Promise<string>;
  compareCommits: (ref: RepoRef, base: string, head: string) => Promise<CompareResult>;
  downloadSnapshot: (ref: RepoRef, sha: string, runId: string) => Promise<Snapshot>;
  /** Input token budgets per role (AI_*_MAX_INPUT_TOKENS). */
  budgets: () => { review: number; light: number };
  maxPersonas: () => number;
  getCiEvidence: (ref: RepoRef, sha: string) => Promise<CiEvidence>;
};

export const defaultEngineDeps: EngineDeps = {
  callJson: defaultCallJson,
  getBranchHeadSha: defaultGetBranchHeadSha,
  compareCommits: defaultCompareCommits,
  downloadSnapshot: (ref, sha, runId) => defaultDownloadSnapshot(ref, sha, runId),
  budgets: () => getAiConfig().maxInputTokens,
  maxPersonas: () => env.MAX_PERSONAS_PER_RUN,
  getCiEvidence: defaultGetCiEvidence,
};

export { ReviewFailure };

const GENERIC_FAILURE = "The review failed unexpectedly. Please try again.";

/** Maps any error onto a message that is safe to show (never internals). */
export function userMessageFor(error: unknown): string {
  if (
    error instanceof ReviewFailure ||
    error instanceof GithubAccessLost ||
    error instanceof SnapshotTooLarge ||
    error instanceof CompareUnavailable ||
    error instanceof AiUnavailableError ||
    error instanceof AiConfigError
  ) {
    return error.message;
  }
  return GENERIC_FAILURE;
}

/** Leaves headroom under the client's +15% input estimate margin. */
const BUDGET_HEADROOM = 1.2;
const SHRINK_FACTOR = 0.7;
/** Prior findings considered for linking; the prompt only shows those touching included files. */
const MAX_PRIOR_FINDINGS = 500;
const MAX_PERSONA_LIMITATIONS = 3;
/** Reviewers cite files, not the tree; a shorter tree leaves budget for code. */
const PERSONA_MAP_TREE_LINES = 150;

export type RunWithProject = ReviewRun & { project: Project };

export async function runReview(runId: string, deps: EngineDeps = defaultEngineDeps): Promise<void> {
  const run = await db.reviewRun.findUnique({ where: { id: runId }, include: { project: true } });
  if (!run || run.status !== "RUNNING") return;

  const usage = emptyUsage();
  const state = { degraded: false, snapshot: null as Snapshot | null };

  try {
    await execute(run, deps, usage, state);
  } catch (error) {
    if (error instanceof RunCancelled) {
      await db.reviewRun.updateMany({
        where: { id: runId, status: "CANCELLED" },
        data: { finishedAt: new Date(), ...usageData(usage) },
      });
      return;
    }
    // Expected, user-facing failures are logged by message; anything else in full.
    if (userMessageFor(error) !== GENERIC_FAILURE) {
      console.warn(`[athenyx] Review run ${runId} failed: ${(error as Error).name}: ${(error as Error).message}`);
    } else {
      console.error(`[athenyx] Review run ${runId} failed: ${describeError(error)}`);
    }
    await db.reviewRun.updateMany({
      where: { id: runId, status: "RUNNING" },
      data: {
        status: "FAILED",
        error: userMessageFor(error),
        finishedAt: new Date(),
        degraded: state.degraded,
        ...usageData(usage),
      },
    });
  } finally {
    await state.snapshot?.cleanup().catch(() => undefined);
  }
}

export async function completeWithoutReview(run: RunWithProject, commitSha: string, summary: string): Promise<void> {
  const now = new Date();
  await db.$transaction(async (tx) => {
    const updated = await tx.reviewRun.updateMany({
      where: { id: run.id, status: "RUNNING" },
      data: {
        status: "COMPLETED",
        stage: "DONE",
        summary,
        coverage: { filesIncluded: [], filesExcluded: [], limitations: [] } satisfies Coverage,
        finishedAt: now,
      },
    });
    if (updated.count === 0) throw new RunCancelled();
    if (run.type !== "RECHECK") {
      await tx.project.update({
        where: { id: run.projectId },
        data: { lastReviewedSha: commitSha, lastReviewedAt: now },
      });
    }
  });
}

async function execute(
  run: RunWithProject,
  deps: EngineDeps,
  usage: Usage,
  state: { degraded: boolean; snapshot: Snapshot | null },
): Promise<void> {
  const { project } = run;
  const type = run.type;
  if (type === "RECHECK") {
    await executeRecheck(run, deps, usage, state);
    return;
  }
  const ref: RepoRef = {
    installationId: project.installationId,
    repoOwner: project.repoOwner,
    repoName: project.repoName,
  };
  const input = readRunInput(run.input);
  const typeConfig = REVIEW_TYPES[type];
  const limitations: string[] = [];
  const beat = () => heartbeat(run.id);

  // 1. RESOLVING_COMMIT — pinned once, never changed afterwards.
  await setStage(run.id, "RESOLVING_COMMIT");
  let commitSha = run.commitSha;
  if (!commitSha) {
    commitSha = await deps.getBranchHeadSha(ref, run.branch);
    await db.reviewRun.update({ where: { id: run.id }, data: { commitSha } });
    if (run.branch === project.selectedBranch) {
      await db.project.update({
        where: { id: project.id },
        data: { latestKnownSha: commitSha, latestCheckedAt: new Date() },
      });
    }
  }

  let baseSha: string | null = null;
  if (type === "LATEST_CHANGES") {
    baseSha = input.baseSha ?? project.lastReviewedSha;
    if (!baseSha) throw new ReviewFailure("No previous review baseline. Run a Project Health review first.");
    await db.reviewRun.update({ where: { id: run.id }, data: { baseSha } });
    if (sameCommit(baseSha, commitSha)) {
      await completeWithoutReview(run, commitSha, "No new commits since the last reviewed commit.");
      return;
    }
  }
  await assertNotCancelled(run.id);

  // 2. FETCHING_SNAPSHOT
  await setStage(run.id, "FETCHING_SNAPSHOT");
  state.snapshot = await deps.downloadSnapshot(ref, commitSha, run.id);
  limitations.push(...state.snapshot.limitations);

  // 3. MAPPING_PROJECT (deterministic)
  await setStage(run.id, "MAPPING_PROJECT");
  const files = await scanSnapshot(state.snapshot.dir, state.snapshot.skipped);
  const text = await loadSnapshotText(files);
  const read = readerFromMap(text);
  const projectMap = buildProjectMap({ commitSha, files: files.files, read });
  limitations.push(...projectMapLimitations(projectMap));
  // The project map is stored in the SAVING transaction (04 §8), not here.
  await assertNotCancelled(run.id);

  let diff: DiffInput | undefined;
  let changedFiles: string[] = [];
  if (type === "LATEST_CHANGES" && baseSha) {
    const comparison = await deps.compareCommits(ref, baseSha, commitSha);
    if (comparison.truncated) limitations.push("Diff truncated by GitHub at 300 files.");
    if (comparison.files.length === 0) {
      await completeWithoutReview(run, commitSha, "The new commits since the last review change no files.");
      return;
    }
    diff = { base: baseSha, head: commitSha, files: comparison.files };
    changedFiles = comparison.files.filter((f) => f.status !== "removed").map((f) => f.filename);
  }

  // RELEASE: deterministic evidence (CI results never fail the run).
  const isRelease = type === "RELEASE";
  let ci: CiEvidence = { unavailable: true };
  let releaseOpen: ReleaseFinding[] = [];
  let acceptedRisks = 0;
  if (isRelease) {
    ci = await deps.getCiEvidence(ref, commitSha).catch((error) => {
      console.warn(`[athenyx] CI evidence unavailable for run ${run.id}:`, (error as Error)?.name);
      return { unavailable: true } as const;
    });
    releaseOpen = await openReleaseFindings(db, project.id);
    acceptedRisks = await db.finding.count({ where: { projectId: project.id, status: "ACCEPTED_RISK" } });
  }

  // 4. SELECTING_CONTEXT
  await setStage(run.id, "SELECTING_CONTEXT");
  const budgets = deps.budgets();
  const developerInput = renderDeveloperInput(type, input);

  const priorRows = await db.finding.findMany({
    where: { projectId: project.id },
    orderBy: { updatedAt: "desc" },
    take: MAX_PRIOR_FINDINGS,
    select: { id: true, title: true, persona: true, status: true, evidence: true },
  });
  const priorRecords: PriorFindingRecord[] = priorRows.map((p) => ({
    id: p.id,
    title: p.title,
    status: p.status,
    evidence: readJsonArray(p.evidence, EvidenceItemSchema),
  }));
  const priorForPrompt: PriorFinding[] = priorRows.map((p, i) => ({
    id: p.id,
    title: p.title,
    persona: p.persona,
    status: p.status,
    paths: [...new Set(priorRecords[i].evidence.map((e) => e.path))],
  }));

  let planner: PlannerOutput | null = null;
  // RELEASE uses a fixed persona set and context focus, so no planner call (04 §10.3).
  if (!isRelease) {
    try {
      const request = buildPlannerRequest({
        reviewType: type,
        projectMap,
        developerInput,
        openFindings: priorForPrompt.filter((p) => p.status === "OPEN" || p.status === "IN_PROGRESS"),
        changedFiles: diff?.files,
        budgetTokens: budgets.light,
      });
      const result = await deps.callJson({
        role: "light",
        task: "planner",
        reviewType: type,
        ...request,
        schema: PlannerOutput,
        runId: run.id,
        heartbeat: beat,
      });
      addUsage(usage, result.usage);
      planner = result.data;
    } catch (error) {
      if (error instanceof AiUnavailableError || error instanceof AiConfigError) throw error;
      console.warn(`[athenyx] Planner failed for run ${run.id}; using default routing.`, (error as Error)?.name);
      limitations.push("The context planner was unavailable; a default reviewer selection was used.");
    }
  }

  const fileSet = new Set(files.files.map((f) => f.path));
  const plan: ReviewPlan = isRelease
    ? {
        personas: selectReleasePersonas(projectMap, releaseOpen, deps.maxPersonas()),
        ...releaseContextFiles(projectMap, fileSet),
        usedFallback: false,
      }
    : postProcessPlan(planner, {
        reviewType: type,
        fileSet,
        usesAI: projectMap.usesAI,
        developerInput,
        maxPersonas: deps.maxPersonas(),
      });

  const candidates = expandContext({
    files: files.files,
    read,
    changedFiles,
    plannerFiles: plan.files,
    keywords: plan.keywords,
    includeImporters: type === "LATEST_CHANGES",
  });

  const taskText = REVIEW_TASKS[type];
  // The evidence reminder goes last, closest to where the model starts writing.
  const personaPrompt = (key: PersonaKey) => `${PERSONAS[key].brief}\n\n${taskText}\n\n${EVIDENCE_REMINDER}`;
  const instructionTokens = Math.max(
    ...plan.personas.map((key) =>
      estimateInputTokens(`${SHARED_RULES}\n\n${jsonInstructions(PersonaOutput)}\n\n${personaPrompt(key)}`),
    ),
  );
  const buildBundle = (factor: number): ContextBundle =>
    buildContextBundle({
      projectMap,
      snapshot: { repo: `${project.repoOwner}/${project.repoName}`, branch: run.branch, commitSha },
      candidates,
      read,
      budgetTokens: Math.floor((budgets.review * factor) / BUDGET_HEADROOM),
      instructionTokens,
      filterExclusions: files.excluded,
      diff,
      priorFindings: priorForPrompt,
      developerInput,
      mapTreeLines: PERSONA_MAP_TREE_LINES,
    });
  let bundle = buildBundle(1);
  let shrunk = false;
  await assertNotCancelled(run.id);

  // 5. REVIEWING — sequential (free-tier rate limits), one shared bundle.
  await setStage(run.id, "REVIEWING");
  const tracker = createPersonaStatusTracker(run.id, plan.personas);
  await tracker.init();

  // Each result keeps the bundle that persona actually saw (a mid-run shrink must not invalidate earlier evidence).
  type PersonaResult = { persona: PersonaKey; output: PersonaOutput | null; model: string | null; degraded: boolean; bundle: ContextBundle };
  const results: PersonaResult[] = [];
  let lastError: unknown = null;

  for (const persona of plan.personas) {
    await assertNotCancelled(run.id);
    await tracker.set(persona, "running");
    const call = () =>
      deps.callJson({
        role: "review",
        task: `persona.${persona}`,
        reviewType: type,
        system: SHARED_RULES,
        context: bundle.text,
        prompt: personaPrompt(persona),
        schema: PersonaOutput,
        runId: run.id,
        onWait: (waiting) => tracker.set(persona, waiting ? "waiting_rate_limit" : "running"),
        heartbeat: beat,
      });
    try {
      let result;
      try {
        result = await call();
      } catch (error) {
        const tooLarge = error instanceof AiContextTooLargeError || error instanceof AiBudgetError;
        if (!tooLarge || shrunk) throw error;
        // Shrink the context by 30% once and retry from the top of the chain.
        shrunk = true;
        bundle = buildBundle(SHRINK_FACTOR);
        limitations.push("The review context was reduced to fit the AI models' input limits.");
        result = await call();
      }
      addUsage(usage, result.usage);
      if (result.degraded) state.degraded = true;
      results.push({ persona, output: result.data, model: result.model, degraded: result.degraded, bundle });
      await tracker.set(persona, "done");
    } catch (error) {
      if (error instanceof RunCancelled) throw error;
      lastError = error;
      console.warn(`[athenyx] Reviewer ${persona} failed for run ${run.id}:`, (error as Error)?.name);
      results.push({ persona, output: null, model: null, degraded: false, bundle });
      limitations.push(`${personaName(persona)} reviewer failed.`);
      await tracker.set(persona, "failed");
    }
  }

  const succeeded = results.filter((r) => r.output !== null);
  if (succeeded.length === 0) {
    if (lastError instanceof AiUnavailableError || lastError instanceof AiConfigError) throw lastError;
    throw new ReviewFailure("All AI reviewers failed. Try again later.");
  }
  await assertNotCancelled(run.id);

  // 6. VALIDATING — the deterministic evidence arbiter.
  await setStage(run.id, "VALIDATING");
  const validationContextFor = (seen: ContextBundle) => {
    const includedPaths = new Set(seen.filesIncluded);
    return {
      reviewType: type,
      commitSha,
      files: new Map(seen.files.map((f) => [f.path, f])),
      priorFindingIds: new Set(priorForPrompt.filter((p) => p.paths.some((x) => includedPaths.has(x))).map((p) => p.id)),
    };
  };
  const filesSeen = [...new Set(succeeded.flatMap((r) => r.bundle.filesIncluded))];
  const validated: ValidatedFinding[] = [];
  let unsupported = 0;
  let citationsDropped = 0;
  const findingCounts = new Map<string, number>();
  const personaStats = new Map<string, { raised: number; unsupported: number; citationsDropped: number }>();
  for (const result of succeeded) {
    const outcome = validatePersonaFindings(result.persona, result.model, result.output!.findings, validationContextFor(result.bundle));
    validated.push(...outcome.findings);
    unsupported += outcome.unsupportedRemoved;
    citationsDropped += outcome.evidenceDropped;
    findingCounts.set(result.persona, outcome.findings.length);
    personaStats.set(result.persona, {
      raised: result.output!.findings.length,
      unsupported: outcome.unsupportedRemoved,
      citationsDropped: outcome.evidenceDropped,
    });
    for (const note of result.output!.limitations.slice(0, MAX_PERSONA_LIMITATIONS)) {
      const trimmed = note.trim().slice(0, 300);
      if (trimmed) limitations.push(`${personaName(result.persona)}: ${trimmed}`);
    }
  }
  if (unsupported > 0) {
    limitations.push(
      `${unsupported} unsupported finding${unsupported === 1 ? "" : "s"} removed (cited code could not be matched to the reviewed commit).`,
    );
  }
  const deduped = dedupeFindings(validated);
  const { kept: findings, omitted } = sortAndCap(deduped);
  if (omitted > 0) limitations.push(`${omitted} lower-priority finding${omitted === 1 ? "" : "s"} omitted.`);

  // 7. SUMMARIZING — no new findings may be created here.
  await setStage(run.id, "SUMMARIZING");
  const specialists: SpecialistReport[] = results.map((r) => ({
    persona: r.persona,
    status: r.output ? "done" : "failed",
    summary: r.output?.summary.trim() || null,
    answer: typeConfig.producesAnswer ? r.output?.answer?.trim() || null : null,
    model: r.model,
    degraded: r.degraded,
    findingCount: findingCounts.get(r.persona) ?? 0,
    ...(personaStats.get(r.persona) ?? {}),
  }));
  const board: BoardReport = {
    selectionReason: isRelease
      ? releaseSelectionReason(plan.personas)
      : planner?.reason.trim().slice(0, 500) || null,
    defaultSelection: plan.usedFallback,
    arbiter: {
      raised: [...personaStats.values()].reduce((sum, s) => sum + s.raised, 0),
      unsupported,
      citationsDropped,
      merged: validated.length - deduped.length,
      omitted,
      kept: findings.length,
    },
    agreements: findings
      .filter((f) => f.alsoRaisedBy.length > 0)
      .slice(0, 10)
      .map((f) => ({ title: f.title.slice(0, 200), personas: [f.persona, ...f.alsoRaisedBy] })),
  };
  const allLimitations = [...limitations, ...bundle.limitations];

  let summary: string;
  let answer: string | null = null;
  let aiVerdict: ReleaseVerdict | null = null;
  let aiConditions: string[] = [];
  try {
    const request = buildSynthesisRequest({
      reviewType: type,
      developerInput,
      findings: findings.map((f) => ({
        title: f.title,
        severity: f.severity,
        classification: f.classification,
        persona: f.persona,
        locations: f.evidence.map((e) => `${e.path}:${e.startLine}-${e.endLine}`),
        basedOnPremise: f.evidence.length === 0,
      })),
      specialists: specialists
        .filter((s) => s.status === "done")
        .map((s) => ({ persona: s.persona, summary: s.summary ?? "", answer: s.answer })),
      limitations: allLimitations,
      reviewedFiles: filesSeen,
      releaseEvidence: isRelease
        ? renderReleaseEvidence({
            ci,
            testFiles: projectMap.testFiles,
            ciFiles: projectMap.ciFiles,
            open: releaseOpen,
            acceptedRisks,
          })
        : undefined,
      budgetTokens: budgets.light,
    });
    const result = await deps.callJson({
      role: "light",
      task: "synthesis",
      reviewType: type,
      ...request,
      schema: SynthesisOutput,
      runId: run.id,
      heartbeat: beat,
    });
    addUsage(usage, result.usage);
    summary = result.data.summary.trim() || fallbackSummary(specialists, findings.length);
    if (typeConfig.producesAnswer) answer = result.data.answer?.trim() || fallbackAnswer(specialists);
    if (isRelease) {
      aiVerdict = result.data.verdict;
      aiConditions = result.data.conditions.map((c) => c.trim().slice(0, 300)).filter(Boolean).slice(0, 10);
    }
    for (const note of result.data.limitations.slice(0, 5)) {
      const trimmed = note.trim().slice(0, 300);
      if (trimmed) allLimitations.push(trimmed);
    }
  } catch (error) {
    // The specialists' work is already validated; don't lose it over the summary.
    console.warn(`[athenyx] Synthesis failed for run ${run.id}:`, (error as Error)?.name);
    allLimitations.push("The combined summary could not be generated; showing the specialists' own summaries.");
    summary = fallbackSummary(specialists, findings.length);
    if (typeConfig.producesAnswer) answer = fallbackAnswer(specialists);
  }

  if (answer) {
    const known = new Set([...filesSeen, ...findings.flatMap((f) => f.evidence.map((e) => e.path))]);
    const unknown = unknownAnswerReferences(answer, known);
    if (unknown.length > 0) {
      allLimitations.push(
        `The answer mentions ${unknown.length} file${unknown.length === 1 ? "" : "s"} that ${unknown.length === 1 ? "was" : "were"} not part of this review (${unknown.slice(0, 3).join(", ")}${unknown.length > 3 ? ", …" : ""}); treat ${unknown.length === 1 ? "that reference" : "those references"} with caution.`,
      );
    }
  }

  // 8. SAVING — one transaction; a cancelled run saves nothing.
  await setStage(run.id, "SAVING");
  const coverage: Coverage = {
    filesIncluded: filesSeen,
    filesExcluded: bundle.filesExcluded.filter((e) => !filesSeen.includes(e.path)),
    limitations: [...new Set(allLimitations)],
    specialists,
    board,
  };
  const finishedAt = new Date();
  await db.$transaction(async (tx) => {
    const updated = await tx.reviewRun.updateMany({
      where: { id: run.id, status: "RUNNING" },
      data: {
        status: "COMPLETED",
        stage: "DONE",
        personas: plan.personas,
        personaStatus: tracker.snapshot() as Prisma.InputJsonValue,
        coverage: coverage as unknown as Prisma.InputJsonValue,
        summary,
        answer,
        degraded: state.degraded,
        finishedAt,
        ...usageData(usage),
      },
    });
    if (updated.count === 0) throw new RunCancelled();
    await saveFindings(tx, { projectId: project.id, runId: run.id, commitSha, findings, prior: priorRecords });

    if (isRelease) {
      // Caps use the open findings after this run's findings were saved; code wins over the AI (04 §10.5).
      const caps = applyVerdictCaps({
        verdict: aiVerdict,
        open: await openReleaseFindings(tx, project.id),
        ci,
        hasTests: projectMap.testFiles.length > 0,
      });
      const report: ReleaseReport = {
        conditions: [...new Set([...caps.conditions, ...aiConditions])],
        blockingFindingIds: caps.blockingFindingIds,
        ciEvidence: ci,
        testsPresent: projectMap.testFiles.length > 0,
        acceptedRisks,
        limitations: caps.limitations,
      };
      await tx.reviewRun.update({
        where: { id: run.id },
        data: {
          verdict: caps.verdict,
          releaseReport: report as unknown as Prisma.InputJsonValue,
          coverage: { ...coverage, limitations: [...new Set([...coverage.limitations, ...caps.limitations])] } as unknown as Prisma.InputJsonValue,
        },
      });
    }

    // NOTE: a release check of another branch doesn't move the header's "last reviewed" or the map.
    if (run.branch === project.selectedBranch) {
      await tx.project.update({
        where: { id: project.id },
        data: {
          lastReviewedSha: commitSha,
          lastReviewedAt: finishedAt,
          projectMap: projectMap as unknown as Prisma.InputJsonValue,
        },
      });
    }
  });
}

async function openReleaseFindings(
  client: Pick<Prisma.TransactionClient, "finding">,
  projectId: string,
): Promise<ReleaseFinding[]> {
  return client.finding.findMany({
    where: { projectId, status: { in: ["OPEN", "IN_PROGRESS"] } },
    select: { id: true, title: true, persona: true, severity: true, classification: true },
    orderBy: [{ severity: "asc" }, { updatedAt: "desc" }],
  });
}

function fallbackSummary(specialists: SpecialistReport[], findingCount: number): string {
  const lines = specialists
    .filter((s) => s.status === "done" && s.summary)
    .map((s) => `**${personaName(s.persona)}:** ${s.summary}`);
  const head =
    findingCount === 0
      ? "No significant issues were found in the reviewed code."
      : `${findingCount} finding${findingCount === 1 ? "" : "s"} recorded.`;
  return [head, ...lines].join("\n\n");
}

function fallbackAnswer(specialists: SpecialistReport[]): string | null {
  const answers = specialists
    .filter((s) => s.answer)
    .map((s) => `**${personaName(s.persona)}:**\n\n${s.answer}`);
  return answers.length > 0 ? answers.join("\n\n") : null;
}

/** Exported for tests: types that the engine can run in this phase. */
export const ENGINE_TYPES: ReviewType[] = ["PROJECT_HEALTH", "LATEST_CHANGES", "ASK", "PROPOSAL", "ISSUE", "RELEASE", "RECHECK"];

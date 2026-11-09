import type { Prisma } from "@/generated/prisma/client";
import type { CheckResult } from "@/generated/prisma/enums";
import { addUsage, estimateInputTokens, type Usage } from "@/lib/ai/client";
import { AiConfigError, AiUnavailableError } from "@/lib/ai/errors";
import { jsonInstructions } from "@/lib/ai/json";
import { PERSONAS, personaName } from "@/lib/ai/prompts/personas";
import { RECHECK_SYSTEM, RECHECK_TASK, renderFindingBlock } from "@/lib/ai/prompts/recheck";
import { EVIDENCE_REMINDER } from "@/lib/ai/prompts/tasks";
import { isPersonaKey, RecheckOutput } from "@/lib/ai/schemas";
import { db } from "@/lib/db";
import { CompareUnavailable, type CompareFile, type CompareResult, type RepoRef } from "@/lib/github/repo";
import type { Snapshot } from "@/lib/github/snapshot";
import { buildContextBundle, expandContext, type ContextBundle } from "@/lib/repo/context";
import { loadSnapshotText, readerFromMap, scanSnapshot } from "@/lib/repo/files";
import { redactSecrets } from "@/lib/repo/redact";
import { buildProjectMap } from "@/lib/repo/mapper";
import type { EngineDeps, RunWithProject } from "@/lib/review/engine";
import { assertNotCancelled, createPersonaStatusTracker, heartbeat, RunCancelled, setStage } from "@/lib/review/progress";
import { ReviewFailure, sameCommit, usageData } from "@/lib/review/run-helpers";
import { EvidenceItemSchema, readJsonArray, readRunInput, type Coverage, type EvidenceItem } from "@/lib/review/types";
import { normalizeCode, validateEvidence } from "@/lib/review/validate";

/**
 * RECHECK runs (04 §9): re-evaluate selected findings on the branch's current
 * commit. One call per finding, using the persona that raised it. The model's
 * verdict is checked in code: "resolved" needs either the cited code to have
 * changed, or valid evidence of the fix at the new commit.
 */

export const MAX_RECHECK_FINDINGS = 5;
const BUDGET_HEADROOM = 1.2;
const CONTEXT_GROUPS = new Set(["changed", "imports", "keywords"]);

export const NO_NEW_COMMITS = "No new commits since this finding was reviewed.";
const UNVERIFIED_NOTE =
  "(Athenyx could not confirm this from the code — the cited code is unchanged and no evidence of a fix was found — so it is recorded as unverifiable.)";
const DELETED_NOTE =
  "(The files this finding cited were deleted, and the reviewer could not show where the logic moved, so it is recorded as unverifiable.)";

// ---------------------------------------------------------------------------
// Deterministic rules
// ---------------------------------------------------------------------------

/**
 * True when the unified diff changes (removes, edits, or inserts inside) old
 * lines `start..end`.
 */
export function diffTouchesRange(patch: string, start: number, end: number): boolean {
  let oldLine = 0;
  for (const line of patch.split("\n")) {
    const hunk = /^@@ -(\d+)(?:,(\d+))? \+\d+(?:,\d+)? @@/.exec(line);
    if (hunk) {
      oldLine = Number(hunk[1]);
      // A pure insertion hunk ("-N,0") inserts after line N.
      if (hunk[2] === "0") oldLine += 1;
      continue;
    }
    if (oldLine === 0) continue;
    // Inside hunks every line is content: "--x" is a removed "-x", "+++i" an added "++i".
    // (GitHub's `patch` has no ---/+++ file headers; anything before the first @@ is skipped above.)
    if (line.startsWith("-")) {
      if (oldLine >= start && oldLine <= end) return true;
      oldLine += 1;
    } else if (line.startsWith("+")) {
      if (oldLine > start && oldLine <= end) return true;
    } else if (!line.startsWith("\\")) {
      oldLine += 1;
    }
  }
  return false;
}

export type RecheckDecisionInput = {
  result: CheckResult;
  hasValidEvidence: boolean;
  /** The cited code was removed or changed since the finding's commit. */
  codeChanged: boolean;
  /** Every file the finding cited was deleted. */
  allFilesDeleted: boolean;
};

/** Applies 04 §9.5 to the model's verdict. Returns the final result and an optional note. */
export function applyRecheckRules(input: RecheckDecisionInput): { result: CheckResult; note: string | null } {
  if (input.allFilesDeleted && !input.hasValidEvidence) {
    return { result: "UNVERIFIABLE", note: input.result === "UNVERIFIABLE" ? null : DELETED_NOTE };
  }
  if (input.result === "RESOLVED" && !input.codeChanged && !input.hasValidEvidence) {
    return { result: "UNVERIFIABLE", note: UNVERIFIED_NOTE };
  }
  return { result: input.result, note: null };
}

type PathMove = { oldPath: string; newPath: string | null; diff: CompareFile | null };

/** Follows renames/deletions from the compare result for each cited path. */
export function mapEvidencePaths(evidence: EvidenceItem[], compare: CompareResult | null): PathMove[] {
  const seen = new Set<string>();
  const moves: PathMove[] = [];
  for (const item of evidence) {
    if (seen.has(item.path)) continue;
    seen.add(item.path);
    const diff =
      compare?.files.find((f) => f.filename === item.path || f.previous_filename === item.path) ?? null;
    const newPath = diff?.status === "removed" ? null : (diff?.filename ?? item.path);
    moves.push({ oldPath: item.path, newPath, diff });
  }
  return moves;
}

/** True when any cited range was deleted, edited in the diff, or no longer appears in the new file. */
export function citedCodeChanged(
  evidence: EvidenceItem[],
  moves: PathMove[],
  readNew: (path: string) => string | null,
): boolean {
  return evidence.some((item) => {
    const move = moves.find((m) => m.oldPath === item.path);
    if (!move || move.newPath === null) return true;
    if (move.diff?.patch && diffTouchesRange(move.diff.patch, item.startLine, item.endLine)) return true;
    const current = readNew(move.newPath);
    if (current === null) return true;
    // Stored snippets are redacted, so compare against the redacted file — otherwise a cited
    // secret would never match and the code would always look "changed".
    const snippet = normalizeCode(item.snippet);
    return snippet !== "" && !normalizeCode(redactSecrets(current).text).includes(snippet);
  });
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

type Outcome = {
  findingId: string;
  title: string;
  persona: string;
  result: CheckResult;
  reasoning: string;
  evidence: EvidenceItem[];
};

export async function executeRecheck(
  run: RunWithProject,
  deps: EngineDeps,
  usage: Usage,
  state: { degraded: boolean; snapshot: Snapshot | null },
): Promise<void> {
  const { project } = run;
  const ref: RepoRef = { installationId: project.installationId, repoOwner: project.repoOwner, repoName: project.repoName };
  const ids = (readRunInput(run.input).targetFindingIds ?? []).slice(0, MAX_RECHECK_FINDINGS);
  const targets = await db.finding.findMany({ where: { id: { in: ids }, projectId: project.id } });
  if (targets.length === 0) throw new ReviewFailure("The findings to re-check no longer exist.");
  const limitations: string[] = [];
  const beat = () => heartbeat(run.id);

  // 1. Resolve the commit (pinned once).
  await setStage(run.id, "RESOLVING_COMMIT");
  let commitSha = run.commitSha;
  if (!commitSha) {
    commitSha = await deps.getBranchHeadSha(ref, run.branch);
    await db.reviewRun.update({ where: { id: run.id }, data: { commitSha } });
    if (run.branch === project.selectedBranch) {
      await db.project.update({ where: { id: project.id }, data: { latestKnownSha: commitSha, latestCheckedAt: new Date() } });
    }
  }
  const head = commitSha;
  if (targets.every((f) => sameCommit(f.lastSeenSha, head))) {
    await completeRecheck(run.id, NO_NEW_COMMITS, [], [], usage, state.degraded, []);
    return;
  }
  const bases = [...new Set(targets.map((f) => f.lastSeenSha).filter((sha) => !sameCommit(sha, head)))];
  await db.reviewRun.update({ where: { id: run.id }, data: { baseSha: bases[0] ?? null } });
  await assertNotCancelled(run.id);

  // 2–3. Snapshot and map at the new commit.
  await setStage(run.id, "FETCHING_SNAPSHOT");
  state.snapshot = await deps.downloadSnapshot(ref, head, run.id);
  limitations.push(...state.snapshot.limitations);
  await setStage(run.id, "MAPPING_PROJECT");
  const files = await scanSnapshot(state.snapshot.dir, state.snapshot.skipped);
  const text = await loadSnapshotText(files);
  const read = readerFromMap(text);
  // NOTE: a re-check does not replace the project map (04 §8 updates it on full reviews only).
  const projectMap = buildProjectMap({ commitSha: head, files: files.files, read });
  await assertNotCancelled(run.id);

  // Diffs since each distinct base (usually one).
  await setStage(run.id, "SELECTING_CONTEXT");
  const compares = new Map<string, CompareResult | null>();
  for (const base of bases) {
    try {
      const comparison = await deps.compareCommits(ref, base, head);
      if (comparison.truncated) limitations.push("Diff truncated by GitHub at 300 files.");
      compares.set(base, comparison);
    } catch (error) {
      if (!(error instanceof CompareUnavailable)) throw error;
      compares.set(base, null);
      limitations.push(`Could not compare with ${base.slice(0, 7)}; the re-check used the current code only.`);
    }
  }

  // 4–5. One call per finding.
  await setStage(run.id, "REVIEWING");
  const personas = [...new Set(targets.map((f) => f.persona))];
  const tracker = createPersonaStatusTracker(run.id, personas);
  await tracker.init();
  const budgets = deps.budgets();
  const outcomes: Outcome[] = [];
  const included = new Set<string>();
  let failures = 0;
  let lastError: unknown = null;

  for (const finding of targets) {
    await assertNotCancelled(run.id);
    const evidence = readJsonArray(finding.evidence, EvidenceItemSchema);

    if (sameCommit(finding.lastSeenSha, head)) {
      limitations.push(`"${finding.title}" was already reviewed at this commit and was not re-checked.`);
      continue;
    }
    if (evidence.length === 0) {
      outcomes.push({
        findingId: finding.id,
        title: finding.title,
        persona: finding.persona,
        result: "UNVERIFIABLE",
        reasoning: "This finding is based on your description, not on repository code, so it can't be re-checked automatically.",
        evidence: [],
      });
      continue;
    }

    const compare = compares.get(finding.lastSeenSha) ?? null;
    const moves = mapEvidencePaths(evidence, compare);
    const fileSet = new Set(files.files.map((f) => f.path));
    const newPaths = moves.map((m) => m.newPath).filter((p): p is string => p !== null && fileSet.has(p));
    const allFilesDeleted = newPaths.length === 0;
    const codeChanged = citedCodeChanged(evidence, moves, read);
    const relevantDiff = moves.map((m) => m.diff).filter((d): d is CompareFile => d !== null);

    const persona = isPersonaKey(finding.persona) ? finding.persona : "quality";
    const prompt = `${PERSONAS[persona].brief}\n\n${RECHECK_TASK}\n\n${EVIDENCE_REMINDER}`;
    const findingBlock = renderFindingBlock({
      title: finding.title,
      persona: finding.persona,
      severity: finding.severity,
      classification: finding.classification,
      observation: finding.observation,
      impact: finding.impact,
      lastSeenSha: finding.lastSeenSha,
      evidence,
    });
    const instructionTokens = estimateInputTokens(
      `${RECHECK_SYSTEM}\n\n${jsonInstructions(RecheckOutput)}\n\n${prompt}\n\n${findingBlock}`,
    );
    const symbols = [...new Set(evidence.map((e) => e.symbol).filter((s): s is string => !!s && s.length >= 3))];
    const candidates = expandContext({ files: files.files, read, changedFiles: newPaths, keywords: symbols }).filter((c) =>
      CONTEXT_GROUPS.has(c.group),
    );
    const bundleFor = (budget: number): ContextBundle =>
      buildContextBundle({
        projectMap,
        snapshot: { repo: `${project.repoOwner}/${project.repoName}`, branch: run.branch, commitSha: head },
        candidates,
        read,
        budgetTokens: Math.floor(budget / BUDGET_HEADROOM),
        instructionTokens,
        diff: relevantDiff.length > 0 ? { base: finding.lastSeenSha, head, files: relevantDiff } : undefined,
        // No tree: a re-check only needs the cited files, and this keeps it within the light budget.
        mapTreeLines: 0,
      });

    // Light role when the cited files fit whole in its budget, else review (05 §8).
    let role: "light" | "review" = "light";
    let bundle = bundleFor(budgets.light);
    const fitsLight = newPaths.every((p) => bundle.files.some((f) => f.path === p && !f.truncated));
    if (!fitsLight) {
      role = "review";
      bundle = bundleFor(budgets.review);
    }

    await tracker.set(finding.persona, "running");
    try {
      const result = await deps.callJson({
        role,
        task: "recheck",
        reviewType: "RECHECK",
        system: RECHECK_SYSTEM,
        context: `${bundle.text}\n\n${findingBlock}`,
        prompt,
        schema: RecheckOutput,
        runId: run.id,
        onWait: (waiting) => tracker.set(finding.persona, waiting ? "waiting_rate_limit" : "running"),
        heartbeat: beat,
      });
      addUsage(usage, result.usage);
      if (result.degraded) state.degraded = true;
      for (const path of bundle.filesIncluded) included.add(path);

      const validated = validateEvidence(result.data.evidence, {
        files: new Map(bundle.files.map((f) => [f.path, f])),
        commitSha: head,
      });
      const decision = applyRecheckRules({
        result: result.data.result,
        hasValidEvidence: validated.evidence.length > 0,
        codeChanged,
        allFilesDeleted,
      });
      const reasoning = result.data.reasoning.trim().slice(0, 4000) || "No reasoning given.";
      outcomes.push({
        findingId: finding.id,
        title: finding.title,
        persona: finding.persona,
        result: decision.result,
        reasoning: decision.note ? `${reasoning}\n\n${decision.note}` : reasoning,
        evidence: validated.evidence,
      });
      await tracker.set(finding.persona, "done");
    } catch (error) {
      if (error instanceof RunCancelled) throw error;
      failures += 1;
      lastError = error;
      console.warn(`[athenyx] Re-check of finding ${finding.id} failed:`, (error as Error)?.name);
      limitations.push(`Re-check of "${finding.title}" failed (${personaName(finding.persona)}).`);
      await tracker.set(finding.persona, "failed");
    }
  }

  if (outcomes.length === 0 && failures > 0) {
    if (lastError instanceof AiUnavailableError || lastError instanceof AiConfigError) throw lastError;
    throw new ReviewFailure("The re-check failed. Try again later.");
  }

  // 6. Save checks and status changes in one transaction.
  await setStage(run.id, "SAVING");
  const counts = { RESOLVED: 0, STILL_PRESENT: 0, PARTIALLY_RESOLVED: 0, UNVERIFIABLE: 0 } as Record<CheckResult, number>;
  for (const o of outcomes) counts[o.result] += 1;
  const parts = [
    counts.RESOLVED && `${counts.RESOLVED} resolved`,
    counts.PARTIALLY_RESOLVED && `${counts.PARTIALLY_RESOLVED} partially resolved`,
    counts.STILL_PRESENT && `${counts.STILL_PRESENT} still present`,
    counts.UNVERIFIABLE && `${counts.UNVERIFIABLE} unverifiable`,
  ].filter(Boolean);
  const summary = `Re-checked ${outcomes.length} finding${outcomes.length === 1 ? "" : "s"} at ${head.slice(0, 7)}${
    parts.length > 0 ? `: ${parts.join(", ")}.` : "."
  }`;

  await completeRecheck(run.id, summary, outcomes, [...included], usage, state.degraded, limitations, head, tracker.snapshot());
}

async function completeRecheck(
  runId: string,
  summary: string,
  outcomes: Outcome[],
  filesIncluded: string[],
  usage: Usage,
  degraded: boolean,
  limitations: string[],
  commitSha?: string,
  personaStatus?: Record<string, string>,
): Promise<void> {
  const coverage: Coverage = { filesIncluded, filesExcluded: [], limitations: [...new Set(limitations)] };
  await db.$transaction(async (tx) => {
    const updated = await tx.reviewRun.updateMany({
      where: { id: runId, status: "RUNNING" },
      data: {
        status: "COMPLETED",
        stage: "DONE",
        summary,
        coverage: coverage as unknown as Prisma.InputJsonValue,
        degraded,
        finishedAt: new Date(),
        ...(personaStatus ? { personaStatus: personaStatus as Prisma.InputJsonValue } : {}),
        ...usageData(usage),
      },
    });
    if (updated.count === 0) throw new RunCancelled();
    if (!commitSha) return;

    for (const outcome of outcomes) {
      const evidence = outcome.evidence.length > 0 ? (outcome.evidence as unknown as Prisma.InputJsonValue) : undefined;
      await tx.findingCheck.create({
        data: {
          findingId: outcome.findingId,
          runId,
          commitSha,
          result: outcome.result,
          reasoning: outcome.reasoning,
          evidence,
        },
      });
      if (outcome.result === "RESOLVED") {
        await tx.finding.update({ where: { id: outcome.findingId }, data: { status: "RESOLVED", statusNote: null } });
      } else if (outcome.result === "STILL_PRESENT" || outcome.result === "PARTIALLY_RESOLVED") {
        const current = await tx.finding.findUnique({ where: { id: outcome.findingId }, select: { status: true } });
        await tx.finding.update({
          where: { id: outcome.findingId },
          data: {
            // lastSeenSha moves only with fresh evidence, so stored line numbers always belong to it.
            ...(evidence ? { evidence, lastSeenSha: commitSha } : {}),
            // NOTE: a finding marked resolved by hand that is still present is reopened.
            ...(current?.status === "RESOLVED" ? { status: "OPEN" as const, statusNote: null } : {}),
          },
        });
      }
      // UNVERIFIABLE: no status change.
    }
  });
}

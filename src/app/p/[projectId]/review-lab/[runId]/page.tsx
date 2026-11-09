import { notFound } from "next/navigation";
import { GitBranch, GitCommit } from "lucide-react";
import { RecheckButton } from "@/components/findings/recheck-button";
import { PageHeader } from "@/components/page-header";
import { VerdictCard } from "@/components/release/verdict-card";
import { RecheckResult } from "@/components/review/recheck-result";
import { RunProgress, type RunSnapshot } from "@/components/review/run-progress";
import { RunResult } from "@/components/review/run-result";
import { TryAgain } from "@/components/review/try-again";
import { RelativeTime } from "@/components/relative-time";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { requirePageProject } from "@/lib/authz";
import { commitUrl } from "@/lib/github/repo";
import { releaseAssessment } from "@/lib/queries/release";
import { getProjectRun, getRunChecks, getRunFindings } from "@/lib/queries/runs";
import { STATUS_LABELS } from "@/lib/review/labels";
import { readRunInput, REVIEW_TYPES, type PersonaRunStatus } from "@/lib/review/types";
import { cn } from "@/lib/utils";

export const metadata = { title: "Review · Athenyx" };

const INPUT_LABELS: Record<string, string> = {
  focus: "Focus",
  question: "Question",
  brief: "Proposal",
  constraints: "Constraints",
  symptom: "Symptom",
  expected: "Expected",
  actual: "Actual",
  log: "Log",
};

const STATUS_TONE = {
  QUEUED: "text-muted-foreground",
  RUNNING: "text-link",
  COMPLETED: "text-ok",
  FAILED: "text-destructive",
  CANCELLED: "text-muted-foreground",
} as const;

/** One review run: live progress while it runs, the result afterwards. DB reads only. */
export default async function RunPage({ params }: PageProps<"/p/[projectId]/review-lab/[runId]">) {
  const { projectId, runId } = await params;
  const { project } = await requirePageProject(projectId);
  const run = await getProjectRun(project.id, runId);
  if (!run) notFound();

  const input = readRunInput(run.input);
  const inputEntries = Object.entries(input).filter(([key]) => key in INPUT_LABELS);
  const active = run.status === "QUEUED" || run.status === "RUNNING";
  const isRecheck = run.type === "RECHECK";
  const findings = run.status === "COMPLETED" && !isRecheck ? await getRunFindings(project.id, run.id) : [];
  const checks = run.status === "COMPLETED" && isRecheck ? await getRunChecks(project.id, run.id) : [];
  const isRelease = run.type === "RELEASE";
  const assessment = run.status === "COMPLETED" && isRelease ? await releaseAssessment(project.id, run.id) : null;
  const back = isRelease ? { href: `/p/${project.id}/release`, label: "Release Gate" } : { href: `/p/${project.id}/review-lab`, label: "Review Lab" };

  const snapshot: RunSnapshot = {
    status: run.status,
    stage: run.stage,
    commitSha: run.commitSha,
    personas: run.personas,
    personaStatus: (run.personaStatus as Record<string, PersonaRunStatus> | null) ?? null,
  };

  return (
    <div className="space-y-14">
      <div className="space-y-6">
        <PageHeader back={back} title={REVIEW_TYPES[run.type].label} />
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
          <span className={cn("inline-flex items-center gap-1.5 font-semibold", STATUS_TONE[run.status])}>
            {active ? <span className="live-dot !size-1.5" /> : null}
            {STATUS_LABELS[run.status]}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <GitBranch className="size-3.5" />
            {run.branch}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <GitCommit className="size-3.5" />
            {run.commitSha ? (
              <a
                href={commitUrl(project.repoOwner, project.repoName, run.commitSha)}
                target="_blank"
                rel="noreferrer"
                className="link-underline font-mono text-[0.8125rem] text-foreground"
              >
                {run.commitSha.slice(0, 7)}
              </a>
            ) : (
              "resolving commit"
            )}
            {run.baseSha ? (
              <span>
                compared with <span className="font-mono text-[0.8125rem]">{run.baseSha.slice(0, 7)}</span>
              </span>
            ) : null}
          </span>
          <span>
            Started <RelativeTime date={run.createdAt} />
          </span>
        </div>
        {inputEntries.length > 0 ? (
          <dl className="max-w-3xl space-y-3 rounded-md bg-muted px-5 py-4 text-sm">
            {inputEntries.map(([key, value]) => (
              <div key={key} className="grid gap-1 sm:grid-cols-[7rem_1fr]">
                <dt className="text-muted-foreground">{INPUT_LABELS[key]}</dt>
                <dd className={key === "log" ? "max-h-40 overflow-y-auto font-mono text-xs whitespace-pre-wrap" : "whitespace-pre-wrap"}>
                  {String(value)}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>

      {active ? <RunProgress runId={run.id} initial={snapshot} /> : null}

      {run.status === "FAILED" ? (
        <div className="max-w-2xl space-y-4">
          <Alert variant="destructive">
            <AlertTitle>The review failed</AlertTitle>
            <AlertDescription>{run.error ?? "Something went wrong."}</AlertDescription>
          </Alert>
          {isRecheck ? (
            <RecheckButton projectId={project.id} findingIds={input.targetFindingIds ?? []} navigate label="Try again" variant="default" />
          ) : (
            <TryAgain projectId={project.id} type={run.type} input={input as Record<string, unknown>} branch={isRelease ? run.branch : undefined} />
          )}
        </div>
      ) : null}

      {run.status === "CANCELLED" ? (
        <Alert className="max-w-2xl">
          <AlertTitle>Review cancelled</AlertTitle>
          <AlertDescription>No findings were saved from this review.</AlertDescription>
        </Alert>
      ) : null}

      {run.status === "COMPLETED" && isRecheck ? (
        <RecheckResult run={run} checks={checks} projectId={project.id} owner={project.repoOwner} repo={project.repoName} />
      ) : null}

      {assessment ? (
        <VerdictCard
          projectId={project.id}
          verdict={assessment.verdict}
          report={assessment.report}
          commitSha={run.commitSha}
          branch={run.branch}
          finishedAt={run.finishedAt}
          blocking={assessment.blocking}
        />
      ) : null}

      {run.status === "COMPLETED" && !isRecheck ? (
        <RunResult run={run} findings={findings} owner={project.repoOwner} repo={project.repoName} />
      ) : null}
    </div>
  );
}

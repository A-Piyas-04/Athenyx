import { CircleCheck } from "lucide-react";
import type { ReviewRun } from "@/generated/prisma/client";
import { FindingCard, type FindingCardData } from "@/components/findings/finding-card";
import { Markdown } from "@/components/markdown";
import { Disclosure } from "@/components/motion/disclosure";
import { Reveal, Stagger, StaggerItem } from "@/components/motion/primitives";
import { Section } from "@/components/page-header";
import { ReviewBoard, type BoardFinding } from "@/components/board/review-board";
import { RelativeTime } from "@/components/relative-time";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { formatDuration } from "@/lib/review/labels";
import { readCoverage, REVIEW_TYPES } from "@/lib/review/types";

type UsageJson = { inputTokens?: number; outputTokens?: number; calls?: number; models?: string[] };

function readUsage(value: unknown): UsageJson | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as UsageJson) : null;
}

const ANSWER_TITLES: Partial<Record<ReviewRun["type"], string>> = {
  ASK: "Answer",
  PROPOSAL: "Assessment",
  ISSUE: "Investigation",
};

/** The completed run (06 "RunResult"): summary first, details on expand. */
export function RunResult({
  run,
  findings,
  owner,
  repo,
}: {
  run: ReviewRun;
  findings: FindingCardData[];
  owner: string;
  repo: string;
}) {
  const coverage = readCoverage(run.coverage);
  const usage = readUsage(run.usage);
  const specialists = coverage?.specialists ?? [];
  const degradedPersonas = new Set(specialists.filter((s) => s.degraded).map((s) => s.persona));
  const duration = run.startedAt && run.finishedAt ? run.finishedAt.getTime() - run.startedAt.getTime() : null;
  const tokens = (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0);
  const byPersona: Record<string, BoardFinding[]> = {};
  for (const f of findings) {
    const first = f.evidence[0];
    (byPersona[f.persona] ??= []).push({
      id: f.id,
      title: f.title,
      severity: f.severity,
      location: first ? `${first.path}:${first.startLine}` : null,
    });
  }

  return (
    <div className="space-y-16">
      {run.degraded ? (
        <Alert variant="warning">
          <AlertTitle>Fallback AI models were used</AlertTitle>
          <AlertDescription>
            Higher-quality free models were rate-limited, so some reviewers used fallbacks. Results may be less thorough; you can
            re-run later.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className={REVIEW_TYPES[run.type].producesAnswer ? "grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-16" : "max-w-[72ch]"}>
        <Reveal>
          <Section title="Summary">
            {run.summary ? (
              <Markdown className="text-[0.9375rem]">{run.summary}</Markdown>
            ) : (
              <p className="text-sm text-muted-foreground">No summary.</p>
            )}
          </Section>
        </Reveal>

        {REVIEW_TYPES[run.type].producesAnswer ? (
          <Reveal delay={0.08}>
            <Section title={ANSWER_TITLES[run.type] ?? "Answer"}>
              {run.answer ? (
                <Markdown className="text-[0.9375rem]">{run.answer}</Markdown>
              ) : (
                <p className="text-sm text-muted-foreground">The reviewers could not answer from the code they saw.</p>
              )}
              {run.type === "ISSUE" ? (
                <p className="text-xs text-muted-foreground">Athenyx reads code; it never runs it. These are causes to check, not a reproduction.</p>
              ) : null}
            </Section>
          </Reveal>
        ) : null}
      </div>

      {specialists.length > 0 ? (
        <Reveal>
          <ReviewBoard
            projectId={run.projectId}
            specialists={specialists}
            board={coverage?.board ?? null}
            findings={byPersona}
            showAnswers={REVIEW_TYPES[run.type].producesAnswer}
          />
        </Reveal>
      ) : null}

      <Section title={findings.length > 0 ? `Findings (${findings.length})` : "Findings"}>
        {findings.length === 0 ? (
          <p className="flex items-center gap-2 text-sm">
            <CircleCheck className="size-4 text-ok" />
            No significant issues in the reviewed code.
          </p>
        ) : (
          <Stagger as="div" className="border-t border-border">
            {findings.map((finding) => (
              <StaggerItem as="div" key={finding.id}>
                <FindingCard
                  finding={finding}
                  projectId={run.projectId}
                  owner={owner}
                  repo={repo}
                  fallbackModel={degradedPersonas.has(finding.persona)}
                />
              </StaggerItem>
            ))}
          </Stagger>
        )}
      </Section>

      {coverage ? (
        <div className="divide-y divide-border border-y border-border">
          {coverage ? (
            <Disclosure
              summary={<span className="text-sm font-semibold">Coverage and limitations</span>}
              summaryClassName="py-4"
              contentClassName="space-y-6 pb-6 text-sm"
            >
              {coverage.limitations.length > 0 ? (
                <ul className="list-disc space-y-1.5 pl-5 text-muted-foreground">
                  {coverage.limitations.map((l, i) => (
                    <li key={i}>{l}</li>
                  ))}
                </ul>
              ) : null}
              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <div className="font-medium">Files reviewed ({coverage.filesIncluded.length})</div>
                  <ul className="max-h-60 overflow-y-auto font-mono text-xs leading-6 text-muted-foreground">
                    {coverage.filesIncluded.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                </div>
                {coverage.filesExcluded.length > 0 ? (
                  <div className="space-y-2">
                    <div className="font-medium">Files excluded ({coverage.filesExcluded.length})</div>
                    <ul className="max-h-60 overflow-y-auto font-mono text-xs leading-6 text-muted-foreground">
                      {coverage.filesExcluded.map((f) => (
                        <li key={f.path}>
                          {f.path} <span className="font-sans text-subtle">({f.reason.replace("_", " ")})</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </Disclosure>
          ) : null}

        </div>
      ) : null}

      <footer className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
        {usage?.models && usage.models.length > 0 ? <span>Models: {usage.models.join(", ")}</span> : null}
        {tokens > 0 ? <span>About {tokens.toLocaleString("en-US")} tokens</span> : null}
        {usage?.calls ? <span>{usage.calls} AI calls</span> : null}
        {duration !== null ? <span>Took {formatDuration(duration)}</span> : null}
        {run.finishedAt ? (
          <span>
            Finished <RelativeTime date={run.finishedAt} />
          </span>
        ) : null}
      </footer>
    </div>
  );
}

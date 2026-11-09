import Link from "next/link";
import { ReleaseLauncher } from "@/components/release/release-launcher";
import { VerdictBadge, VerdictCard } from "@/components/release/verdict-card";
import type { ProviderNotice } from "@/components/review/data-notice";
import { ActiveRunNotice } from "@/components/review/active-run-notice";
import { Reveal, Stagger, StaggerItem } from "@/components/motion/primitives";
import { EmptyState, PageHeader, Section } from "@/components/page-header";
import { RelativeTime } from "@/components/relative-time";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { getAiConfig, providersForReviewType } from "@/lib/ai/config";
import { requirePageProject } from "@/lib/authz";
import { releaseAssessment, releaseHistory } from "@/lib/queries/release";
import { getActiveRun, getRunFindings } from "@/lib/queries/runs";
import { readCoverage } from "@/lib/review/types";
import { BoardStances } from "@/components/board/board-stances";
import { STATUS_LABELS } from "@/lib/review/labels";

export const metadata = { title: "Release Gate · Athenyx" };

/** Release Gate (06): advisory Go / Conditional Go / No-Go. DB reads only on load. */
export default async function ReleaseGatePage({ params }: PageProps<"/p/[projectId]/release">) {
  const { projectId } = await params;
  const { project } = await requirePageProject(projectId);
  const [latest, history, activeRun] = await Promise.all([
    releaseAssessment(project.id),
    releaseHistory(project.id),
    getActiveRun(project.id),
  ]);

  let providers: ProviderNotice[] = [];
  let aiError: string | null = null;
  if (process.env.ATHENYX_PREVIEW === "1") {
    providers = [{ name: "preview", label: "Sample preview", termsUrl: null, local: true }];
  } else try {
    providers = providersForReviewType(getAiConfig(), "RELEASE");
  } catch (error) {
    aiError = error instanceof Error ? error.message : "The AI configuration is invalid.";
  }

  const latestCoverage = latest ? readCoverage(latest.run.coverage) : null;
  const latestFindings = latest ? await getRunFindings(project.id, latest.run.id) : [];

  const olderCommit =
    latest !== null &&
    latest.run.branch === project.selectedBranch &&
    project.latestKnownSha !== null &&
    latest.run.commitSha !== project.latestKnownSha;

  return (
    <div className="space-y-16">
      <PageHeader
        title="Release readiness"
        description="An advisory check of one exact commit: CI results, tests, open risks and a focused review."
      />

      <div className="space-y-4">
        {activeRun ? <ActiveRunNotice projectId={project.id} run={activeRun} /> : null}
        <ReleaseLauncher busy={activeRun !== null} projectId={project.id} selectedBranch={project.selectedBranch} providers={providers} aiError={aiError} />
      </div>

      {latest ? (
        <Reveal className="space-y-6 border-t border-border pt-12">
          {olderCommit ? (
            <Alert variant="warning">
              <AlertDescription>
                This assessment is for an older commit (<span className="font-mono">{latest.run.commitSha?.slice(0, 7)}</span>). The latest
                known commit is <span className="font-mono">{project.latestKnownSha?.slice(0, 7)}</span>.
              </AlertDescription>
            </Alert>
          ) : null}
          <VerdictCard
            projectId={project.id}
            verdict={latest.verdict}
            report={latest.report}
            commitSha={latest.run.commitSha}
            branch={latest.run.branch}
            finishedAt={latest.run.finishedAt}
            blocking={latest.blocking}
            summary={latest.run.summary}
            runId={latest.run.id}
            assessedBy={
              latestCoverage?.specialists?.length ? (
                <BoardStances specialists={latestCoverage.specialists} findings={latestFindings} />
              ) : undefined
            }
          />
        </Reveal>
      ) : (
        <EmptyState title="No assessment yet">Pick a branch and assess it. The verdict, its conditions and any blocking findings will show here.</EmptyState>
      )}

      {history.length > 1 ? (
        <Section title="History">
          <Stagger className="border-t border-border">
            {history.map((run) => (
              <StaggerItem key={run.id} className="border-b border-border">
                <Link
                  href={`/p/${project.id}/review-lab/${run.id}`}
                  className="-mx-3 grid grid-cols-[8.5rem_minmax(0,1fr)_auto] items-center gap-4 rounded-md px-3 py-3 text-sm row-hover"
                >
                  {run.verdict ? (
                    <VerdictBadge verdict={run.verdict} />
                  ) : (
                    <span className={run.status === "FAILED" ? "text-xs font-medium text-destructive" : "text-xs text-muted-foreground"}>
                      {STATUS_LABELS[run.status]}
                    </span>
                  )}
                  <span className="min-w-0 truncate">
                    {run.branch} <span className="font-mono text-xs text-muted-foreground">{run.commitSha ? run.commitSha.slice(0, 7) : ""}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    <RelativeTime date={run.createdAt} />
                  </span>
                </Link>
              </StaggerItem>
            ))}
          </Stagger>
        </Section>
      ) : null}
    </div>
  );
}

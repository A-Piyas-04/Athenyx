import { ActiveRunNotice } from "@/components/review/active-run-notice";
import { RecentRuns } from "@/components/review/recent-runs";
import { ReviewLauncher, type LabType, type ProviderNotice } from "@/components/review/review-launcher";
import { PersonaMark } from "@/components/board/persona-mark";
import { PageHeader, TextLink } from "@/components/page-header";
import { getAiConfig, providersForReviewType } from "@/lib/ai/config";
import { requirePageProject } from "@/lib/authz";
import { getActiveRun, getRecentRuns } from "@/lib/queries/runs";
import { ROSTER } from "@/lib/review/board";

export const metadata = { title: "Review Lab · Athenyx" };

const LAB_TYPES: LabType[] = ["PROJECT_HEALTH", "LATEST_CHANGES", "ASK", "PROPOSAL", "ISSUE"];

/** The core bench, for the sidebar teaser. */
const BENCH = ROSTER.filter((seat) => seat.kind === "core");

/** Review Lab: pick a review type and start it. DB reads only — no AI on page load. */
export default async function ReviewLabPage({ params, searchParams }: PageProps<"/p/[projectId]/review-lab">) {
  const { projectId } = await params;
  const { type } = await searchParams;
  const { project } = await requirePageProject(projectId);
  const [runs, activeRun] = await Promise.all([getRecentRuns(project.id, 8), getActiveRun(project.id)]);

  // Provider names for the data notice come from server configuration.
  let aiError: string | null = null;
  const notices = {} as Record<LabType, ProviderNotice[]>;
  try {
    const config = getAiConfig();
    for (const t of LAB_TYPES) notices[t] = providersForReviewType(config, t);
  } catch (error) {
    aiError = error instanceof Error ? error.message : "The AI configuration is invalid.";
    for (const t of LAB_TYPES) notices[t] = [];
  }

  const requested = typeof type === "string" ? (type as LabType) : null;
  const initialType: LabType =
    requested && LAB_TYPES.includes(requested)
      ? requested === "LATEST_CHANGES" && !project.lastReviewedSha
        ? "PROJECT_HEALTH"
        : requested
      : "PROJECT_HEALTH";

  return (
    <div className="grid gap-16 lg:grid-cols-[minmax(0,1fr)_17rem] lg:gap-20">
      <div className="min-w-0 space-y-10">
        <PageHeader
          title="Start a review"
          description={
            <>
              Reads <span className="font-medium text-foreground">{project.selectedBranch}</span> at its latest commit. Nothing runs
              until you press Start.
            </>
          }
        />
        {activeRun ? <ActiveRunNotice projectId={project.id} run={activeRun} /> : null}
        <ReviewLauncher
          key={initialType}
          busy={activeRun !== null}
          projectId={project.id}
          initialType={initialType}
          lastReviewedSha={project.lastReviewedSha}
          notices={notices}
          aiError={aiError}
        />
      </div>

      <aside className="space-y-10 lg:sticky lg:top-24 lg:self-start lg:pt-2">
        <div className="space-y-3">
          <h2 className="text-section">Recent</h2>
          <RecentRuns projectId={project.id} runs={runs} />
        </div>

        {/* Who could be seated. The review itself names who actually was. */}
        <div className="space-y-3">
          <h2 className="text-section">The review board</h2>
          <ul className="flex flex-wrap gap-1.5">
            {BENCH.map((seat) => (
              <li key={seat.key} title={`${seat.name}: ${seat.focus}`}>
                <PersonaMark persona={seat.key} size="sm" tone="idle" />
              </li>
            ))}
          </ul>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {BENCH.length} specialists. Each review seats the two or three that fit the request, and names them in the
            result.
          </p>
          <TextLink href="/board">Meet the board</TextLink>
        </div>
      </aside>
    </div>
  );
}

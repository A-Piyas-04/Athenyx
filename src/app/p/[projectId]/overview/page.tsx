import Link from "next/link";
import { ArrowRight, ArrowUpRight, Play } from "lucide-react";
import type { Severity } from "@/generated/prisma/enums";
import { CLASSIFICATION_LABELS, SEVERITY_LABELS } from "@/lib/review/labels";
import { SEVERITY_COLOR, SeverityDot } from "@/components/findings/badges";
import { Markdown } from "@/components/markdown";
import { CountUp, GrowBar, Reveal, Stagger, StaggerItem } from "@/components/motion/primitives";
import { Section, TextLink } from "@/components/page-header";
import { VerdictText } from "@/components/release/verdict-card";
import { VerdictGauge } from "@/components/visuals/verdict-gauge";
import { SeverityRing } from "@/components/visuals/severity-ring";
import { RelativeTime } from "@/components/relative-time";
import { Button } from "@/components/ui/button";
import { requirePageProject } from "@/lib/authz";
import { proposedDecisions } from "@/lib/queries/decisions";
import { healthCounts, lastReview, latestVerdict, openByPersona, riskHotspots, topOpenRisks } from "@/lib/queries/overview";
import { BoardStrip } from "@/components/board/board-strip";
import { REVIEW_TYPES } from "@/lib/review/types";

export const metadata = { title: "Overview · Athenyx" };

const SEVERITIES: Severity[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];

/** Overview (06 §3): current known project health. DB reads only. */
export default async function OverviewPage({ params }: PageProps<"/p/[projectId]/overview">) {
  const { projectId } = await params;
  const { project } = await requirePageProject(projectId);
  const base = `/p/${project.id}`;
  const [counts, risks, review, verdict, proposed, hotspots, byPersona] = await Promise.all([
    healthCounts(project.id),
    topOpenRisks(project.id),
    lastReview(project.id),
    latestVerdict(project.id),
    proposedDecisions(project.id),
    riskHotspots(project.id),
    openByPersona(project.id),
  ]);

  if (!review) {
    return (
      <div className="max-w-3xl space-y-8 py-6 sm:py-12">
        <h1 className="text-display text-[2.75rem] sm:text-[4.25rem]">
          Nothing reviewed yet.
          <span className="block text-muted-foreground">Start with a health check.</span>
        </h1>
        <p className="max-w-[56ch] text-base text-muted-foreground">
          A Project Health review reads <span className="font-medium text-foreground">{project.selectedBranch}</span> at its exact
          commit, picks the specialists that fit your stack, and records findings that cite real lines of code. Nothing runs
          until you start it.
        </p>
        <Button asChild size="lg">
          <Link href={`${base}/review-lab?type=PROJECT_HEALTH`}>
            <Play />
            Run a Project Health review
          </Link>
        </Button>
      </div>
    );
  }

  const n = counts.totalOpen;
  const critical = counts.open.CRITICAL ?? 0;
  const high = counts.open.HIGH ?? 0;
  const subline =
    n === 0
      ? "Nothing needs your attention."
      : critical > 0
        ? `${critical} ${critical === 1 ? "is" : "are"} critical.`
        : high > 0
          ? `${high} ${high === 1 ? "is" : "are"} high severity.`
          : "None are critical.";

  return (
    <div className="space-y-20">
      {/* Health: the one statement this page exists to make. */}
      <section aria-label="Project health" className="space-y-10">
        <div className="flex flex-col gap-10 md:flex-row md:items-center md:justify-between md:gap-12">
          <div className="space-y-8">
            <h1 className="text-display text-[2.75rem] sm:text-[4.5rem]">
              {n === 0 ? (
                "No open risks."
              ) : (
                <>
                  <CountUp value={n} /> open risk{n === 1 ? "" : "s"}.
                </>
              )}
              <span className="block text-muted-foreground">{subline}</span>
            </h1>
            <Button asChild size="lg">
              <Link href={`${base}/review-lab`}>
                <Play />
                Review now
              </Link>
            </Button>
          </div>
          <SeverityRing counts={counts.open} total={n} size={240} className="mx-auto md:mx-0" />
        </div>

        <div className="space-y-4">
          <div className="flex h-2 w-full gap-[3px] overflow-hidden rounded-[2px] bg-muted" role="img" aria-label="Open findings by severity">
            {n > 0
              ? SEVERITIES.map((severity, index) => {
                  const count = counts.open[severity] ?? 0;
                  return count > 0 ? (
                    <GrowBar key={severity} width={`${(count / n) * 100}%`} delay={0.15 + index * 0.08} className={SEVERITY_COLOR[severity]} />
                  ) : null;
                })
              : null}
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            {SEVERITIES.map((severity) => (
              <Link
                key={severity}
                href={`${base}/risks?severity=${severity}`}
                className="group inline-flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground"
              >
                <SeverityDot severity={severity} />
                {SEVERITY_LABELS[severity]}
                <span className="font-semibold text-foreground tabular-nums">{counts.open[severity] ?? 0}</span>
              </Link>
            ))}
            <span className="hidden h-4 w-px bg-border sm:block" aria-hidden="true" />
            <Link href={`${base}/risks?status=ACCEPTED_RISK`} className="text-muted-foreground transition-colors hover:text-foreground">
              Accepted <span className="font-semibold text-foreground tabular-nums">{counts.acceptedRisks}</span>
            </Link>
            <Link href={`${base}/risks?status=RESOLVED`} className="text-muted-foreground transition-colors hover:text-foreground">
              Resolved <span className="font-semibold text-ok tabular-nums">{counts.resolved}</span>
            </Link>
          </div>
        </div>
      </section>

      <div className="grid gap-16 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:gap-20">
        <div className="space-y-14">
        <Section
          title="Needs attention"
          actions={n > risks.length ? <TextLink href={`${base}/risks`}>All {n} open</TextLink> : null}
        >
          {risks.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing open. New findings will show up here after a review.</p>
          ) : (
            <Stagger className="border-t border-border">
              {risks.map((r) => (
                <StaggerItem key={r.id} className="border-b border-border">
                  <Link
                    href={`${base}/risks/${r.id}`}
                    className="group -mx-3 grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-3 rounded-md px-3 py-4 row-hover"
                  >
                    <SeverityDot severity={r.severity} className="mt-[7px]" />
                    <span className="min-w-0">
                      <span className="block font-medium leading-snug">{r.title}</span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {SEVERITY_LABELS[r.severity]} severity, {CLASSIFICATION_LABELS[r.classification].toLowerCase()}
                      </span>
                    </span>
                    <ArrowRight className="mt-1 size-4 -translate-x-1 text-muted-foreground opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100" />
                  </Link>
                </StaggerItem>
              ))}
            </Stagger>
          )}
        </Section>
        {hotspots.length > 1 ? (
          <Reveal>
            <Section title="Hotspots" description="Files holding the most open findings.">
              <ul className="space-y-3">
                {hotspots.map((h, i) => {
                  const slash = h.path.lastIndexOf("/");
                  return (
                    <li key={h.path} className="grid grid-cols-[minmax(0,1fr)_7rem_1.5rem] items-center gap-4 text-sm">
                      <span className="min-w-0 truncate font-mono text-[0.8125rem]" title={h.path}>
                        <span className="text-muted-foreground">{slash >= 0 ? h.path.slice(0, slash + 1) : ""}</span>
                        {h.path.slice(slash + 1)}
                      </span>
                      <span className="h-1.5 overflow-hidden rounded-[1px] bg-muted">
                        <GrowBar width={`${(h.count / hotspots[0].count) * 100}%`} delay={0.1 + i * 0.07} className={SEVERITY_COLOR[h.worst]} />
                      </span>
                      <span className="text-right font-semibold tabular-nums">{h.count}</span>
                    </li>
                  );
                })}
              </ul>
            </Section>
          </Reveal>
        ) : null}
        </div>

        <div className="space-y-14">
          <Reveal>
            <Section title="Last review">
              <p className="text-sm text-muted-foreground">
                {REVIEW_TYPES[review.type].label} of {review.branch} at{" "}
                <span className="font-mono text-[0.8125rem] text-foreground">{review.commitSha?.slice(0, 7) ?? "—"}</span>
                {review.finishedAt ? (
                  <>
                    , <RelativeTime date={review.finishedAt} />
                  </>
                ) : null}
              </p>
              {review.summary ? (
                <div className="line-clamp-5 text-foreground/90">
                  <Markdown>{review.summary}</Markdown>
                </div>
              ) : null}
              <TextLink href={`${base}/review-lab/${review.id}`}>Read the full review</TextLink>
            </Section>
          </Reveal>

          <Reveal delay={0.04}>
            <Section title="The board" description="Who raised the open findings. Gold seats flag serious issues.">
              <BoardStrip projectId={project.id} counts={byPersona} />
              <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
                Counts span every review so far, not one run. <TextLink href="/board">Meet the board</TextLink>
              </p>
            </Section>
          </Reveal>

          <Reveal delay={0.08}>
            <Section title="Release readiness">
              {verdict?.verdict ? (
                <Link href={`${base}/release`} className="group flex items-center gap-5">
                  <VerdictGauge verdict={verdict.verdict} size={96} labels={false} />
                  <span className="space-y-1">
                    <span className="flex items-center gap-2">
                      <VerdictText verdict={verdict.verdict} className="text-2xl" />
                      <ArrowUpRight className="size-4 text-muted-foreground transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                    </span>
                    <span className="block text-sm text-muted-foreground">
                      {verdict.branch} at <span className="font-mono text-[0.8125rem]">{verdict.commitSha?.slice(0, 7)}</span>. Advisory only.
                    </span>
                  </span>
                </Link>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Not assessed yet. <TextLink href={`${base}/release`}>Check release readiness</TextLink>
                </p>
              )}
            </Section>
          </Reveal>

          {proposed.length > 0 ? (
            <Reveal delay={0.16}>
              <Section title="Decisions waiting">
                <ul className="space-y-2.5">
                  {proposed.map((d) => (
                    <li key={d.id} className="flex items-baseline justify-between gap-3 text-sm">
                      <Link href={`${base}/decisions/${d.id}`} className="link-underline min-w-0 truncate">
                        {d.title}
                      </Link>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        <RelativeTime date={d.createdAt} />
                      </span>
                    </li>
                  ))}
                </ul>
              </Section>
            </Reveal>
          ) : null}
        </div>
      </div>
    </div>
  );
}

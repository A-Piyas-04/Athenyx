import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { SeverityBadge } from "@/components/findings/badges";
import { EvidenceBlock } from "@/components/findings/evidence-block";
import { Block, FindingNarrative, FixOptionsList } from "@/components/findings/finding-card";
import { RecheckButton } from "@/components/findings/recheck-button";
import { CheckResultBadge, FindingStatusBadge } from "@/components/findings/status-badge";
import { StatusActions } from "@/components/findings/status-actions";
import { Disclosure } from "@/components/motion/disclosure";
import { Reveal } from "@/components/motion/primitives";
import { LifecycleFlow } from "@/components/visuals/lifecycle-flow";
import { PersonaMark } from "@/components/board/persona-mark";
import { PageHeader, Section } from "@/components/page-header";
import { RelativeTime } from "@/components/relative-time";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { requirePageProject } from "@/lib/authz";
import { displayNote, isManualResolution } from "@/lib/findings/status";
import { commitUrl } from "@/lib/github/repo";
import { activeRecheckFor, getFindingDetail } from "@/lib/queries/findings";
import { CLASSIFICATION_LABELS, CONFIDENCE_LABELS, DECISION_STATUS_LABELS, FINDING_STATUS_LABELS, personaLabel } from "@/lib/review/labels";

export const metadata = { title: "Finding · Athenyx" };

/** Finding detail (06 Risk Center). DB reads only; Re-check is an explicit button. */
export default async function FindingPage({ params }: PageProps<"/p/[projectId]/risks/[findingId]">) {
  const { projectId, findingId } = await params;
  const { project } = await requirePageProject(projectId);
  const detail = await getFindingDetail(project.id, findingId);
  if (!detail) notFound();
  const { finding, firstSeenRun, checks, decisions } = detail;
  const activeRun = await activeRecheckFor(project.id, finding.id);
  const manual = isManualResolution(finding);
  const note = displayNote(finding.statusNote);
  const latest = checks[0] ?? null;
  const sha = (value: string) => (
    <a
      href={commitUrl(project.repoOwner, project.repoName, value)}
      target="_blank"
      rel="noreferrer"
      className="link-underline font-mono text-[0.8125rem] text-foreground"
    >
      {value.slice(0, 7)}
    </a>
  );

  return (
    <div className="space-y-12">
      <PageHeader back={{ href: `/p/${project.id}/risks`, label: "Risks" }} title={finding.title} />

      <div className="grid gap-14 lg:grid-cols-[minmax(0,1fr)_17rem] lg:gap-20">
        <div className="min-w-0 space-y-14">
          {note ? (
            <Alert variant={finding.status === "ACCEPTED_RISK" ? "warning" : "default"}>
              <AlertTitle>{manual ? "Marked resolved by you (not verified)" : `${FINDING_STATUS_LABELS[finding.status]}: note`}</AlertTitle>
              <AlertDescription className="whitespace-pre-line">{note}</AlertDescription>
            </Alert>
          ) : null}

          <FindingNarrative finding={finding} />

          {finding.evidence.length > 0 ? (
            <Reveal>
              <Section title="Evidence">
                <div className="space-y-3">
                  {finding.evidence.map((item) => (
                    <EvidenceBlock key={`${item.path}:${item.startLine}`} item={item} owner={project.repoOwner} repo={project.repoName} />
                  ))}
                </div>
              </Section>
            </Reveal>
          ) : null}

          {finding.options.length > 0 ? (
            <Reveal>
              <Section
                title="Fix options"
                actions={
                  <Link href={`/p/${project.id}/solutions?findingId=${finding.id}`} className="link-underline text-sm font-medium text-link">
                    Compare in Solution Lab
                  </Link>
                }
              >
                <div className="text-sm leading-relaxed">
                  <FixOptionsList options={finding.options} recommendation={finding.recommendation} chosenIndex={finding.chosenOptionIndex} />
                </div>
              </Section>
            </Reveal>
          ) : null}

          {finding.verification ? (
            <Reveal>
              <Block title="How to verify the fix">
                <p className="whitespace-pre-line">{finding.verification}</p>
              </Block>
            </Reveal>
          ) : null}

          <Reveal>
            <Section title="History">
              {checks.length === 0 && decisions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No re-checks or decisions yet.</p>
              ) : null}
              {checks.length > 0 ? (
                <ol className="relative space-y-8 border-l border-border pl-6">
                  {checks.map((check) => (
                    <li key={check.id} className="relative space-y-2">
                      <span className="absolute top-1.5 -left-[29px] size-2 rounded-[2px] bg-border-strong ring-4 ring-background" aria-hidden="true" />
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                        <CheckResultBadge result={check.result} />
                        <span className="text-muted-foreground">
                          at {sha(check.commitSha)}, <RelativeTime date={check.createdAt} />
                        </span>
                        <Link href={`/p/${project.id}/review-lab/${check.runId}`} className="link-underline text-xs text-link">
                          View run
                        </Link>
                      </div>
                      <p className="max-w-[70ch] whitespace-pre-line text-sm text-muted-foreground">{check.reasoning}</p>
                      {check.evidence.length > 0 ? (
                        <Disclosure
                          chevron="start"
                          summary={<span className="text-xs font-medium">Evidence at {check.commitSha.slice(0, 7)}</span>}
                          contentClassName="space-y-3 pt-3"
                        >
                          {check.evidence.map((item) => (
                            <EvidenceBlock key={`${item.path}:${item.startLine}`} item={item} owner={project.repoOwner} repo={project.repoName} />
                          ))}
                        </Disclosure>
                      ) : null}
                    </li>
                  ))}
                </ol>
              ) : null}
              {decisions.length > 0 ? (
                <div className="space-y-2 pt-2">
                  <h3 className="text-[0.8125rem] font-semibold">Linked decisions</h3>
                  <ul className="space-y-1.5 text-sm">
                    {decisions.map((d) => (
                      <li key={d.id} className="flex flex-wrap items-baseline gap-x-3">
                        <Link href={`/p/${project.id}/decisions/${d.id}`} className="link-underline">
                          {d.title}
                        </Link>
                        <span className="text-xs text-muted-foreground">
                          {DECISION_STATUS_LABELS[d.status]}, <RelativeTime date={d.createdAt} />
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </Section>
          </Reveal>
        </div>

        {/* Action rail: status and the next step, always in reach. */}
        <aside className="space-y-8 lg:sticky lg:top-24 lg:self-start">
          <dl className="space-y-4 text-sm">
            <Meta label="Status">
              <FindingStatusBadge status={finding.status} manual={manual} />
              <LifecycleFlow status={finding.status} className="mt-3 max-w-[15rem]" />
            </Meta>
            <Meta label="Severity">
              <SeverityBadge severity={finding.severity} className="text-sm" />
            </Meta>
            <Meta label="Kind">
              {CLASSIFICATION_LABELS[finding.classification]}, {CONFIDENCE_LABELS[finding.confidence].toLowerCase()}
            </Meta>
            <Meta label="Raised by">
              <span className="flex items-center gap-2.5">
                <PersonaMark persona={finding.persona} size="sm" tone="active" />
                <span className="font-medium">{personaLabel(finding.persona)}</span>
              </span>
            </Meta>
            <Meta label="Seen">
              first at {firstSeenRun.commitSha ? sha(firstSeenRun.commitSha) : "—"}, last at {sha(finding.lastSeenSha)}
              <div className="text-xs text-muted-foreground">
                opened <RelativeTime date={finding.createdAt} />
              </div>
            </Meta>
          </dl>

          <div className="space-y-2 border-t border-border pt-6">
            <Button asChild className="w-full">
              <Link href={`/p/${project.id}/solutions?findingId=${finding.id}`}>
                Compare fixes
                <ArrowRight className="group-hover/button:translate-x-0.5" />
              </Link>
            </Button>
            <RecheckButton projectId={project.id} findingIds={[finding.id]} activeRunId={activeRun} size="default" block />
            <StatusActions findingId={finding.id} status={finding.status} />
            <p className="pt-1 text-xs leading-relaxed text-muted-foreground">
              Re-check reads the latest commit of {project.selectedBranch}. Only a re-check that confirms the fix marks it resolved.
            </p>
          </div>

          {latest ? (
            <div className="space-y-2 border-t border-border pt-6 text-sm">
              <div className="flex items-center gap-2">
                <span className="font-semibold">Latest check</span>
                <CheckResultBadge result={latest.result} />
              </div>
              <p className="line-clamp-4 text-muted-foreground">{latest.reasoning}</p>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

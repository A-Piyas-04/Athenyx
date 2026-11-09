import Link from "next/link";
import { ArrowRight, Search } from "lucide-react";
import { SeverityDot } from "@/components/findings/badges";
import { RecheckButton } from "@/components/findings/recheck-button";
import { Reveal } from "@/components/motion/primitives";
import { EmptyState, PageHeader } from "@/components/page-header";
import { OptionCompare } from "@/components/solutions/option-compare";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requirePageProject } from "@/lib/authz";
import { activeRecheckFor, findingLinkOptions, getFindingDetail, solutionCandidates } from "@/lib/queries/findings";
import { personaLabel, SEVERITY_LABELS } from "@/lib/review/labels";
import { cn } from "@/lib/utils";

export const metadata = { title: "Solution Lab · Athenyx" };

/** Solution Lab: compare a finding's fix options and record a decision. DB reads only, no AI. */
export default async function SolutionLabPage({ params, searchParams }: PageProps<"/p/[projectId]/solutions">) {
  const { projectId } = await params;
  const sp = await searchParams;
  const { project } = await requirePageProject(projectId);
  const q = (typeof sp.q === "string" ? sp.q : "").trim().toLowerCase();
  const requested = typeof sp.findingId === "string" ? sp.findingId : null;

  const candidates = await solutionCandidates(project.id);
  const listed = q ? candidates.filter((c) => c.title.toLowerCase().includes(q)) : candidates;
  const selectedId = requested ?? listed[0]?.id ?? null;
  const [detail, linkOptions, activeRun] = await Promise.all([
    selectedId ? getFindingDetail(project.id, selectedId) : null,
    findingLinkOptions(project.id),
    selectedId ? activeRecheckFor(project.id, selectedId) : null,
  ]);
  const base = `/p/${project.id}/solutions`;
  const hrefFor = (id: string) => `${base}?findingId=${id}${q ? `&q=${encodeURIComponent(q)}` : ""}`;

  if (candidates.length === 0 && !detail) {
    return (
      <div className="space-y-10">
        <PageHeader title="Compare fixes" description="Weigh each finding's fix options, choose one, and record why." />
        <EmptyState
          title="Nothing open to fix"
          action={
            <Button asChild variant="outline">
              <Link href={`/p/${project.id}/risks`}>Go to Risk Center</Link>
            </Button>
          }
        >
          Open and in-progress findings appear here with the fix options the reviewers proposed.
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="grid gap-12 lg:grid-cols-[17rem_minmax(0,1fr)] lg:gap-16">
      <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        <h2 className="text-section">Open findings</h2>
        <form action={base} method="get" className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input name="q" defaultValue={q} placeholder="Search" className="pl-9" aria-label="Search findings" />
        </form>
        <ul className="-mx-3 max-h-[60vh] space-y-0.5 overflow-y-auto">
          {listed.map((c) => {
            const active = c.id === selectedId;
            return (
              <li key={c.id}>
                <Link
                  href={hrefFor(c.id)}
                  scroll={false}
                  aria-current={active ? "true" : undefined}
                  className={cn(
                    "grid grid-cols-[auto_minmax(0,1fr)] gap-x-2.5 rounded-md px-3 py-2.5 text-sm transition-colors duration-200",
                    active ? "bg-muted" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                  )}
                >
                  <SeverityDot severity={c.severity} className="mt-1.5" />
                  <span className="min-w-0">
                    <span className={cn("line-clamp-2 leading-snug", active && "font-medium text-foreground")}>{c.title}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {c.optionCount} option{c.optionCount === 1 ? "" : "s"}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
          {listed.length === 0 ? <li className="px-3 text-sm text-muted-foreground">No findings match.</li> : null}
        </ul>
      </aside>

      <section className="min-w-0 space-y-12">
        {!detail ? (
          <p className="text-sm text-muted-foreground">Pick a finding to compare its fixes.</p>
        ) : (
          <>
            <div className="space-y-4">
              <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <SeverityDot severity={detail.finding.severity} />
                  {SEVERITY_LABELS[detail.finding.severity]}
                </span>
                <span>{personaLabel(detail.finding.persona)}</span>
                <span>
                  seen at <span className="font-mono text-[0.8125rem]">{detail.finding.lastSeenSha.slice(0, 7)}</span>
                </span>
              </p>
              <h1 className="text-title text-[1.75rem] sm:text-[2.125rem]">{detail.finding.title}</h1>
              <p className="max-w-[70ch] whitespace-pre-line text-[0.9375rem] leading-relaxed text-muted-foreground">{detail.finding.observation}</p>
              <Link href={`/p/${project.id}/risks/${detail.finding.id}`} className="group inline-flex items-center gap-1 text-sm font-medium text-link">
                Evidence and history
                <ArrowRight className="size-3.5 transition-transform duration-300 group-hover:translate-x-0.5" />
              </Link>
            </div>

            <OptionCompare
              key={detail.finding.id}
              projectId={project.id}
              finding={detail.finding}
              chosenOptionIndex={detail.finding.chosenOptionIndex}
              findingOptions={linkOptions}
            />

            <Reveal className="grid gap-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
              <div className="space-y-2">
                <h2 className="text-section">After you push the fix</h2>
                <p className="max-w-[64ch] whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                  {detail.finding.verification || "No verification steps were given."}
                </p>
                <p className="text-xs text-muted-foreground">Re-check reads the latest commit of {project.selectedBranch} and confirms the fix from code.</p>
              </div>
              <RecheckButton projectId={project.id} findingIds={[detail.finding.id]} activeRunId={activeRun} size="default" />
            </Reveal>
          </>
        )}
      </section>
    </div>
  );
}

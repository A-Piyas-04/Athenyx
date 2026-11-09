import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";
import { DecisionStatus } from "@/generated/prisma/enums";
import { Stagger, StaggerItem } from "@/components/motion/primitives";
import { SegmentedLinks } from "@/components/motion/segmented";
import { EmptyState, PageHeader } from "@/components/page-header";
import { RelativeTime } from "@/components/relative-time";
import { Button } from "@/components/ui/button";
import { requirePageProject } from "@/lib/authz";
import { listDecisions, parseDecisionStatus } from "@/lib/queries/decisions";
import { DECISION_STATUS_LABELS } from "@/lib/review/labels";
import { cn } from "@/lib/utils";

export const metadata = { title: "Decision Ledger · Athenyx" };

const STATUS_TONE = {
  PROPOSED: "text-warn",
  ACCEPTED: "text-ok",
  SUPERSEDED: "text-muted-foreground",
  REVERTED: "text-muted-foreground",
} as const;

/** Decision Ledger (06): what was decided, why, and what it replaced. DB reads only. */
export default async function DecisionLedgerPage({ params, searchParams }: PageProps<"/p/[projectId]/decisions">) {
  const { projectId } = await params;
  const { project } = await requirePageProject(projectId);
  const status = parseDecisionStatus((await searchParams).status);
  const decisions = await listDecisions(project.id, status);
  const base = `/p/${project.id}/decisions`;

  return (
    <div className="space-y-10">
      <PageHeader
        title="Decisions"
        description="What you decided, the options you turned down, and why."
        actions={
          <Button asChild>
            <Link href={`${base}/new`}>
              <Plus />
              New decision
            </Link>
          </Button>
        }
      />

      <SegmentedLinks
        label="Filter by status"
        items={[null, ...Object.values(DecisionStatus)].map((s) => ({
          href: s ? `${base}?status=${s}` : base,
          label: s ? DECISION_STATUS_LABELS[s] : "All",
          active: s === status,
        }))}
      />

      {decisions.length === 0 ? (
        <EmptyState title={status ? `No ${DECISION_STATUS_LABELS[status].toLowerCase()} decisions` : "No decisions yet"}>
          {status ? "Try another status." : "Choose a fix in Solution Lab, or write one down with New decision."}
        </EmptyState>
      ) : (
        <Stagger className="border-t border-border">
          {decisions.map((d) => (
            <StaggerItem key={d.id} className="border-b border-border">
              <Link
                href={`${base}/${d.id}`}
                className="group -mx-3 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-6 rounded-md px-3 py-5 row-hover sm:grid-cols-[minmax(0,1fr)_7rem_7rem_auto]"
              >
                <span className="min-w-0">
                  <span className="block font-medium leading-snug">{d.title}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {d._count.findingLinks > 0 ? `${d._count.findingLinks} linked finding${d._count.findingLinks === 1 ? "" : "s"}` : "No linked findings"}
                    {d.commitSha ? (
                      <>
                        , at <span className="font-mono">{d.commitSha.slice(0, 7)}</span>
                      </>
                    ) : null}
                  </span>
                </span>
                <span className={cn("hidden text-sm font-medium sm:block", STATUS_TONE[d.status])}>{DECISION_STATUS_LABELS[d.status]}</span>
                <span className="hidden text-sm text-muted-foreground sm:block">
                  <RelativeTime date={d.createdAt} />
                </span>
                <ArrowRight className="size-4 -translate-x-1 text-muted-foreground opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100" />
              </Link>
            </StaggerItem>
          ))}
        </Stagger>
      )}
    </div>
  );
}

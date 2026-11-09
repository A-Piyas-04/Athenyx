import Link from "next/link";
import { FindingTable, type FindingRow } from "@/components/findings/finding-table";
import { RiskFilters } from "@/components/findings/risk-filters";
import { riskHref } from "@/lib/risk-href";
import { SegmentedLinks } from "@/components/motion/segmented";
import { EmptyState, PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { requirePageProject } from "@/lib/authz";
import { isManualResolution } from "@/lib/findings/status";
import { countFindings, findingPersonas, listFindings, MAX_LISTED_FINDINGS, parseFindingFilters } from "@/lib/queries/findings";

export const metadata = { title: "Risk Center · Athenyx" };

const ALL = "OPEN,IN_PROGRESS,RESOLVED,ACCEPTED_RISK,DISMISSED";

/** Status presets; "Active" is the default (no param → Open + In progress). */
const PRESETS: { label: string; status: string | undefined }[] = [
  { label: "Active", status: undefined },
  { label: "Resolved", status: "RESOLVED" },
  { label: "Accepted", status: "ACCEPTED_RISK" },
  { label: "Dismissed", status: "DISMISSED" },
  { label: "All", status: ALL },
];

/** Risk Center: tracked findings, filtered by URL searchParams. DB reads only. */
export default async function RiskCenterPage({ params, searchParams }: PageProps<"/p/[projectId]/risks">) {
  const { projectId } = await params;
  const { project } = await requirePageProject(projectId);
  const sp = await searchParams;
  const filters = parseFindingFilters(sp);
  const [findings, personas, total] = await Promise.all([
    listFindings(project.id, filters),
    findingPersonas(project.id),
    countFindings(project.id),
  ]);

  const rows: FindingRow[] = findings.map((f) => ({
    id: f.id,
    title: f.title,
    severity: f.severity,
    classification: f.classification,
    status: f.status,
    manual: isManualResolution(f),
    persona: f.persona,
    primaryFile: f.evidence[0] ? `${f.evidence[0].path}:${f.evidence[0].startLine}` : null,
    lastSeenSha: f.lastSeenSha,
    updatedAt: f.updatedAt.toISOString(),
  }));

  const base = `/p/${project.id}/risks`;
  const statusKey = [...filters.statuses].sort().join(",");
  const presetKey = (status: string | undefined) => (status ?? "IN_PROGRESS,OPEN").split(",").sort().join(",");
  const rawStatus = typeof sp.status === "string" ? sp.status : Array.isArray(sp.status) ? sp.status.join(",") : undefined;
  const keep = { severity: filters.severities, persona: filters.persona, classification: filters.classification, q: filters.q };

  return (
    <div className="space-y-10">
      <PageHeader
        title="Risks"
        description="Every finding Athenyx has recorded, with the commit it was last seen at."
      />

      {total === 0 ? (
        <EmptyState
          title="No findings yet"
          action={
            <Button asChild>
              <Link href={`/p/${project.id}/review-lab`}>Start a review</Link>
            </Button>
          }
        >
          Findings show up here after a review. Nothing runs until you start one.
        </EmptyState>
      ) : (
        <div className="space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <SegmentedLinks
              label="Filter by status"
              items={PRESETS.map((p) => ({
                label: p.label,
                href: riskHref(base, { ...keep, status: p.status }),
                active: presetKey(p.status) === statusKey,
              }))}
            />
            <RiskFilters key={JSON.stringify(sp)} action={base} filters={filters} personas={personas} statusParam={rawStatus} />
          </div>

          {rows.length === 0 ? (
            <EmptyState title="Nothing matches">Try another status, or clear the filters.</EmptyState>
          ) : (
            <>
              <FindingTable key={JSON.stringify(sp)} projectId={project.id} rows={rows} />
              <p className="text-xs text-muted-foreground">
                {rows.length >= MAX_LISTED_FINDINGS
                  ? `Showing the first ${MAX_LISTED_FINDINGS} findings. Narrow the filters to see others.`
                  : `${rows.length} finding${rows.length === 1 ? "" : "s"}. Select up to 5 to re-check them on the latest commit.`}
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

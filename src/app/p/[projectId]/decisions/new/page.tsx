import { notFound } from "next/navigation";
import { DecisionForm } from "@/components/decisions/decision-form";
import { PageHeader } from "@/components/page-header";
import { requirePageProject } from "@/lib/authz";
import { draftFromFinding, EMPTY_DRAFT, type DecisionDraft } from "@/lib/decisions/draft";
import { getDecision } from "@/lib/queries/decisions";
import { findingLinkOptions, getFindingDetail } from "@/lib/queries/findings";

export const metadata = { title: "New decision · Athenyx" };

/**
 * New decision. `?findingId=` prefills from a finding (its chosen option, if
 * any); `?supersede=<id>` prefills a replacement for an existing decision.
 */
export default async function NewDecisionPage({ params, searchParams }: PageProps<"/p/[projectId]/decisions/new">) {
  const { projectId } = await params;
  const sp = await searchParams;
  const { project } = await requirePageProject(projectId);
  const findingId = typeof sp.findingId === "string" ? sp.findingId : null;
  const supersedeId = typeof sp.supersede === "string" ? sp.supersede : null;

  let initial: DecisionDraft = { ...EMPTY_DRAFT, commitSha: project.lastReviewedSha };
  let supersedes: { id: string; title: string } | null = null;

  if (supersedeId) {
    const old = await getDecision(project.id, supersedeId);
    if (!old || old.decision.status === "SUPERSEDED") notFound();
    supersedes = { id: old.decision.id, title: old.decision.title };
    initial = {
      title: old.decision.title,
      context: old.decision.context,
      chosenOption: old.decision.chosenOption,
      rationale: old.decision.rationale,
      alternatives: old.decision.alternatives,
      constraints: old.decision.constraints ?? "",
      assumptions: old.decision.assumptions ?? "",
      relatedFiles: old.decision.relatedFiles,
      findingIds: old.findings.map((f) => f.id),
      status: "ACCEPTED",
      commitSha: project.lastReviewedSha ?? old.decision.commitSha,
    };
  } else if (findingId) {
    const detail = await getFindingDetail(project.id, findingId);
    if (detail) {
      const index = detail.finding.chosenOptionIndex ?? detail.finding.recommendation?.optionIndex ?? null;
      initial =
        index !== null && detail.finding.options[index]
          ? draftFromFinding(detail.finding, index)
          : { ...EMPTY_DRAFT, title: detail.finding.title, findingIds: [detail.finding.id], commitSha: detail.finding.lastSeenSha };
    }
  }

  const findingOptions = await findingLinkOptions(project.id);

  return (
    <div className="max-w-3xl space-y-10">
      <PageHeader
        back={{ href: `/p/${project.id}/decisions`, label: "Decision Ledger" }}
        title={supersedes ? "Replace a decision" : "New decision"}
        description={
          supersedes
            ? `Saving creates a new decision and marks “${supersedes.title}” as superseded. Its history is kept.`
            : "Decisions don't have to be tied to a finding."
        }
      />
      <DecisionForm
        projectId={project.id}
        mode={supersedes ? { kind: "supersede", decisionId: supersedes.id } : { kind: "create" }}
        initial={initial}
        findingOptions={findingOptions}
      />
    </div>
  );
}

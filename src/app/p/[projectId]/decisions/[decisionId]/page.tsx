import Link from "next/link";
import { notFound } from "next/navigation";
import { Replace } from "lucide-react";
import { DecisionEditor } from "@/components/decisions/decision-editor";
import { DeleteDecision } from "@/components/decisions/delete-decision";
import { SeverityDot } from "@/components/findings/badges";
import { PageHeader } from "@/components/page-header";
import { RelativeTime } from "@/components/relative-time";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { requirePageProject } from "@/lib/authz";
import type { DecisionDraft } from "@/lib/decisions/draft";
import { getDecision } from "@/lib/queries/decisions";
import { findingLinkOptions } from "@/lib/queries/findings";
import { DECISION_STATUS_LABELS, FINDING_STATUS_LABELS } from "@/lib/review/labels";
import { cn } from "@/lib/utils";

export const metadata = { title: "Decision · Athenyx" };

const STATUS_TONE = {
  PROPOSED: "text-warn",
  ACCEPTED: "text-ok",
  SUPERSEDED: "text-muted-foreground",
  REVERTED: "text-muted-foreground",
} as const;

type DecisionFields = {
  context: string;
  chosenOption: string;
  rationale: string;
  alternatives: { title: string; whyNot: string }[];
  constraints: string | null;
  assumptions: string | null;
  relatedFiles: string[];
};

/** Decision detail (06). Reads as a document; editing is one click away. Superseded decisions are read-only. */
export default async function DecisionPage({ params }: PageProps<"/p/[projectId]/decisions/[decisionId]">) {
  const { projectId, decisionId } = await params;
  const { project } = await requirePageProject(projectId);
  const data = await getDecision(project.id, decisionId);
  if (!data) notFound();
  const { decision, findings, supersededBy, supersedes } = data;
  const superseded = decision.status === "SUPERSEDED";
  const base = `/p/${project.id}/decisions`;

  const initial: DecisionDraft = {
    title: decision.title,
    context: decision.context,
    chosenOption: decision.chosenOption,
    rationale: decision.rationale,
    alternatives: decision.alternatives,
    constraints: decision.constraints ?? "",
    assumptions: decision.assumptions ?? "",
    relatedFiles: decision.relatedFiles,
    findingIds: findings.map((f) => f.id),
    status: decision.status === "SUPERSEDED" ? "ACCEPTED" : decision.status,
    commitSha: decision.commitSha,
  };

  const linked = (
    <section className="space-y-3">
      <h2 className="text-section">Linked findings</h2>
      {findings.length === 0 ? (
        <p className="text-sm text-muted-foreground">None.</p>
      ) : (
        <ul className="space-y-2">
          {findings.map((f) => (
            <li key={f.id} className="flex flex-wrap items-center gap-x-3 text-sm">
              <SeverityDot severity={f.severity} />
              <Link href={`/p/${project.id}/risks/${f.id}`} className="link-underline">
                {f.title}
              </Link>
              <span className="text-xs text-muted-foreground">{FINDING_STATUS_LABELS[f.status]}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  return (
    <div className="max-w-3xl space-y-12">
      <div className="space-y-5">
        <PageHeader
          back={{ href: base, label: "Decision Ledger" }}
          title={decision.title}
          actions={
            <>
              {!superseded ? (
                <Button asChild variant="ghost" size="sm">
                  <Link href={`${base}/new?supersede=${decision.id}`}>
                    <Replace />
                    Supersede
                  </Link>
                </Button>
              ) : null}
              <DeleteDecision projectId={project.id} decisionId={decision.id} />
            </>
          }
        />
        <p className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-muted-foreground">
          <span className={cn("font-semibold", STATUS_TONE[decision.status])}>{DECISION_STATUS_LABELS[decision.status]}</span>
          <span>
            Recorded <RelativeTime date={decision.createdAt} />
          </span>
          {decision.commitSha ? (
            <span>
              at <span className="font-mono text-[0.8125rem]">{decision.commitSha.slice(0, 7)}</span>
            </span>
          ) : null}
        </p>
      </div>

      {superseded && supersededBy ? (
        <Alert>
          <AlertTitle>Superseded</AlertTitle>
          <AlertDescription>
            Replaced by <Link href={`${base}/${supersededBy.id}`}>{supersededBy.title}</Link>. This record is kept for history.
          </AlertDescription>
        </Alert>
      ) : null}
      {supersedes.length > 0 ? (
        <p className="text-sm text-muted-foreground">
          Replaces{" "}
          {supersedes.map((s, i) => (
            <span key={s.id}>
              {i > 0 ? ", " : ""}
              <Link href={`${base}/${s.id}`} className="link-underline text-foreground">
                {s.title}
              </Link>
            </span>
          ))}
          .
        </p>
      ) : null}

      {superseded ? (
        <div className="space-y-10">
          <ReadView decision={decision} />
          {linked}
        </div>
      ) : (
        <DecisionEditor projectId={project.id} decisionId={decision.id} initial={initial} findingOptions={await findingLinkOptions(project.id)}>
          <ReadView decision={decision} />
          {linked}
        </DecisionEditor>
      )}
    </div>
  );
}

function ReadView({ decision }: { decision: DecisionFields }) {
  return (
    <div className="space-y-10">
      <div className="space-y-2">
        <h2 className="text-section">Decision</h2>
        <p className="text-lg leading-relaxed whitespace-pre-line">{decision.chosenOption}</p>
      </div>
      <div className="grid gap-10 sm:grid-cols-2">
        <Prose title="Context">{decision.context}</Prose>
        <Prose title="Rationale">{decision.rationale}</Prose>
      </div>
      {decision.alternatives.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-section">Alternatives considered</h2>
          <ul className="divide-y divide-border border-y border-border">
            {decision.alternatives.map((a, i) => (
              <li key={i} className="grid gap-1 py-3 text-sm sm:grid-cols-[14rem_1fr] sm:gap-6">
                <span className="font-medium">{a.title}</span>
                <span className="text-muted-foreground">{a.whyNot || "No reason recorded."}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {decision.constraints || decision.assumptions ? (
        <div className="grid gap-10 sm:grid-cols-2">
          {decision.constraints ? <Prose title="Constraints">{decision.constraints}</Prose> : null}
          {decision.assumptions ? <Prose title="Assumptions">{decision.assumptions}</Prose> : null}
        </div>
      ) : null}
      {decision.relatedFiles.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-section">Related files</h2>
          <ul className="font-mono text-xs leading-6 text-muted-foreground">
            {decision.relatedFiles.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function Prose({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-section">{title}</h2>
      <p className="text-sm leading-relaxed whitespace-pre-line text-foreground/85">{children}</p>
    </section>
  );
}

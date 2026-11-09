import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import type { ReleaseVerdict } from "@/generated/prisma/enums";
import { SeverityDot } from "@/components/findings/badges";
import { Disclosure } from "@/components/motion/disclosure";
import { VerdictGauge } from "@/components/visuals/verdict-gauge";
import { RelativeTime } from "@/components/relative-time";
import { RELEASE_DISCLAIMER, type ReleaseReport } from "@/lib/review/release";
import { cn } from "@/lib/utils";

export const VERDICT_LABELS: Record<ReleaseVerdict, string> = {
  GO: "Go",
  CONDITIONAL_GO: "Conditional Go",
  NO_GO: "No-Go",
};

const VERDICT_TEXT: Record<ReleaseVerdict, string> = {
  GO: "text-ok",
  CONDITIONAL_GO: "text-warn",
  NO_GO: "text-bad",
};

const VERDICT_BG: Record<ReleaseVerdict, string> = {
  GO: "bg-ok",
  CONDITIONAL_GO: "bg-warn",
  NO_GO: "bg-bad",
};

/** The verdict as coloured display type. */
export function VerdictText({ verdict, className }: { verdict: ReleaseVerdict; className?: string }) {
  return <span className={cn("font-display font-bold tracking-tight", VERDICT_TEXT[verdict], className)}>{VERDICT_LABELS[verdict]}</span>;
}

/** Compact verdict for tables and lists. */
export function VerdictBadge({ verdict, className }: { verdict: ReleaseVerdict; className?: string }) {
  return (
    <span className={cn("inline-flex h-5 items-center gap-1.5 text-xs font-semibold", VERDICT_TEXT[verdict], className)}>
      <span className={cn("size-2 rounded-[2px]", VERDICT_BG[verdict])} aria-hidden="true" />
      {VERDICT_LABELS[verdict]}
    </span>
  );
}

export type BlockingFinding = { id: string; title: string; severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO" };

/** The advisory release verdict (06 Release Gate). */
export function VerdictCard({
  projectId,
  verdict,
  report,
  commitSha,
  branch,
  finishedAt,
  blocking,
  summary,
  runId,
  assessedBy,
}: {
  projectId: string;
  verdict: ReleaseVerdict;
  report: ReleaseReport;
  commitSha: string | null;
  branch: string;
  finishedAt: Date | null;
  blocking: BlockingFinding[];
  summary?: string | null;
  runId?: string;
  /** Who assessed it (specialist stances). */
  assessedBy?: React.ReactNode;
}) {
  const ci = report.ciEvidence;
  const checks = ci.unavailable ? [] : ci.checks;
  const failingChecks = checks.filter((c) => c.conclusion && !["success", "neutral", "skipped"].includes(c.conclusion)).length;

  return (
    <div className="space-y-12">
      <div className="space-y-8">
        <div className="flex flex-wrap items-center gap-x-12 gap-y-6">
          <VerdictGauge verdict={verdict} size={230} />
          <div className="space-y-2">
            <VerdictText verdict={verdict} className="block text-[3.25rem] leading-none sm:text-[4.25rem]" />
            <p className="text-sm text-muted-foreground">
              {branch} at <span className="font-mono text-[0.8125rem] text-foreground">{commitSha ? commitSha.slice(0, 7) : "—"}</span>
              {finishedAt ? (
                <>
                  , assessed <RelativeTime date={finishedAt} />
                </>
              ) : null}
              {runId ? (
                <>
                  {". "}
                  <Link href={`/p/${projectId}/review-lab/${runId}`} className="link-underline font-medium text-link">
                    Full report
                  </Link>
                </>
              ) : null}
            </p>
          </div>
        </div>

        {summary ? <p className="max-w-[68ch] text-[0.9375rem] leading-relaxed text-foreground/85">{summary}</p> : null}
      </div>

      {assessedBy ? (
        <section className="space-y-5">
          <h3 className="text-section">Assessed by</h3>
          {assessedBy}
        </section>
      ) : null}

      <div className="grid gap-10 md:grid-cols-2 md:gap-16">
        <section className="space-y-3">
          <h3 className="text-section">Conditions for Go</h3>
          {report.conditions.length === 0 ? (
            <p className="text-sm text-muted-foreground">None.</p>
          ) : (
            <ol className="space-y-2.5 text-sm">
              {report.conditions.map((c, i) => (
                <li key={i} className="grid grid-cols-[1.5rem_1fr] leading-relaxed">
                  <span className="font-semibold text-muted-foreground tabular-nums">{i + 1}.</span>
                  <span>{c}</span>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="space-y-3">
          <h3 className="text-section">Blocking findings</h3>
          {blocking.length === 0 ? (
            <p className="text-sm text-muted-foreground">No open critical or high findings.</p>
          ) : (
            <ul className="space-y-2.5 text-sm">
              {blocking.map((f) => (
                <li key={f.id} className="flex items-start gap-2.5">
                  <SeverityDot severity={f.severity} className="mt-1.5" />
                  <Link href={`/p/${projectId}/risks/${f.id}`} className="link-underline min-w-0">
                    {f.title}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <dl className="grid grid-cols-2 gap-x-8 gap-y-6 border-t border-border pt-8 text-sm sm:grid-cols-4">
        <Fact label="CI">
          {ci.unavailable ? "Unavailable" : checks.length === 0 ? "No results" : failingChecks > 0 ? `${failingChecks} failing` : ci.combinedStatus}
        </Fact>
        <Fact label="Checks reported">{ci.unavailable ? "—" : checks.length}</Fact>
        <Fact label="Test files">{report.testsPresent ? "Present" : "None found"}</Fact>
        <Fact label="Accepted risks">{report.acceptedRisks}</Fact>
      </dl>

      {checks.length > 0 || report.limitations.length > 0 ? (
        <div className="divide-y divide-border border-y border-border">
          {checks.length > 0 ? (
            <Disclosure summary={<span className="text-sm font-medium">CI checks ({checks.length})</span>} summaryClassName="py-4" contentClassName="pb-5">
              <ul className="max-h-64 space-y-1.5 overflow-y-auto text-sm">
                {checks.map((c, i) => (
                  <li key={i} className="flex justify-between gap-4">
                    <span className="truncate">{c.name}</span>
                    <span
                      className={cn(
                        "shrink-0 font-mono text-xs",
                        c.conclusion === "success" && "text-ok",
                        c.conclusion && !["success", "neutral", "skipped"].includes(c.conclusion) && "text-bad",
                      )}
                    >
                      {c.conclusion ?? c.status}
                    </span>
                  </li>
                ))}
              </ul>
            </Disclosure>
          ) : null}
          {report.limitations.length > 0 ? (
            <Disclosure summary={<span className="text-sm font-medium">Limitations ({report.limitations.length})</span>} summaryClassName="py-4" contentClassName="pb-5">
              <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
                {report.limitations.map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
              </ul>
            </Disclosure>
          ) : null}
        </div>
      ) : null}

      <p className="flex items-center gap-2 text-sm font-medium">
        <ShieldAlert className="size-4 shrink-0 text-muted-foreground" />
        {RELEASE_DISCLAIMER}
      </p>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-display text-lg font-semibold capitalize">{children}</dd>
    </div>
  );
}

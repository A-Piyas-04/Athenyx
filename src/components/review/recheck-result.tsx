import Link from "next/link";
import type { ReviewRun } from "@/generated/prisma/client";
import { SeverityDot } from "@/components/findings/badges";
import { EvidenceBlock } from "@/components/findings/evidence-block";
import { CheckResultBadge } from "@/components/findings/status-badge";
import { Disclosure } from "@/components/motion/disclosure";
import { Stagger, StaggerItem } from "@/components/motion/primitives";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { RunCheck } from "@/lib/queries/runs";
import { personaLabel } from "@/lib/review/labels";
import { readCoverage } from "@/lib/review/types";

/** Result of a RECHECK run: one verdict per finding, verified against the new commit. */
export function RecheckResult({
  run,
  checks,
  projectId,
  owner,
  repo,
}: {
  run: ReviewRun;
  checks: RunCheck[];
  projectId: string;
  owner: string;
  repo: string;
}) {
  const coverage = readCoverage(run.coverage);
  return (
    <div className="space-y-12">
      {run.degraded ? (
        <Alert variant="warning">
          <AlertTitle>Fallback AI models were used</AlertTitle>
          <AlertDescription>Higher-quality free models were rate-limited, so results may be less thorough.</AlertDescription>
        </Alert>
      ) : null}
      {run.summary ? <p className="max-w-[68ch] text-[0.9375rem] leading-relaxed">{run.summary}</p> : null}
      {checks.length > 0 ? (
        <Stagger className="border-t border-border">
          {checks.map((check) => (
            <StaggerItem key={check.id} className="space-y-3 border-b border-border py-6">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <CheckResultBadge result={check.result} />
                <SeverityDot severity={check.finding.severity} />
                <Link href={`/p/${projectId}/risks/${check.finding.id}`} className="link-underline font-semibold">
                  {check.finding.title}
                </Link>
                <span className="text-xs text-muted-foreground">{personaLabel(check.finding.persona)}</span>
              </div>
              <p className="max-w-[72ch] whitespace-pre-line text-sm text-muted-foreground">{check.reasoning}</p>
              {check.evidence.length > 0 ? (
                <Disclosure chevron="start" summary={<span className="text-sm font-medium">Evidence ({check.evidence.length})</span>} contentClassName="space-y-3 pt-3">
                  {check.evidence.map((item) => (
                    <EvidenceBlock key={`${item.path}:${item.startLine}`} item={item} owner={owner} repo={repo} />
                  ))}
                </Disclosure>
              ) : null}
            </StaggerItem>
          ))}
        </Stagger>
      ) : null}
      {coverage && coverage.limitations.length > 0 ? (
        <div className="space-y-2 text-sm">
          <h3 className="text-section">Limitations</h3>
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            {coverage.limitations.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="text-xs text-muted-foreground">
        Athenyx reads code; it never runs it. &quot;Resolved&quot; is recorded only when the cited code changed or the fix is visible in the new
        commit.
      </p>
    </div>
  );
}

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { Classification, Confidence, FindingStatus, Severity } from "@/generated/prisma/enums";
import { SeverityDot } from "@/components/findings/badges";
import { PersonaMark } from "@/components/board/persona-mark";
import { EvidenceBlock } from "@/components/findings/evidence-block";
import { Disclosure } from "@/components/motion/disclosure";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  CLASSIFICATION_LABELS,
  CONFIDENCE_LABELS,
  FINDING_STATUS_LABELS,
  personaLabel,
  SEVERITY_LABELS,
} from "@/lib/review/labels";
import type { EvidenceItem, FixOption, Recommendation } from "@/lib/review/types";
import { cn } from "@/lib/utils";
import { EffortMeter } from "@/components/visuals/effort-meter";

export type FindingCardData = {
  id: string;
  title: string;
  persona: string;
  model: string | null;
  severity: Severity;
  classification: Classification;
  confidence: Confidence;
  status: FindingStatus;
  observation: string;
  impact: string;
  userPremise: string | null;
  evidence: EvidenceItem[];
  options: FixOption[];
  recommendation: Recommendation | null;
  verification: string;
  lastSeenSha: string;
  /** True when this finding was first raised in an earlier run. */
  seenBefore: boolean;
};

/**
 * A finding as an expandable row: severity, title and where it lives on the
 * surface; observation, evidence and fixes when opened.
 */
export function FindingCard({
  finding,
  projectId,
  owner,
  repo,
  fallbackModel,
}: {
  finding: FindingCardData;
  projectId: string;
  owner: string;
  repo: string;
  fallbackModel: boolean;
}) {
  const first = finding.evidence[0];
  return (
    <Disclosure
      className="border-b border-border"
      summaryClassName="-mx-3 rounded-md px-3 py-4 row-hover"
      contentClassName="space-y-8 pt-2 pb-8 sm:pl-5"
      summary={
        <span className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3">
          <SeverityDot severity={finding.severity} className="mt-[7px]" />
          <span className="min-w-0 space-y-1">
            <span className="block font-medium leading-snug">{finding.title}</span>
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className={cn(finding.severity === "CRITICAL" && "font-semibold text-sev-critical")}>{SEVERITY_LABELS[finding.severity]}</span>
              <span>{CLASSIFICATION_LABELS[finding.classification]}</span>
              {first ? (
                <span className="font-mono">
                  {first.path}:{first.startLine}
                </span>
              ) : (
                <span>Based on your description</span>
              )}
              {finding.status !== "OPEN" ? <span className="font-medium text-foreground">{FINDING_STATUS_LABELS[finding.status]}</span> : null}
              {finding.seenBefore ? <span>Seen before</span> : null}
              {fallbackModel && finding.model ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="text-warn underline decoration-dotted underline-offset-4">fallback model</span>
                  </TooltipTrigger>
                  <TooltipContent>{finding.model}</TooltipContent>
                </Tooltip>
              ) : null}
            </span>
          </span>
        </span>
      }
    >
      <FindingNarrative finding={finding} />
      {finding.evidence.length > 0 ? (
        <Block title="Evidence">
          <div className="space-y-3">
            {finding.evidence.map((item) => (
              <EvidenceBlock key={`${item.path}:${item.startLine}`} item={item} owner={owner} repo={repo} />
            ))}
          </div>
        </Block>
      ) : null}
      {finding.options.length > 0 ? (
        <Block title="Fix options">
          <FixOptionsList options={finding.options} recommendation={finding.recommendation} />
        </Block>
      ) : null}
      {finding.verification ? (
        <Block title="How to verify the fix">
          <p className="whitespace-pre-line">{finding.verification}</p>
        </Block>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
        <span className="inline-flex flex-wrap items-center gap-1.5">
          <PersonaMark persona={finding.persona} size="2xs" tone="idle" />
          Raised by {personaLabel(finding.persona)}, {CONFIDENCE_LABELS[finding.confidence].toLowerCase()}
          {finding.model ? `, ${finding.model}` : ""}, seen at <span className="font-mono">{finding.lastSeenSha.slice(0, 7)}</span>
        </span>
        <Link href={`/p/${projectId}/risks/${finding.id}`} className="group inline-flex items-center gap-1 text-sm font-medium text-link">
          Open in Risk Center
          <ArrowRight className="size-3.5 transition-transform duration-300 group-hover:translate-x-0.5" />
        </Link>
      </div>
    </Disclosure>
  );
}

/** Observation, impact and (when present) the user's premise. */
export function FindingNarrative({
  finding,
}: {
  finding: Pick<FindingCardData, "observation" | "impact" | "userPremise">;
}) {
  return (
    <div className="grid gap-8 md:grid-cols-2">
      <Block title="What we saw">
        <p className="whitespace-pre-line">{finding.observation}</p>
      </Block>
      <Block title="Why it matters">
        <p className="whitespace-pre-line">{finding.impact}</p>
      </Block>
      {finding.userPremise ? (
        <Block title="Your premise" className="md:col-span-2">
          <p className="text-xs text-muted-foreground">Based on your description, not repository code.</p>
          <p className="whitespace-pre-line">{finding.userPremise}</p>
        </Block>
      ) : null}
    </div>
  );
}

/** Fix options as a numbered list; the recommended one is labelled, not boxed. */
export function FixOptionsList({
  options,
  recommendation,
  chosenIndex,
}: {
  options: FixOption[];
  recommendation: Recommendation | null;
  chosenIndex?: number | null;
}) {
  return (
    <div className="space-y-5">
      <ol className="space-y-5">
        {options.map((option, index) => {
          const recommended = recommendation?.optionIndex === index;
          return (
            <li key={index} className="grid grid-cols-[1.75rem_minmax(0,1fr)]">
              <span className="font-display text-base font-semibold text-muted-foreground tabular-nums">{index + 1}</span>
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-semibold">{option.title}</span>
                  {recommended ? <span className="text-xs font-semibold text-link">Recommended</span> : null}
                  {chosenIndex === index ? <span className="text-xs font-semibold text-ok">Chosen</span> : null}
                  <EffortMeter effort={option.effort} />
                </div>
                {option.description ? <p className="whitespace-pre-line text-muted-foreground">{option.description}</p> : null}
                {option.pros.length > 0 || option.cons.length > 0 ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <ProsCons label="Pros" items={option.pros} />
                    <ProsCons label="Cons" items={option.cons} />
                  </div>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
      {recommendation?.rationale ? (
        <p className="text-muted-foreground">
          <span className="font-medium text-foreground">Why the recommendation: </span>
          {recommendation.rationale}
        </p>
      ) : null}
    </div>
  );
}

export function Block({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("space-y-2 text-sm leading-relaxed", className)}>
      <h4 className="text-[0.8125rem] font-semibold text-foreground">{title}</h4>
      {children}
    </section>
  );
}

function ProsCons({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[0.8125rem]">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

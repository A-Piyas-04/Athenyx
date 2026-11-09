import type { Classification, Severity } from "@/generated/prisma/enums";
import { CLASSIFICATION_LABELS, SEVERITY_LABELS } from "@/lib/review/labels";
import { cn } from "@/lib/utils";

/** Severity hues (06 §4: critical/high red, medium amber, low blue, info gray), tuned per theme in globals.css. */
export const SEVERITY_COLOR: Record<Severity, string> = {
  CRITICAL: "bg-sev-critical",
  HIGH: "bg-sev-high",
  MEDIUM: "bg-sev-medium",
  LOW: "bg-sev-low",
  INFO: "bg-sev-info",
};

export const SEVERITY_TEXT: Record<Severity, string> = {
  CRITICAL: "text-sev-critical",
  HIGH: "text-sev-high",
  MEDIUM: "text-sev-medium",
  LOW: "text-sev-low",
  INFO: "text-sev-info",
};

/** A small square marker in the severity colour. */
export function SeverityDot({ severity, className }: { severity: Severity; className?: string }) {
  return <span aria-hidden="true" className={cn("inline-block size-2 shrink-0 rounded-[2px]", SEVERITY_COLOR[severity], className)} />;
}

/** Severity as marker + word. Quiet by default; critical reads heavier. */
export function SeverityBadge({ severity, className }: { severity: Severity; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-1.5 text-xs font-medium",
        severity === "CRITICAL" ? "font-semibold text-sev-critical" : "text-foreground",
        className,
      )}
    >
      <SeverityDot severity={severity} />
      {SEVERITY_LABELS[severity]}
    </span>
  );
}

export function ClassificationBadge({ classification }: { classification: Classification }) {
  return <span className="inline-flex h-5 shrink-0 items-center text-xs text-muted-foreground">{CLASSIFICATION_LABELS[classification]}</span>;
}

import type { CheckResult, FindingStatus } from "@/generated/prisma/enums";
import { CHECK_RESULT_LABELS, FINDING_STATUS_LABELS } from "@/lib/review/labels";
import { cn } from "@/lib/utils";

const STATUS_CLASSES: Record<FindingStatus, string> = {
  OPEN: "border-border-strong text-foreground",
  IN_PROGRESS: "border-sev-low/50 text-sev-low",
  RESOLVED: "border-ok/50 text-ok",
  ACCEPTED_RISK: "border-warn/50 text-warn",
  DISMISSED: "border-border text-muted-foreground",
};

/** Finding status. A manual resolution is always labelled as not verified. */
export function FindingStatusBadge({ status, manual }: { status: FindingStatus; manual?: boolean }) {
  return (
    <span className={cn("inline-flex h-5 shrink-0 items-center rounded-[3px] border px-1.5 text-xs font-medium", STATUS_CLASSES[status])}>
      {status === "RESOLVED" && manual ? "Resolved by you (not verified)" : FINDING_STATUS_LABELS[status]}
    </span>
  );
}

const CHECK_CLASSES: Record<CheckResult, string> = {
  RESOLVED: "bg-ok/12 text-ok",
  PARTIALLY_RESOLVED: "bg-warn/12 text-warn",
  STILL_PRESENT: "bg-bad/12 text-bad",
  UNVERIFIABLE: "bg-muted text-muted-foreground",
};

export function CheckResultBadge({ result }: { result: CheckResult }) {
  return (
    <span className={cn("inline-flex h-5 shrink-0 items-center rounded-[3px] px-1.5 text-xs font-semibold", CHECK_CLASSES[result])}>
      {CHECK_RESULT_LABELS[result]}
    </span>
  );
}

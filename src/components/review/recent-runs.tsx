import Link from "next/link";
import { Stagger, StaggerItem } from "@/components/motion/primitives";
import { RelativeTime } from "@/components/relative-time";
import type { RecentRun } from "@/lib/queries/runs";
import { formatDuration, STATUS_LABELS } from "@/lib/review/labels";
import { REVIEW_TYPES } from "@/lib/review/types";
import { cn } from "@/lib/utils";

const STATUS_DOT = {
  QUEUED: "live-dot !size-1.5",
  RUNNING: "live-dot !size-1.5",
  COMPLETED: "bg-ok",
  FAILED: "bg-bad",
  CANCELLED: "bg-subtle",
} as const;

/** Compact history list for the Review Lab side rail. */
export function RecentRuns({ projectId, runs }: { projectId: string; runs: RecentRun[] }) {
  if (runs.length === 0) {
    return <p className="text-sm text-muted-foreground">Your reviews will be listed here.</p>;
  }
  return (
    <Stagger className="-mx-3">
      {runs.map((run) => (
        <StaggerItem key={run.id}>
          <Link href={`/p/${projectId}/review-lab/${run.id}`} className="group block rounded-md px-3 py-2.5 row-hover">
            <span className="flex items-center gap-2">
              <span className={cn("size-1.5 shrink-0 rounded-[2px]", STATUS_DOT[run.status])} aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{REVIEW_TYPES[run.type].label}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                <RelativeTime date={run.createdAt} />
              </span>
            </span>
            <span className="mt-0.5 flex gap-3 pl-3.5 text-xs text-muted-foreground">
              <span className={run.status === "FAILED" ? "text-destructive" : undefined}>{STATUS_LABELS[run.status]}</span>
              {run.commitSha ? <span className="font-mono">{run.commitSha.slice(0, 7)}</span> : null}
              {run.startedAt && run.finishedAt ? <span>{formatDuration(run.finishedAt.getTime() - run.startedAt.getTime())}</span> : null}
            </span>
          </Link>
        </StaggerItem>
      ))}
    </Stagger>
  );
}

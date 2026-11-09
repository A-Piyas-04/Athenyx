"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, GitBranch, Loader2, RefreshCw } from "lucide-react";
import { RelativeTime } from "@/components/relative-time";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type FreshnessData = {
  projectId: string;
  repoOwner: string;
  repoName: string;
  branch: string;
  latestKnownSha: string | null;
  latestCheckedAt: string | null;
  lastReviewedSha: string | null;
  lastReviewedAt: string | null;
};

function short(sha: string | null): string | null {
  return sha ? sha.slice(0, 7) : null;
}

/**
 * Branch freshness, folded into one compact control. The trigger shows the
 * branch and a single state (up to date / new commits / never reviewed); the
 * popover keeps the three facts separate: selected branch, latest known
 * commit, last reviewed commit. "Check for updates" is one GitHub call and
 * never runs AI. "Review new commits" only navigates; the user still starts it.
 */
export function FreshnessBar({ data }: { data: FreshnessData }) {
  const router = useRouter();
  const [isChecking, startChecking] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const commitHref = (sha: string) => `https://github.com/${data.repoOwner}/${data.repoName}/commit/${sha}`;
  const isBehind = data.latestKnownSha !== null && data.latestKnownSha !== data.lastReviewedSha;
  const reviewHref = `/p/${data.projectId}/review-lab?type=${data.lastReviewedSha ? "LATEST_CHANGES" : "PROJECT_HEALTH"}`;

  function checkForUpdates() {
    setError(null);
    startChecking(async () => {
      try {
        const response = await fetch(`/api/projects/${data.projectId}/check-updates`, { method: "POST" });
        if (!response.ok) {
          const payload = (await response.json()) as { message?: string };
          throw new Error(payload.message ?? "Could not check for updates.");
        }
        router.refresh();
      } catch (cause: unknown) {
        setError(cause instanceof Error ? cause.message : "Could not check for updates.");
      }
    });
  }

  const shaLink = (sha: string) => (
    <a href={commitHref(sha)} target="_blank" rel="noreferrer" className="link-underline font-mono text-[0.8125rem] text-foreground">
      {short(sha)}
    </a>
  );

  const state = !data.lastReviewedSha ? "never" : isBehind ? "behind" : "fresh";

  return (
    <div className="flex items-center gap-2">
      <Popover>
        <PopoverTrigger className="group flex h-8 items-center gap-2 rounded-md px-2 text-sm text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 aria-expanded:bg-muted aria-expanded:text-foreground">
          <GitBranch className="size-3.5" />
          <span className="max-w-[9rem] truncate font-medium text-foreground">{data.branch}</span>
          <span
            aria-hidden="true"
            className={cn(
              "size-1.5 rounded-[2px]",
              state === "behind" ? "live-dot !size-1.5" : state === "fresh" ? "bg-ok" : "bg-subtle",
            )}
          />
          <span className="hidden lg:inline">
            {state === "behind" ? "New commits" : state === "fresh" ? "Up to date" : "Not reviewed"}
          </span>
          <ChevronDown className="size-3.5 transition-transform duration-300 group-aria-expanded:rotate-180" />
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0">
          <div className="px-4 pt-4 pb-3">
            <div className="text-section">{data.branch}</div>
            <p className="mt-0.5 text-xs text-muted-foreground">Reviews always read one exact commit of this branch.</p>
          </div>
          <dl className="divide-y divide-border border-y border-border text-sm">
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <dt className="text-muted-foreground">Latest commit</dt>
              <dd className="text-right">
                {data.latestKnownSha ? shaLink(data.latestKnownSha) : <span className="text-muted-foreground">Not checked</span>}
                {data.latestCheckedAt ? (
                  <div className="text-xs text-muted-foreground">
                    checked <RelativeTime date={data.latestCheckedAt} />
                  </div>
                ) : null}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <dt className="text-muted-foreground">Last reviewed</dt>
              <dd className="text-right">
                {data.lastReviewedSha ? shaLink(data.lastReviewedSha) : <span className="text-muted-foreground">Never</span>}
                {data.lastReviewedAt ? (
                  <div className="text-xs text-muted-foreground">
                    <RelativeTime date={data.lastReviewedAt} />
                  </div>
                ) : null}
              </dd>
            </div>
          </dl>
          <div className="flex flex-wrap items-center gap-2 p-3">
            <Button variant="ghost" size="sm" onClick={checkForUpdates} disabled={isChecking}>
              {isChecking ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              Check for updates
            </Button>
            {isBehind ? (
              <Button asChild size="sm" className="ml-auto">
                <Link href={reviewHref}>Review new commits</Link>
              </Button>
            ) : state === "fresh" ? (
              <span className="ml-auto inline-flex items-center gap-1 pr-1 text-xs text-ok">
                <Check className="size-3.5" />
                Reviewed
              </span>
            ) : null}
          </div>
          {error ? <p className="px-4 pb-3 text-xs text-destructive">{error}</p> : null}
        </PopoverContent>
      </Popover>
      {isBehind ? (
        <Button asChild size="sm" variant="outline" className="hidden md:inline-flex">
          <Link href={reviewHref}>Review new commits</Link>
        </Button>
      ) : null}
    </div>
  );
}

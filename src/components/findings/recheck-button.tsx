"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiRequest, errorMessage } from "@/lib/client-api";
import { cn } from "@/lib/utils";

const POLL_MS = 2_000;

/**
 * "Re-check on latest commit" (06): starts a RECHECK run for one or more
 * findings, then polls it and refreshes the page so the result shows inline.
 * When `navigate` is set, it goes to the run page instead of waiting.
 */
export function RecheckButton({
  projectId,
  findingIds,
  activeRunId = null,
  navigate = false,
  label = "Re-check on latest commit",
  size = "sm",
  variant = "outline",
  disabled = false,
  block = false,
}: {
  projectId: string;
  findingIds: string[];
  activeRunId?: string | null;
  navigate?: boolean;
  label?: string;
  size?: "sm" | "default";
  variant?: "outline" | "default" | "secondary";
  disabled?: boolean;
  /** Full-width button (side rails). */
  block?: boolean;
}) {
  const router = useRouter();
  const [runId, setRunId] = useState<string | null>(activeRunId);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!runId || navigate) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const poll = async () => {
      try {
        const run = await apiRequest<{ status: string; error: string | null }>(`/api/runs/${runId}`, "GET");
        if (stopped) return;
        if (run.status !== "QUEUED" && run.status !== "RUNNING") {
          setRunId(null);
          if (run.status === "FAILED") setError(run.error ?? "The re-check failed.");
          router.refresh();
          return;
        }
      } catch {
        // keep polling
      }
      if (!stopped) timer = setTimeout(poll, POLL_MS);
    };
    timer = setTimeout(poll, POLL_MS);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [runId, navigate, router]);

  async function start() {
    setError(null);
    setStarting(true);
    try {
      const { runId: id } = await apiRequest<{ runId: string }>("/api/findings/recheck", "POST", { projectId, findingIds });
      if (navigate) {
        router.push(`/p/${projectId}/review-lab/${id}`);
        return;
      }
      setRunId(id);
    } catch (cause) {
      setError(errorMessage(cause, "Could not start the re-check."));
    } finally {
      setStarting(false);
    }
  }

  const busy = starting || runId !== null;
  return (
    <div className={cn("flex flex-wrap items-center gap-2", block && "flex-col items-stretch")}>
      <Button size={size} variant={variant} onClick={start} disabled={busy || disabled || findingIds.length === 0} className={cn(block && "w-full")}>
        {busy ? <Loader2 className="animate-spin" /> : <RefreshCcw className="group-hover/button:rotate-180" />}
        {runId ? "Re-checking…" : label}
      </Button>
      {runId ? (
        <Link href={`/p/${projectId}/review-lab/${runId}`} className="link-underline text-xs text-muted-foreground">
          View progress
        </Link>
      ) : null}
      {error ? <span className="text-sm text-destructive">{error}</span> : null}
    </div>
  );
}

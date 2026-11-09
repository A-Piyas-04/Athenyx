"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Re-enqueues a review with the same type and input (an explicit user action). */
export function TryAgain({
  projectId,
  type,
  input,
  branch,
}: {
  projectId: string;
  type: string;
  input: Record<string, unknown>;
  /** Release Gate may assess a branch other than the selected one. */
  branch?: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function retry() {
    setError(null);
    startTransition(async () => {
      try {
        const response = await fetch(`/api/projects/${projectId}/runs`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type, input, ...(branch ? { branch } : {}) }),
        });
        const payload = (await response.json()) as { runId?: string; message?: string };
        if (!response.ok || !payload.runId) throw new Error(payload.message ?? "Could not start the review.");
        router.push(`/p/${projectId}/review-lab/${payload.runId}`);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not start the review.");
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button size="sm" onClick={retry} disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
        Try again
      </Button>
      {error ? <span className="text-sm text-destructive">{error}</span> : null}
    </div>
  );
}

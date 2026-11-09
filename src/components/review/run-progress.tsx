"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Check, Loader2, X } from "lucide-react";
import type { RunStage, RunStatus } from "@/generated/prisma/enums";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { personaLabel, STAGE_STEPS } from "@/lib/review/labels";
import type { PersonaRunStatus } from "@/lib/review/types";
import { cn } from "@/lib/utils";
import { BoardNetwork } from "@/components/visuals/board-network";
import { PersonaMark } from "@/components/board/persona-mark";
import { deriveStance, ROSTER, seatFor, STANCE_LABEL, STANCE_TONE } from "@/lib/review/board";
import { StageFlow } from "@/components/visuals/stage-flow";

export type RunSnapshot = {
  status: RunStatus;
  stage: RunStage;
  commitSha: string | null;
  personas: string[];
  personaStatus: Record<string, PersonaRunStatus> | null;
};

const POLL_MS = 2_000;

/**
 * Live progress while a run is QUEUED/RUNNING: polls the run every 2s (the only
 * auto-refresh in the app), then refreshes the page to show the result.
 */
export function RunProgress({ runId, initial }: { runId: string; initial: RunSnapshot }) {
  const router = useRouter();
  const [run, setRun] = useState<RunSnapshot>(initial);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const done = useRef(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    const poll = async () => {
      try {
        const response = await fetch(`/api/runs/${runId}`, { cache: "no-store" });
        if (response.ok) {
          const next = (await response.json()) as RunSnapshot;
          if (stopped) return;
          setRun(next);
          if (next.status !== "QUEUED" && next.status !== "RUNNING") {
            if (!done.current) {
              done.current = true;
              router.refresh();
            }
            return;
          }
        }
      } catch {
        // Network blip: keep polling.
      }
      if (!stopped) timer = setTimeout(poll, POLL_MS);
    };
    timer = setTimeout(poll, POLL_MS);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [runId, router]);

  async function cancel() {
    setCancelling(true);
    setError(null);
    try {
      const response = await fetch(`/api/runs/${runId}/cancel`, { method: "POST" });
      if (!response.ok) {
        const payload = (await response.json()) as { message?: string };
        throw new Error(payload.message ?? "Could not cancel the review.");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not cancel the review.");
      setCancelling(false);
    }
  }

  const queued = run.status === "QUEUED";
  const currentIndex = queued ? -1 : STAGE_STEPS.findIndex((s) => s.stage === run.stage);
  const current = currentIndex >= 0 ? STAGE_STEPS[currentIndex] : null;

  return (
    <section className="space-y-10" aria-live="polite">
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">
              {queued ? "Queued" : `Step ${currentIndex + 1} of ${STAGE_STEPS.length}`}
            </p>
            <AnimatePresence mode="wait" initial={false}>
              <motion.h2
                key={current?.stage ?? "queued"}
                className="text-title text-3xl"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              >
                {queued ? "Waiting for the review worker" : current ? `${current.label}…` : "Working…"}
              </motion.h2>
            </AnimatePresence>
          </div>
          <Button variant="outline" size="sm" onClick={cancel} disabled={cancelling}>
            {cancelling ? <Loader2 className="animate-spin" /> : <X />}
            {cancelling ? "Cancelling…" : "Cancel review"}
          </Button>
        </div>

        <StageFlow steps={STAGE_STEPS.map((s) => ({ key: s.stage, label: s.label }))} current={currentIndex} />
      </div>

      {run.personas.length > 0 ? (
        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,30rem)_minmax(0,18rem)] lg:gap-16">
          <BoardNetwork
            commit={run.commitSha}
            nodes={run.personas.map((persona) => ({
              key: persona,
              label: personaLabel(persona),
              status: run.personaStatus?.[persona] ?? "pending",
            }))}
          />
          <ul className="space-y-5">
            {run.personas.map((persona) => {
              const status = run.personaStatus?.[persona] ?? "pending";
              const stance = deriveStance(status, []);
              const live = status === "running" || status === "waiting_rate_limit";
              return (
                <li key={persona} className="flex items-start gap-3">
                  <PersonaMark persona={persona} size="sm" tone={status === "done" ? "active" : live ? "gold" : "idle"} />
                  <div className="min-w-0 space-y-0.5">
                    <div className="text-sm font-semibold">{seatFor(persona).name}</div>
                    <div className={cn("inline-flex items-center gap-1.5 text-xs font-medium", status === "done" ? "text-ok" : STANCE_TONE[stance])}>
                      {live ? <Loader2 className="size-3 animate-spin" /> : status === "done" ? <Check className="size-3" /> : status === "failed" ? <X className="size-3" /> : null}
                      {status === "done" ? "Finished its analysis" : STANCE_LABEL[stance]}
                    </div>
                    <p className="line-clamp-2 text-xs text-muted-foreground">{seatFor(persona).focus}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {run.personas.length > 0 ? (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">Also on the board, not seated for this review</h3>
          <ul className="flex flex-wrap gap-x-5 gap-y-3">
            {ROSTER.filter((seat) => seat.kind !== "support" && !run.personas.includes(seat.key)).map((seat) => (
              <li key={seat.key} className="flex items-center gap-2 text-sm text-muted-foreground" title={seat.focus}>
                <PersonaMark persona={seat.key} size="xs" tone="dim" />
                {seat.name}
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">After the specialists finish, the Evidence Arbiter checks every citation against the code before anything is saved.</p>
        </div>
      ) : null}

      <p className="max-w-[62ch] text-sm text-muted-foreground">
        Free AI tiers are rate-limited, so a review can take a few minutes. You can leave this page; the review keeps running.
      </p>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
    </section>
  );
}

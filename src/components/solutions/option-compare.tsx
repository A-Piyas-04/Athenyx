"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { Check, Loader2, Minus, Plus } from "lucide-react";
import { DecisionForm, type FindingOption } from "@/components/decisions/decision-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiRequest, errorMessage } from "@/lib/client-api";
import { draftFromFinding, type DraftSourceFinding } from "@/lib/decisions/draft";
import { cn } from "@/lib/utils";
import { EffortMeter } from "@/components/visuals/effort-meter";

/**
 * Option columns (06 Solution Lab). "Choose this option" records the choice on
 * the finding (chosen option + In progress), then offers a prefilled decision
 * the user can edit and save, or skip. No AI calls here.
 */
export function OptionCompare({
  projectId,
  finding,
  chosenOptionIndex,
  findingOptions,
}: {
  projectId: string;
  finding: DraftSourceFinding;
  chosenOptionIndex: number | null;
  findingOptions: FindingOption[];
}) {
  const router = useRouter();
  const [choosing, setChoosing] = useState<number | null>(null);
  const [dialogFor, setDialogFor] = useState<number | null>(null);
  const [savedDecisionId, setSavedDecisionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recommended = finding.recommendation?.optionIndex ?? null;

  async function choose(index: number) {
    setError(null);
    setSavedDecisionId(null);
    setChoosing(index);
    try {
      await apiRequest(`/api/findings/${finding.id}`, "PATCH", { chosenOptionIndex: index, status: "IN_PROGRESS" });
      setDialogFor(index);
      router.refresh();
    } catch (cause) {
      setError(errorMessage(cause, "Could not record your choice."));
    } finally {
      setChoosing(null);
    }
  }

  if (finding.options.length === 0) {
    return <p className="text-sm text-muted-foreground">The reviewers did not propose fix options for this finding.</p>;
  }

  const cols = finding.options.length;

  return (
    <div className="space-y-6">
      <div
        className={cn(
          "grid border-y border-border",
          cols > 1 && "md:grid-cols-2 md:divide-x md:divide-border",
          cols > 2 && "xl:grid-cols-3",
          "divide-y divide-border md:divide-y-0",
        )}
      >
        {finding.options.map((option, index) => {
          const isRecommended = recommended === index;
          const isChosen = chosenOptionIndex === index;
          return (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: index * 0.08, ease: [0.22, 1, 0.36, 1] }}
              className={cn(
                "group flex flex-col gap-5 py-7 transition-colors duration-300 md:px-7 md:first:pl-0 md:last:pr-0",
                isChosen && "md:bg-accent/40",
              )}
            >
              <div className="space-y-2">
                <div className="flex h-5 flex-wrap items-center gap-x-3 text-xs font-semibold">
                  <span className="text-muted-foreground tabular-nums">Option {index + 1}</span>
                  {isRecommended ? <span className="text-link">Recommended</span> : null}
                  {isChosen ? (
                    <span className="inline-flex items-center gap-1 text-ok">
                      <Check className="size-3" />
                      Chosen
                    </span>
                  ) : null}
                </div>
                <h3 className="text-title text-lg">{option.title}</h3>
                <EffortMeter effort={option.effort} />
                {option.description ? <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{option.description}</p> : null}
              </div>
              <PointList items={option.pros} kind="pro" />
              <PointList items={option.cons} kind="con" />
              {isRecommended && finding.recommendation?.rationale ? (
                <p className="text-sm leading-relaxed">
                  <span className="font-semibold">Why: </span>
                  <span className="text-muted-foreground">{finding.recommendation.rationale}</span>
                </p>
              ) : null}
              <div className="mt-auto pt-2">
                <Button
                  variant={isChosen ? "outline" : isRecommended ? "default" : "outline"}
                  onClick={() => choose(index)}
                  disabled={choosing !== null}
                >
                  {choosing === index ? <Loader2 className="animate-spin" /> : null}
                  {isChosen ? "Record decision" : "Choose this option"}
                </Button>
              </div>
            </motion.div>
          );
        })}
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {savedDecisionId ? (
        <Alert>
          <AlertDescription>
            Decision saved.{" "}
            <Link href={`/p/${projectId}/decisions/${savedDecisionId}`} className="font-medium">
              Open it in the Decision Ledger
            </Link>
          </AlertDescription>
        </Alert>
      ) : null}

      <Dialog open={dialogFor !== null} onOpenChange={(open) => !open && setDialogFor(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Record this decision</DialogTitle>
            <DialogDescription>Your choice is saved on the finding. Save the decision for the ledger, or skip it.</DialogDescription>
          </DialogHeader>
          {dialogFor !== null ? (
            <DecisionForm
              key={dialogFor}
              projectId={projectId}
              mode={{ kind: "create" }}
              initial={draftFromFinding(finding, dialogFor)}
              findingOptions={findingOptions}
              onSaved={(id) => {
                setDialogFor(null);
                setSavedDecisionId(id);
                router.refresh();
              }}
              onCancel={() => setDialogFor(null)}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PointList({ items, kind }: { items: string[]; kind: "pro" | "con" }) {
  if (items.length === 0) return null;
  const Icon = kind === "pro" ? Plus : Minus;
  return (
    <ul className="space-y-1.5 text-sm" aria-label={kind === "pro" ? "Pros" : "Cons"}>
      {items.map((item, i) => (
        <li key={i} className="grid grid-cols-[1.25rem_1fr] leading-relaxed">
          <Icon className={cn("mt-1 size-3.5", kind === "pro" ? "text-ok" : "text-bad")} aria-hidden="true" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

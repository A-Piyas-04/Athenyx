"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import type { Classification, FindingStatus, Severity } from "@/generated/prisma/enums";
import { SeverityDot } from "@/components/findings/badges";
import { PersonaMark } from "@/components/board/persona-mark";
import { RecheckButton } from "@/components/findings/recheck-button";
import { FindingStatusBadge } from "@/components/findings/status-badge";
import { RelativeTime } from "@/components/relative-time";
import { Checkbox } from "@/components/ui/checkbox";
import { CLASSIFICATION_LABELS, personaLabel, SEVERITY_LABELS } from "@/lib/review/labels";
import { cn } from "@/lib/utils";

export type FindingRow = {
  id: string;
  title: string;
  severity: Severity;
  classification: Classification;
  status: FindingStatus;
  manual: boolean;
  persona: string;
  primaryFile: string | null;
  lastSeenSha: string;
  updatedAt: string;
};

export const MAX_BULK_RECHECK = 5;

/**
 * Risk Center list (06). Row checkboxes feed "Re-check selected (max 5)";
 * the bulk bar only appears once something is selected.
 */
export function FindingTable({ projectId, rows }: { projectId: string; rows: FindingRow[] }) {
  const [selected, setSelected] = useState<string[]>([]);

  const toggle = (id: string, on: boolean) =>
    setSelected((prev) => (on ? (prev.includes(id) ? prev : [...prev, id]) : prev.filter((x) => x !== id)));
  const tooMany = selected.length > MAX_BULK_RECHECK;

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[44rem] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="w-10 py-3 pr-2 font-medium">
                <span className="sr-only">Select</span>
              </th>
              <th className="w-28 py-3 pr-4 font-medium">Severity</th>
              <th className="py-3 pr-4 font-medium">Finding</th>
              <th className="w-36 py-3 pr-4 font-medium">Status</th>
              <th className="w-24 py-3 pr-4 font-medium">Seen at</th>
              <th className="w-28 py-3 text-right font-medium">Updated</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const isSelected = selected.includes(row.id);
              return (
                <motion.tr
                  key={row.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, delay: Math.min(index, 12) * 0.025, ease: [0.22, 1, 0.36, 1] }}
                  className={cn("group border-b border-border transition-colors duration-150 hover:bg-muted/70", isSelected && "bg-accent/60 hover:bg-accent/70")}
                >
                  <td className="py-4 pr-2 pl-1 align-top">
                    <Checkbox aria-label={`Select ${row.title}`} checked={isSelected} onCheckedChange={(v) => toggle(row.id, v === true)} className="mt-0.5" />
                  </td>
                  <td className="py-4 pr-4 align-top">
                    <span className={cn("inline-flex items-center gap-2 text-sm", row.severity === "CRITICAL" && "font-semibold text-sev-critical")}>
                      <SeverityDot severity={row.severity} />
                      {SEVERITY_LABELS[row.severity]}
                    </span>
                  </td>
                  <td className="py-4 pr-4 align-top">
                    <Link href={`/p/${projectId}/risks/${row.id}`} className="font-medium leading-snug group-hover:underline group-hover:underline-offset-4">
                      {row.title}
                    </Link>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <PersonaMark persona={row.persona} size="2xs" tone="idle" />
                        {personaLabel(row.persona)}
                      </span>
                      <span>{CLASSIFICATION_LABELS[row.classification]}</span>
                      {row.primaryFile ? (
                        <span className="max-w-72 truncate font-mono" title={row.primaryFile}>
                          {row.primaryFile}
                        </span>
                      ) : (
                        <span>From your description</span>
                      )}
                    </div>
                  </td>
                  <td className="py-4 pr-4 align-top">
                    <FindingStatusBadge status={row.status} manual={row.manual} />
                  </td>
                  <td className="py-4 pr-4 align-top font-mono text-xs text-muted-foreground">{row.lastSeenSha.slice(0, 7)}</td>
                  <td className="py-4 text-right align-top text-xs text-muted-foreground">
                    <RelativeTime date={row.updatedAt} />
                  </td>
                </motion.tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <AnimatePresence>
        {selected.length > 0 ? (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: "spring", stiffness: 420, damping: 34 }}
            className="fixed inset-x-0 bottom-6 z-40 flex justify-center px-4"
          >
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border-strong bg-popover py-2 pr-2 pl-4 shadow-2xl shadow-black/15">
              <span className="text-sm font-medium tabular-nums">
                {selected.length} selected
                {tooMany ? <span className="ml-2 font-normal text-destructive">Max {MAX_BULK_RECHECK}</span> : null}
              </span>
              <RecheckButton
                projectId={projectId}
                findingIds={selected}
                navigate
                variant="default"
                disabled={tooMany}
                label="Re-check on latest commit"
              />
              <button
                type="button"
                onClick={() => setSelected([])}
                aria-label="Clear selection"
                className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}

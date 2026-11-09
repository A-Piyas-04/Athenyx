"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { Classification, Severity } from "@/generated/prisma/enums";
import { SeverityDot } from "@/components/findings/badges";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { FindingFilters } from "@/lib/queries/findings";
import { CLASSIFICATION_LABELS, personaLabel, SEVERITY_LABELS } from "@/lib/review/labels";
import { riskHref, type RiskQuery } from "@/lib/risk-href";
import { cn } from "@/lib/utils";

type Query = RiskQuery;

/**
 * Search plus a single "Filters" popover (severity, specialist, kind). Active
 * filters show as removable chips so the toolbar stays one line.
 */
export function RiskFilters({
  action,
  filters,
  personas,
  statusParam,
}: {
  action: string;
  filters: FindingFilters;
  personas: string[];
  /** The raw status param to preserve (the status tabs own it). */
  statusParam: string | undefined;
}) {
  const router = useRouter();
  const [q, setQ] = useState(filters.q);
  const [severity, setSeverity] = useState<string[]>(filters.severities);
  const [persona, setPersona] = useState(filters.persona ?? "");
  const [classification, setClassification] = useState(filters.classification ?? "");

  const current: Query = {
    status: statusParam,
    severity: filters.severities,
    persona: filters.persona,
    classification: filters.classification,
    q: filters.q,
  };
  const go = (next: Partial<Query>) => router.push(riskHref(action, { ...current, ...next }), { scroll: false });
  const activeCount = filters.severities.length + (filters.persona ? 1 : 0) + (filters.classification ? 1 : 0);

  const chips: { key: string; label: React.ReactNode; remove: Partial<Query> }[] = [
    ...filters.severities.map((s) => ({
      key: `sev-${s}`,
      label: (
        <>
          <SeverityDot severity={s} />
          {SEVERITY_LABELS[s]}
        </>
      ),
      remove: { severity: filters.severities.filter((x) => x !== s) },
    })),
    ...(filters.persona ? [{ key: "persona", label: personaLabel(filters.persona), remove: { persona: null } }] : []),
    ...(filters.classification
      ? [{ key: "class", label: CLASSIFICATION_LABELS[filters.classification], remove: { classification: null } }]
      : []),
    ...(filters.q ? [{ key: "q", label: <>&ldquo;{filters.q}&rdquo;</>, remove: { q: "" } }] : []),
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <form
          className="relative min-w-52 flex-1 sm:max-w-sm"
          onSubmit={(e) => {
            e.preventDefault();
            go({ q: q.trim() });
          }}
        >
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search findings" className="pl-9" aria-label="Search findings" />
        </form>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline">
              <SlidersHorizontal />
              Filters
              {activeCount > 0 ? (
                <span className="ml-0.5 inline-flex size-5 items-center justify-center rounded-[3px] bg-primary text-xs font-semibold text-primary-foreground">
                  {activeCount}
                </span>
              ) : null}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 space-y-5">
            <fieldset className="space-y-2">
              <legend className="text-label">Severity</legend>
              <div className="flex flex-wrap gap-1.5">
                {Object.values(Severity).map((s) => {
                  const on = severity.includes(s);
                  return (
                    <button
                      key={s}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setSeverity((prev) => (on ? prev.filter((x) => x !== s) : [...prev, s]))}
                      className={cn(
                        "inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-sm transition-colors duration-200",
                        on ? "border-foreground bg-foreground text-background" : "border-border hover:border-border-strong hover:bg-muted",
                      )}
                    >
                      <SeverityDot severity={s} />
                      {SEVERITY_LABELS[s]}
                    </button>
                  );
                })}
              </div>
            </fieldset>
            <label className="block space-y-2">
              <span className="text-label">Specialist</span>
              <NativeSelect className="w-full" value={persona} onChange={(e) => setPersona(e.target.value)}>
                <option value="">Any specialist</option>
                {personas.map((p) => (
                  <option key={p} value={p}>
                    {personaLabel(p)}
                  </option>
                ))}
              </NativeSelect>
            </label>
            <label className="block space-y-2">
              <span className="text-label">Kind</span>
              <NativeSelect className="w-full" value={classification} onChange={(e) => setClassification(e.target.value)}>
                <option value="">Any kind</option>
                {Object.values(Classification).map((c) => (
                  <option key={c} value={c}>
                    {CLASSIFICATION_LABELS[c]}
                  </option>
                ))}
              </NativeSelect>
            </label>
            <div className="flex items-center justify-between gap-2 border-t border-border pt-4">
              <PopoverClose asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSeverity([]);
                    setPersona("");
                    setClassification("");
                    go({ severity: [], persona: null, classification: null });
                  }}
                >
                  Clear
                </Button>
              </PopoverClose>
              <PopoverClose asChild>
                <Button size="sm" onClick={() => go({ severity, persona: persona || null, classification: classification || null })}>
                  Apply filters
                </Button>
              </PopoverClose>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {chips.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {chips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={() => go(chip.remove)}
              className="group inline-flex h-7 items-center gap-1.5 rounded-md bg-muted px-2.5 text-xs font-medium transition-colors hover:bg-accent"
              aria-label="Remove filter"
            >
              {chip.label}
              <X className="size-3 text-muted-foreground transition-transform duration-200 group-hover:rotate-90 group-hover:text-foreground" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

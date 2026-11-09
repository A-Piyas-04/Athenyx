"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, X } from "lucide-react";
import type { FindingStatus, Severity } from "@/generated/prisma/enums";
import { SeverityDot } from "@/components/findings/badges";
import { Disclosure } from "@/components/motion/disclosure";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest, errorMessage } from "@/lib/client-api";
import { draftToBody, type DecisionDraft, type DecisionDraftStatus } from "@/lib/decisions/draft";
import { FINDING_STATUS_LABELS } from "@/lib/review/labels";

export type FindingOption = { id: string; title: string; severity: Severity; status: FindingStatus };

type Mode = { kind: "create" } | { kind: "edit"; decisionId: string } | { kind: "supersede"; decisionId: string };

/**
 * Create / edit / supersede a decision (06 Decision Ledger). The four required
 * fields come first; everything optional sits behind "More detail".
 */
export function DecisionForm({
  projectId,
  mode,
  initial,
  findingOptions,
  onSaved,
  onCancel,
  submitLabel,
  cancelLabel = "Skip",
}: {
  projectId: string;
  mode: Mode;
  initial: DecisionDraft;
  findingOptions: FindingOption[];
  /** Called with the saved decision id; defaults to opening the decision. */
  onSaved?: (decisionId: string) => void;
  onCancel?: () => void;
  submitLabel?: string;
  cancelLabel?: string;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<DecisionDraft>(initial);
  const [filesText, setFilesText] = useState(initial.relatedFiles.join("\n"));
  const [findingQuery, setFindingQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof DecisionDraft>(key: K, value: DecisionDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const visibleFindings = useMemo(() => {
    const q = findingQuery.trim().toLowerCase();
    const list = q ? findingOptions.filter((f) => f.title.toLowerCase().includes(q)) : findingOptions;
    // Keep linked findings visible even when filtered out.
    const linked = findingOptions.filter((f) => draft.findingIds.includes(f.id) && !list.includes(f));
    return [...linked, ...list];
  }, [findingOptions, findingQuery, draft.findingIds]);

  const missing = [
    draft.title.trim() === "" && "title",
    draft.context.trim() === "" && "context",
    draft.chosenOption.trim() === "" && "decision",
    draft.rationale.trim() === "" && "rationale",
  ].filter(Boolean) as string[];

  const extras =
    draft.alternatives.length + (draft.constraints ? 1 : 0) + (draft.assumptions ? 1 : 0) + (filesText.trim() ? 1 : 0) + draft.findingIds.length;

  async function save() {
    setError(null);
    setSaving(true);
    const body = draftToBody({ ...draft, relatedFiles: filesText.split("\n") });
    try {
      const url =
        mode.kind === "create"
          ? `/api/projects/${projectId}/decisions`
          : mode.kind === "edit"
            ? `/api/decisions/${mode.decisionId}`
            : `/api/decisions/${mode.decisionId}/supersede`;
      const { decision } = await apiRequest<{ decision: { id: string } }>(url, mode.kind === "edit" ? "PATCH" : "POST", body);
      if (onSaved) onSaved(decision.id);
      else if (mode.kind === "edit") router.refresh();
      else router.push(`/p/${projectId}/decisions/${decision.id}`);
    } catch (cause) {
      setError(errorMessage(cause, "Could not save the decision."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <Field id="d-title" label="Title">
        <Input id="d-title" value={draft.title} onChange={(e) => set("title", e.target.value)} maxLength={200} placeholder="Scope expense queries to the signed-in user" />
      </Field>
      <Field id="d-context" label="Context" hint="The problem, and why a decision was needed.">
        <Textarea id="d-context" value={draft.context} onChange={(e) => set("context", e.target.value)} maxLength={4000} rows={3} />
      </Field>
      <div className="grid gap-6 md:grid-cols-2">
        <Field id="d-chosen" label="Decision">
          <Textarea id="d-chosen" value={draft.chosenOption} onChange={(e) => set("chosenOption", e.target.value)} maxLength={4000} rows={3} />
        </Field>
        <Field id="d-rationale" label="Rationale">
          <Textarea id="d-rationale" value={draft.rationale} onChange={(e) => set("rationale", e.target.value)} maxLength={4000} rows={3} />
        </Field>
      </div>

      <Disclosure
        chevron="start"
        className="border-y border-border"
        summaryClassName="py-4"
        contentClassName="space-y-6 pb-6"
        summary={
          <span className="text-sm font-semibold">
            More detail <span className="font-normal text-muted-foreground">(alternatives, constraints, files, linked findings{extras > 0 ? `, ${extras} filled` : ""})</span>
          </span>
        }
      >
        <div className="space-y-3">
          <div className="text-sm font-medium">Alternatives considered</div>
          {draft.alternatives.map((alt, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
              <Input
                aria-label={`Alternative ${i + 1} title`}
                placeholder="Alternative"
                value={alt.title}
                maxLength={200}
                onChange={(e) => set("alternatives", draft.alternatives.map((a, j) => (j === i ? { ...a, title: e.target.value } : a)))}
              />
              <Input
                aria-label={`Alternative ${i + 1} why not`}
                placeholder="Why not"
                value={alt.whyNot}
                maxLength={2000}
                onChange={(e) => set("alternatives", draft.alternatives.map((a, j) => (j === i ? { ...a, whyNot: e.target.value } : a)))}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Remove alternative"
                onClick={() => set("alternatives", draft.alternatives.filter((_, j) => j !== i))}
              >
                <X />
              </Button>
            </div>
          ))}
          {draft.alternatives.length < 10 ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => set("alternatives", [...draft.alternatives, { title: "", whyNot: "" }])}>
              <Plus />
              Add alternative
            </Button>
          ) : null}
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <Field id="d-constraints" label="Constraints" optional>
            <Textarea id="d-constraints" value={draft.constraints} onChange={(e) => set("constraints", e.target.value)} maxLength={4000} rows={2} />
          </Field>
          <Field id="d-assumptions" label="Assumptions" optional>
            <Textarea id="d-assumptions" value={draft.assumptions} onChange={(e) => set("assumptions", e.target.value)} maxLength={4000} rows={2} />
          </Field>
        </div>

        <Field id="d-files" label="Related files" optional hint="One path per line.">
          <Textarea id="d-files" value={filesText} onChange={(e) => setFilesText(e.target.value)} rows={2} className="font-mono text-xs" />
        </Field>

        <div className="space-y-2">
          <div className="text-sm font-medium">
            Linked findings <span className="font-normal text-muted-foreground">({draft.findingIds.length})</span>
          </div>
          {findingOptions.length === 0 ? (
            <p className="text-xs text-muted-foreground">This project has no findings yet.</p>
          ) : (
            <>
              <Input aria-label="Filter findings" placeholder="Filter findings" value={findingQuery} onChange={(e) => setFindingQuery(e.target.value)} className="max-w-sm" />
              <ul className="max-h-56 divide-y divide-border overflow-y-auto rounded-md border border-border">
                {visibleFindings.map((f) => (
                  <li key={f.id}>
                    <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm transition-colors hover:bg-muted/60">
                      <Checkbox
                        checked={draft.findingIds.includes(f.id)}
                        onCheckedChange={(v) =>
                          set("findingIds", v === true ? [...draft.findingIds, f.id] : draft.findingIds.filter((id) => id !== f.id))
                        }
                      />
                      <SeverityDot severity={f.severity} />
                      <span className="min-w-0 flex-1 truncate">{f.title}</span>
                      <span className="text-xs text-muted-foreground">{FINDING_STATUS_LABELS[f.status]}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </Disclosure>

      <div className="flex flex-wrap items-end gap-6">
        <div className="space-y-2">
          <Label htmlFor="d-status" className="text-sm font-medium">
            Status
          </Label>
          <NativeSelect id="d-status" className="w-44" value={draft.status} onChange={(e) => set("status", e.target.value as DecisionDraftStatus)}>
            <option value="PROPOSED">Proposed</option>
            <option value="ACCEPTED">Accepted</option>
            {mode.kind === "edit" ? <option value="REVERTED">Reverted</option> : null}
          </NativeSelect>
        </div>
        {draft.commitSha ? (
          <p className="pb-2.5 text-xs text-muted-foreground">
            Made against commit <span className="font-mono">{draft.commitSha.slice(0, 7)}</span>
          </p>
        ) : null}
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={save} disabled={saving || missing.length > 0}>
          {saving ? <Loader2 className="animate-spin" /> : null}
          {submitLabel ?? (mode.kind === "edit" ? "Save changes" : mode.kind === "supersede" ? "Save replacement" : "Save decision")}
        </Button>
        {onCancel ? (
          <Button variant="ghost" onClick={onCancel} disabled={saving}>
            {cancelLabel}
          </Button>
        ) : null}
        {missing.length > 0 ? <span className="text-xs text-muted-foreground">Still needed: {missing.join(", ")}.</span> : null}
      </div>
    </div>
  );
}

function Field({
  id,
  label,
  hint,
  optional,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-sm font-medium">
        {label}
        {optional ? <span className="font-normal text-muted-foreground">(optional)</span> : null}
      </Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

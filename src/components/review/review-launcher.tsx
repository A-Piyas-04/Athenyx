"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Loader2 } from "lucide-react";
import { Segmented } from "@/components/motion/segmented";
import { ACK_KEY, DataNotice, type ProviderNotice } from "@/components/review/data-notice";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Disclosure } from "@/components/motion/disclosure";

export type LabType = "PROJECT_HEALTH" | "LATEST_CHANGES" | "ASK" | "PROPOSAL" | "ISSUE";

export type { ProviderNotice };

const TYPES: { type: LabType; short: string; title: string; description: string }[] = [
  { type: "PROJECT_HEALTH", short: "Health", title: "Project Health", description: "An open-ended scan for the risks that matter most." },
  { type: "LATEST_CHANGES", short: "Changes", title: "Latest Changes", description: "Review only what changed since the last reviewed commit." },
  { type: "ASK", short: "Ask", title: "Ask About My Codebase", description: "A specific question, answered from the code itself." },
  { type: "PROPOSAL", short: "Proposal", title: "Proposal Review", description: "Assess an idea before you build it." },
  { type: "ISSUE", short: "Issue", title: "Issue Investigation", description: "Plausible causes for a symptom, and how to check each." },
];

type Fields = {
  focus: string;
  question: string;
  brief: string;
  constraints: string;
  symptom: string;
  expected: string;
  actual: string;
  log: string;
};

const EMPTY: Fields = { focus: "", question: "", brief: "", constraints: "", symptom: "", expected: "", actual: "", log: "" };

/** Required field per type, mirrored by the server schema (04 §2). */
const REQUIRED: Partial<Record<LabType, { key: keyof Fields; label: string }>> = {
  ASK: { key: "question", label: "a question" },
  PROPOSAL: { key: "brief", label: "a proposal" },
  ISSUE: { key: "symptom", label: "the symptom" },
};

function inputFor(type: LabType, f: Fields): Record<string, string> {
  const pick = (...keys: (keyof Fields)[]) => Object.fromEntries(keys.map((k) => [k, f[k].trim()]).filter(([, v]) => v !== ""));
  switch (type) {
    case "PROJECT_HEALTH":
    case "LATEST_CHANGES":
      return pick("focus");
    case "ASK":
      return pick("question", "constraints");
    case "PROPOSAL":
      return pick("brief", "constraints");
    case "ISSUE":
      return pick("symptom", "expected", "actual", "log");
  }
}

export function ReviewLauncher({
  projectId,
  initialType,
  lastReviewedSha,
  notices,
  aiError,
  busy = false,
}: {
  busy?: boolean;
  projectId: string;
  initialType: LabType;
  lastReviewedSha: string | null;
  notices: Record<LabType, ProviderNotice[]>;
  aiError: string | null;
}) {
  const router = useRouter();
  const [type, setType] = useState<LabType>(initialType);
  const [fields, setFields] = useState<Fields>(EMPTY);
  const [acknowledged, setAcknowledged] = useState(true);
  const [ticked, setTicked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isStarting, startTransition] = useTransition();

  useEffect(() => {
    let stored = false;
    try {
      stored = window.localStorage.getItem(ACK_KEY) === "1";
    } catch {
      // Storage unavailable: ask every time.
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads browser-only storage after hydration
    setAcknowledged(stored);
  }, []);

  const set = (key: keyof Fields) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setFields((prev) => ({ ...prev, [key]: e.target.value }));

  const noBaseline = type === "LATEST_CHANGES" && !lastReviewedSha;
  const required = REQUIRED[type];
  const missingRequired = required ? fields[required.key].trim() === "" : false;
  const needsAck = !acknowledged && !ticked;
  const disabled = busy || isStarting || noBaseline || missingRequired || needsAck || aiError !== null;
  const meta = TYPES.find((t) => t.type === type)!;

  function start() {
    setError(null);
    startTransition(async () => {
      try {
        const response = await fetch(`/api/projects/${projectId}/runs`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type, input: inputFor(type, fields) }),
        });
        const payload = (await response.json()) as { runId?: string; message?: string };
        if (!response.ok || !payload.runId) throw new Error(payload.message ?? "Could not start the review.");
        if (!acknowledged) {
          try {
            window.localStorage.setItem(ACK_KEY, "1");
          } catch {
            // ignore
          }
        }
        router.push(`/p/${projectId}/review-lab/${payload.runId}`);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not start the review.");
      }
    });
  }

  const providers = notices[type] ?? [];
  const allLocal = providers.length > 0 && providers.every((p) => p.local);

  return (
    <div className="space-y-8">
      <Segmented
        label="Review type"
        value={type}
        onChange={(t) => {
          setType(t);
          setError(null);
        }}
        options={TYPES.map((t) => ({ value: t.type, label: t.short }))}
      />

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={type}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          className="space-y-6"
        >
          <div className="space-y-1">
            <h2 className="text-title text-xl">{meta.title}</h2>
            <p className="text-sm text-muted-foreground">{meta.description}</p>
          </div>

          {type === "PROJECT_HEALTH" ? (
            <Field id="focus" label="Focus" optional hint="For example authentication, payments, or the API layer.">
              <Input id="focus" value={fields.focus} onChange={set("focus")} maxLength={1000} placeholder="Leave empty for a broad scan" />
            </Field>
          ) : null}

          {type === "LATEST_CHANGES" ? (
            noBaseline ? (
              <Alert>
                <AlertTitle>No baseline yet</AlertTitle>
                <AlertDescription>
                  Latest Changes compares against the last reviewed commit, and this project has never been reviewed.{" "}
                  <button type="button" className="font-medium text-link underline underline-offset-4" onClick={() => setType("PROJECT_HEALTH")}>
                    Run Project Health instead
                  </button>
                </AlertDescription>
              </Alert>
            ) : (
              <>
                <p className="text-sm">
                  <span className="text-muted-foreground">Comparing against the last reviewed commit </span>
                  <span className="font-mono text-[0.8125rem]">{lastReviewedSha?.slice(0, 7)}</span>
                </p>
                <Field id="focus" label="Focus" optional>
                  <Input id="focus" value={fields.focus} onChange={set("focus")} maxLength={1000} />
                </Field>
              </>
            )
          ) : null}

          {type === "ASK" ? (
            <>
              <Field id="question" label="Your question">
                <Textarea
                  id="question"
                  value={fields.question}
                  onChange={set("question")}
                  maxLength={2000}
                  rows={3}
                  placeholder="Where is authorization checked for expense routes?"
                />
              </Field>
              <MoreDetails>
                <Field id="constraints" label="Constraints" optional>
                  <Textarea id="constraints" value={fields.constraints} onChange={set("constraints")} maxLength={2000} rows={2} />
                </Field>
              </MoreDetails>
            </>
          ) : null}

          {type === "PROPOSAL" ? (
            <>
              <Field id="brief" label="What you plan to build" hint="It doesn't need to exist yet.">
                <Textarea
                  id="brief"
                  value={fields.brief}
                  onChange={set("brief")}
                  maxLength={4000}
                  rows={5}
                  placeholder="Add Redis caching for group balances…"
                />
              </Field>
              <MoreDetails>
                <Field id="constraints" label="Constraints" optional>
                  <Textarea id="constraints" value={fields.constraints} onChange={set("constraints")} maxLength={2000} rows={2} />
                </Field>
              </MoreDetails>
            </>
          ) : null}

          {type === "ISSUE" ? (
            <>
              <Field id="symptom" label="What's going wrong">
                <Textarea
                  id="symptom"
                  value={fields.symptom}
                  onChange={set("symptom")}
                  maxLength={2000}
                  rows={3}
                  placeholder="Balances are sometimes off by one cent after splitting."
                />
              </Field>
              <MoreDetails label="Add expected behaviour, actual behaviour or a log">
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field id="expected" label="Expected" optional>
                    <Textarea id="expected" value={fields.expected} onChange={set("expected")} maxLength={1000} rows={2} />
                  </Field>
                  <Field id="actual" label="Actual" optional>
                    <Textarea id="actual" value={fields.actual} onChange={set("actual")} maxLength={1000} rows={2} />
                  </Field>
                </div>
                <Field id="log" label="Log or error output" optional>
                  <Textarea id="log" value={fields.log} onChange={set("log")} maxLength={8000} rows={5} className="font-mono text-xs" />
                </Field>
              </MoreDetails>
            </>
          ) : null}
        </motion.div>
      </AnimatePresence>

      <div className="space-y-4 border-t border-border pt-6">
        {aiError ? (
          <Alert variant="destructive">
            <AlertTitle>AI is not configured</AlertTitle>
            <AlertDescription>{aiError}</AlertDescription>
          </Alert>
        ) : (
          <DataNotice providers={providers} allLocal={allLocal} />
        )}

        {!acknowledged ? (
          <div className="flex items-center gap-2">
            <Checkbox id="ack" checked={ticked} onCheckedChange={(v) => setTicked(v === true)} />
            <Label htmlFor="ack" className="text-sm font-normal">
              I understand
            </Label>
          </div>
        ) : null}

        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Could not start the review</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <div className="flex flex-wrap items-center gap-4">
          <Button size="lg" onClick={start} disabled={disabled}>
            {isStarting ? <Loader2 className="animate-spin" /> : null}
            Start review
            {isStarting ? null : <ArrowRight className="group-hover/button:translate-x-0.5" />}
          </Button>
          {missingRequired && required ? <span className="text-sm text-muted-foreground">Enter {required.label} to start.</span> : null}
          <Link href={`/p/${projectId}/release`} className="link-underline ml-auto text-sm text-muted-foreground hover:text-foreground">
            Release checks live in Release Gate
          </Link>
        </div>
      </div>
    </div>
  );
}

function MoreDetails({ children, label = "Add constraints" }: { children: React.ReactNode; label?: string }) {
  return (
    <Disclosure
      chevron="start"
      summary={<span className="text-sm font-medium text-muted-foreground transition-colors group-hover:text-foreground">{label}</span>}
      contentClassName="space-y-5 pt-4"
    >
      {children}
    </Disclosure>
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
    <div className="max-w-2xl space-y-2">
      <Label htmlFor={id} className="text-sm font-medium">
        {label}
        {optional ? <span className="font-normal text-muted-foreground">(optional)</span> : null}
      </Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

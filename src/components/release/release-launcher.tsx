"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldCheck } from "lucide-react";
import { ACK_KEY, DataNotice, type ProviderNotice } from "@/components/review/data-notice";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { apiRequest, errorMessage } from "@/lib/client-api";

/** Branch selector + "Assess release readiness" (06 Release Gate). Starts a RELEASE run only on click. */
export function ReleaseLauncher({
  projectId,
  selectedBranch,
  providers,
  aiError,
  busy = false,
}: {
  busy?: boolean;
  projectId: string;
  selectedBranch: string;
  providers: ProviderNotice[];
  aiError: string | null;
}) {
  const router = useRouter();
  const [branches, setBranches] = useState<string[]>([selectedBranch]);
  const [branch, setBranch] = useState(selectedBranch);
  const [loadingBranches, setLoadingBranches] = useState(true);
  const [acknowledged, setAcknowledged] = useState(true);
  const [ticked, setTicked] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stored = false;
    try {
      stored = window.localStorage.getItem(ACK_KEY) === "1";
    } catch {
      // Storage unavailable: ask every time.
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads browser-only storage after hydration
    setAcknowledged(stored || process.env.NEXT_PUBLIC_ATHENYX_PREVIEW === "1");

    const controller = new AbortController();
    fetch(`/api/projects/${projectId}/branches`, { signal: controller.signal })
      .then(async (response) => {
        const payload = (await response.json()) as { branches?: { name: string }[] };
        if (response.ok && payload.branches) {
          const names = payload.branches.map((b) => b.name);
          setBranches(names.includes(selectedBranch) ? names : [selectedBranch, ...names]);
        }
      })
      .catch(() => undefined)
      .finally(() => setLoadingBranches(false));
    return () => controller.abort();
  }, [projectId, selectedBranch]);

  async function start() {
    setError(null);
    setStarting(true);
    try {
      const { runId } = await apiRequest<{ runId: string }>(`/api/projects/${projectId}/runs`, "POST", { type: "RELEASE", branch });
      try {
        window.localStorage.setItem(ACK_KEY, "1");
      } catch {
        // ignore
      }
      router.push(`/p/${projectId}/review-lab/${runId}`);
    } catch (cause) {
      setError(errorMessage(cause, "Could not start the assessment."));
      setStarting(false);
    }
  }

  const allLocal = providers.length > 0 && providers.every((p) => p.local);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="release-branch" className="text-label">
            Branch
          </Label>
          <NativeSelect
            id="release-branch"
            className="w-56"
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            disabled={loadingBranches && branches.length <= 1}
          >
            {branches.map((name) => (
              <option key={name} value={name}>
                {name}
                {name === selectedBranch ? " (selected)" : ""}
              </option>
            ))}
          </NativeSelect>
        </div>
        <Button onClick={start} disabled={busy || starting || aiError !== null || (!acknowledged && !ticked)}>
          {starting ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
          Assess release readiness
        </Button>
      </div>

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
          <Checkbox id="release-ack" checked={ticked} onCheckedChange={(v) => setTicked(v === true)} />
          <Label htmlFor="release-ack" className="text-sm font-normal">
            I understand
          </Label>
        </div>
      ) : null}

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}

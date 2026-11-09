"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Branch = { name: string; sha: string };

export function BranchSwitcher({
  projectId,
  currentBranch,
  defaultBranch,
  lastReviewedSha,
}: {
  projectId: string;
  currentBranch: string;
  defaultBranch: string;
  lastReviewedSha: string | null;
}) {
  const router = useRouter();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selected, setSelected] = useState(currentBranch);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/projects/${projectId}/branches`, { signal: controller.signal })
      .then(async (response) => {
        const payload = (await response.json()) as {
          branches?: Branch[];
          message?: string;
        };
        if (!response.ok) {
          throw new Error(payload.message ?? "Could not load branches.");
        }
        setBranches(payload.branches ?? []);
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setError(
          cause instanceof Error ? cause.message : "Could not load branches.",
        );
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [projectId]);

  function save() {
    if (selected === currentBranch) return;
    setError(null);
    startSaving(async () => {
      try {
        const response = await fetch(`/api/projects/${projectId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ selectedBranch: selected }),
        });
        if (!response.ok) {
          const payload = (await response.json()) as { message?: string };
          throw new Error(payload.message ?? "Could not change the branch.");
        }
        router.refresh();
      } catch (cause: unknown) {
        setError(
          cause instanceof Error ? cause.message : "Could not change the branch.",
        );
      }
    });
  }

  const changed = selected !== currentBranch;

  return (
    <div className="max-w-md space-y-4">
      <div className="space-y-2">
        <Label htmlFor="settings-branch">Branch to review</Label>
        <Select
          value={selected}
          onValueChange={setSelected}
          disabled={loading || branches.length === 0}
        >
          <SelectTrigger id="settings-branch" className="h-9 w-full max-w-xs">
            <SelectValue
              placeholder={loading ? "Loading branches…" : "Select a branch"}
            />
          </SelectTrigger>
          <SelectContent>
            {branches.map((branch) => (
              <SelectItem key={branch.name} value={branch.name}>
                {branch.name}
                {branch.name === defaultBranch ? " · default" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {changed ? (
        <Alert>
          <AlertTitle>Existing findings stay as they are</AlertTitle>
          <AlertDescription>
            Findings and reviews keep the commit they were reviewed at
            {lastReviewedSha
              ? ` (branch ${currentBranch} at ${lastReviewedSha.slice(0, 7)})`
              : ""}
            . Changing the branch only affects your next review.
          </AlertDescription>
        </Alert>
      ) : null}

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Could not change the branch</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {changed ? (
        <Button onClick={save} disabled={isSaving}>
          {isSaving ? <Loader2 className="size-4 animate-spin" /> : null}
          Switch to {selected}
        </Button>
      ) : null}
    </div>
  );
}

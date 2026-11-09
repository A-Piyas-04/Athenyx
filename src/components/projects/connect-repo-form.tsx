"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Loader2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { UserInstallation } from "@/lib/github/user";

type Branch = { name: string; sha: string };

/** Per-repository results, tagged so stale responses are simply ignored. */
type Keyed<T> = { key: string; value: T };

export function ConnectRepoForm({
  installations,
  installUrl,
}: {
  installations: UserInstallation[];
  installUrl: string;
}) {
  const router = useRouter();
  const [isConnecting, startConnecting] = useTransition();

  const usable = useMemo(
    () => installations.filter((item) => item.repos.length > 0),
    [installations],
  );

  const [installationId, setInstallationId] = useState<string>(
    String(usable[0]?.id ?? ""),
  );
  const [repoFilter, setRepoFilter] = useState("");
  const [repoId, setRepoId] = useState<string>("");

  const [loaded, setLoaded] = useState<Keyed<{
    branches: Branch[];
    truncated: boolean;
  }> | null>(null);
  const [chosenBranch, setChosenBranch] = useState<Keyed<string> | null>(null);
  const [loadError, setLoadError] = useState<Keyed<string> | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);

  const installation = usable.find((item) => String(item.id) === installationId);
  const repo = installation?.repos.find((item) => String(item.id) === repoId);

  // Identifies the current selection; everything below is derived from it, so
  // changing repository cannot leave stale branches or a stale error on screen.
  const repoKey = repo ? `${installationId}:${repo.id}` : "";

  const repos = useMemo(() => {
    if (!installation) return [];
    const needle = repoFilter.trim().toLowerCase();
    return needle
      ? installation.repos.filter((item) =>
          item.fullName.toLowerCase().includes(needle),
        )
      : installation.repos;
  }, [installation, repoFilter]);

  const current = loaded?.key === repoKey ? loaded.value : null;
  const branches = current?.branches ?? [];
  const truncated = current?.truncated ?? false;
  const loadingBranches = Boolean(repo) && !current && loadError?.key !== repoKey;

  // The selected branch defaults to the repository's default branch.
  const branch =
    chosenBranch?.key === repoKey
      ? chosenBranch.value
      : (branches.find((item) => item.name === repo?.defaultBranch)?.name ??
        branches[0]?.name ??
        "");

  const error =
    connectError ?? (loadError?.key === repoKey ? loadError.value : null);

  useEffect(() => {
    if (!installation || !repo) return;

    const key = `${installation.id}:${repo.id}`;
    const controller = new AbortController();
    let cancelled = false;

    (async () => {
      try {
        const response = await fetch(
          `/api/github/installations/${installation.id}/repos/${repo.id}/branches`,
          { signal: controller.signal },
        );
        const payload = (await response.json()) as {
          branches?: Branch[];
          truncated?: boolean;
          message?: string;
        };
        if (!response.ok) {
          throw new Error(payload.message ?? "Could not load branches.");
        }
        if (cancelled) return;
        setLoaded({
          key,
          value: {
            branches: payload.branches ?? [],
            truncated: Boolean(payload.truncated),
          },
        });
      } catch (cause: unknown) {
        if (cancelled) return;
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setLoadError({
          key,
          value:
            cause instanceof Error ? cause.message : "Could not load branches.",
        });
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [installation, repo]);

  function connect() {
    if (!installation || !repo || !branch) return;
    setConnectError(null);

    startConnecting(async () => {
      try {
        const response = await fetch("/api/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            installationId: installation.id,
            repoId: repo.id,
            branch,
          }),
        });
        const payload = (await response.json()) as {
          project?: { id: string };
          message?: string;
        };
        if (!response.ok || !payload.project) {
          throw new Error(
            payload.message ?? "Could not connect the repository.",
          );
        }
        router.push(`/p/${payload.project.id}/overview`);
      } catch (cause: unknown) {
        setConnectError(
          cause instanceof Error
            ? cause.message
            : "Could not connect the repository.",
        );
      }
    });
  }

  return (
    <div className="space-y-8 border-t border-border pt-8">
      {usable.length > 1 ? (
        <div className="space-y-2">
          <Label htmlFor="installation">GitHub account</Label>
          <Select
            value={installationId}
            onValueChange={(next) => {
              setInstallationId(next);
              setRepoId("");
              setRepoFilter("");
              setConnectError(null);
            }}
          >
            <SelectTrigger id="installation" className="h-9 w-full">
              <SelectValue placeholder="Select an account" />
            </SelectTrigger>
            <SelectContent>
              {usable.map((item) => (
                <SelectItem key={item.id} value={String(item.id)}>
                  {item.account.login} ({item.repos.length} repositor{item.repos.length === 1 ? "y" : "ies"})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="repo">Repository</Label>
        {installation && installation.repos.length > 8 ? (
          <Input
            id="repo-filter"
            placeholder="Filter repositories"
            aria-label="Filter repositories"
            value={repoFilter}
            onChange={(event) => setRepoFilter(event.target.value)}
          />
        ) : null}
        <Select
          value={repoId}
          onValueChange={(next) => {
            setRepoId(next);
            setConnectError(null);
          }}
        >
          <SelectTrigger id="repo" className="h-9 w-full">
            <SelectValue placeholder="Select a repository" />
          </SelectTrigger>
          <SelectContent>
            {repos.map((item) => (
              <SelectItem key={item.id} value={String(item.id)}>
                {item.fullName}
                {item.private ? " (private)" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {installation && repos.length === 0 ? <p className="text-xs text-muted-foreground">No repositories match that filter.</p> : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="branch">Branch</Label>
        <Select
          value={branch}
          onValueChange={(next) => setChosenBranch({ key: repoKey, value: next })}
          disabled={!repo || loadingBranches || branches.length === 0}
        >
          <SelectTrigger id="branch" className="h-9 w-full">
            <SelectValue placeholder={!repo ? "Select a repository first" : loadingBranches ? "Loading branches…" : "Select a branch"} />
          </SelectTrigger>
          <SelectContent>
            {branches.map((item) => (
              <SelectItem key={item.name} value={item.name}>
                {item.name}
                {item.name === repo?.defaultBranch ? " (default)" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {truncated ? <p className="text-xs text-muted-foreground">Showing the first 300 branches.</p> : null}
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Could not connect</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-4">
        <Button size="lg" onClick={connect} disabled={!repo || !branch || isConnecting || loadingBranches}>
          {isConnecting ? <Loader2 className="size-4 animate-spin" /> : null}
          Connect
        </Button>
        <a
          href={installUrl}
          target="_blank"
          rel="noreferrer"
          className="group inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <span className="link-underline">Add or remove repositories on GitHub</span>
          <ExternalLink className="size-3" />
        </a>
      </div>
      <p className="text-xs text-muted-foreground">Connecting reads no code. Athenyx reads the repository only when you start a review.</p>
    </div>
  );
}

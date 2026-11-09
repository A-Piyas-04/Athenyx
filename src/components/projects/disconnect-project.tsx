"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function DisconnectProject({
  projectId,
  repoLabel,
}: {
  projectId: string;
  repoLabel: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, startDeleting] = useTransition();

  function disconnect() {
    setError(null);
    startDeleting(async () => {
      try {
        const response = await fetch(`/api/projects/${projectId}`, {
          method: "DELETE",
        });
        if (!response.ok && response.status !== 204) {
          const payload = (await response.json().catch(() => ({}))) as {
            message?: string;
          };
          throw new Error(payload.message ?? "Could not disconnect the project.");
        }
        setOpen(false);
        router.push("/projects");
      } catch (cause: unknown) {
        setError(
          cause instanceof Error
            ? cause.message
            : "Could not disconnect the project.",
        );
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive">
          <Trash2 className="size-4" />
          Disconnect project
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Disconnect {repoLabel}?</DialogTitle>
          <DialogDescription>
            This deletes every review, finding and decision Athenyx stored for
            this project. Your GitHub repository is not changed in any way.
            This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">
              Cancel
            </Button>
          </DialogClose>
          <Button
            variant="destructive"
            className="border-destructive bg-destructive text-white dark:text-background"
            onClick={disconnect}
            disabled={isDeleting}
          >
            {isDeleting ? <Loader2 className="size-4 animate-spin" /> : null}
            Disconnect
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

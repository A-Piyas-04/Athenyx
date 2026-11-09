"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Loader2 } from "lucide-react";
import type { FindingStatus } from "@/generated/prisma/enums";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest, errorMessage } from "@/lib/client-api";

type Action = {
  status: FindingStatus;
  label: string;
  hint: string;
  /** Requires a note; shows a dialog. */
  note?: { title: string; description: string };
};

const ACTIONS: Action[] = [
  { status: "IN_PROGRESS", label: "Mark in progress", hint: "You're working on a fix" },
  {
    status: "ACCEPTED_RISK",
    label: "Accept risk",
    hint: "Keep it, with a reason",
    note: { title: "Accept this risk", description: "Explain why the risk is acceptable for now. This note is kept with the finding." },
  },
  {
    status: "DISMISSED",
    label: "Dismiss as false positive",
    hint: "The finding is wrong",
    note: { title: "Dismiss as a false positive", description: "Explain why this finding is wrong. The record is kept." },
  },
  {
    status: "RESOLVED",
    label: "Mark resolved manually",
    hint: "Recorded as not verified",
    note: {
      title: "Mark resolved manually",
      description:
        'This is recorded as resolved by you and labelled "not verified". For a verified result, push your fix and use Re-check instead.',
    },
  },
  { status: "OPEN", label: "Reopen", hint: "Track it as open again" },
];

/** Status changes on the finding detail page (06 Risk Center), grouped in one menu. */
export function StatusActions({ findingId, status }: { findingId: string; status: FindingStatus }) {
  const router = useRouter();
  const [pending, setPending] = useState<FindingStatus | null>(null);
  const [dialog, setDialog] = useState<Action | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function apply(action: Action, statusNote?: string) {
    setError(null);
    setPending(action.status);
    try {
      await apiRequest(`/api/findings/${findingId}`, "PATCH", { status: action.status, statusNote });
      setDialog(null);
      setNote("");
      router.refresh();
    } catch (cause) {
      setError(errorMessage(cause, "Could not update the finding."));
    } finally {
      setPending(null);
    }
  }

  // Reopen only makes sense for closed findings; the others hide the current status.
  const visible = ACTIONS.filter((a) => (a.status === "OPEN" ? status !== "OPEN" && status !== "IN_PROGRESS" : a.status !== status));

  return (
    <div className="space-y-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="w-full justify-between" disabled={pending !== null}>
            {pending ? <Loader2 className="animate-spin" /> : null}
            Change status
            <ChevronDown className="ml-auto text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          {visible.map((action, i) => (
            <div key={action.status}>
              {action.status === "OPEN" && i > 0 ? <DropdownMenuSeparator /> : null}
              <DropdownMenuItem
                onSelect={() => (action.note ? setDialog(action) : apply(action))}
                className="flex-col items-start gap-0 py-2"
              >
                <span className="font-medium">{action.label}</span>
                <span className="text-xs text-muted-foreground">{action.hint}</span>
              </DropdownMenuItem>
            </div>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {error && !dialog ? <p className="text-sm text-destructive">{error}</p> : null}

      <Dialog
        open={dialog !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDialog(null);
            setError(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{dialog?.note?.title}</DialogTitle>
            <DialogDescription>{dialog?.note?.description}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="status-note">Note</Label>
            <Textarea id="status-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} rows={4} autoFocus />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button disabled={note.trim() === "" || pending !== null} onClick={() => dialog && apply(dialog, note.trim())}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

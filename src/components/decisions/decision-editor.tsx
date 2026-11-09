"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Pencil } from "lucide-react";
import { DecisionForm, type FindingOption } from "@/components/decisions/decision-form";
import { Button } from "@/components/ui/button";
import type { DecisionDraft } from "@/lib/decisions/draft";

/** Shows a decision as a document; "Edit" swaps in the form in place. */
export function DecisionEditor({
  projectId,
  decisionId,
  initial,
  findingOptions,
  children,
}: {
  projectId: string;
  decisionId: string;
  initial: DecisionDraft;
  findingOptions: FindingOption[];
  /** The read view. */
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);

  return (
    <AnimatePresence mode="wait" initial={false}>
      {editing ? (
        <motion.div
          key="edit"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        >
          <DecisionForm
            projectId={projectId}
            mode={{ kind: "edit", decisionId }}
            initial={initial}
            findingOptions={findingOptions}
            cancelLabel="Cancel"
            onCancel={() => setEditing(false)}
            onSaved={() => {
              setEditing(false);
              router.refresh();
            }}
          />
        </motion.div>
      ) : (
        <motion.div
          key="view"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="space-y-10"
        >
          {children}
          <Button variant="outline" onClick={() => setEditing(true)}>
            <Pencil />
            Edit decision
          </Button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

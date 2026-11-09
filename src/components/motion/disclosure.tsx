"use client";

import { useId, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * An expandable section with a smooth height animation. Replaces <details>
 * so opening and closing feel continuous rather than jumping.
 */
export function Disclosure({
  summary,
  children,
  defaultOpen = false,
  chevron = "end",
  className,
  summaryClassName,
  contentClassName,
}: {
  summary: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  chevron?: "start" | "end" | "none";
  className?: string;
  summaryClassName?: string;
  contentClassName?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  const icon = (
    <ChevronDown
      aria-hidden="true"
      className={cn(
        "size-4 shrink-0 text-muted-foreground transition-transform duration-300 ease-[var(--ease-out-quint)]",
        open && "rotate-180",
      )}
    />
  );

  return (
    <div className={className} data-open={open || undefined}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "group flex w-full items-center gap-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
          summaryClassName,
        )}
      >
        {chevron === "start" ? icon : null}
        <span className="min-w-0 flex-1">{summary}</span>
        {chevron === "end" ? icon : null}
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            id={id}
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{
              height: { duration: 0.4, ease: [0.22, 1, 0.36, 1] },
              opacity: { duration: 0.25 },
            }}
            className="overflow-hidden"
          >
            <div className={contentClassName}>{children}</div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

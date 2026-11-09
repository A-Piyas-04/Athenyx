"use client";

import { motion } from "motion/react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The review pipeline as a flow: one node per stage joined by connectors.
 * Finished connectors are solid, the active one carries a travelling pulse,
 * and the active node breathes.
 */
export function StageFlow({ steps, current }: { steps: { key: string; label: string }[]; current: number }) {
  return (
    <ol className="grid" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
      {steps.map((step, i) => {
        const state = i < current ? "done" : i === current ? "active" : "todo";
        const last = i === steps.length - 1;
        return (
          <li key={step.key} className="relative flex flex-col items-start gap-3">
            <div className="relative flex w-full items-center">
              <span
                className={cn(
                  "relative z-10 grid size-5 shrink-0 place-items-center rounded-[4px] border transition-colors duration-500",
                  state === "done" && "border-foreground bg-foreground text-background",
                  state === "active" && "border-primary bg-primary text-primary-foreground",
                  state === "todo" && "border-border-strong bg-background",
                )}
              >
                {state === "done" ? <Check className="size-3" strokeWidth={3} /> : null}
                {state === "active" ? (
                  <motion.span
                    className="absolute inset-0 rounded-[4px] border border-primary"
                    animate={{ scale: [1, 1.7], opacity: [0.9, 0] }}
                    transition={{ duration: 1.4, repeat: Infinity, ease: "easeOut" }}
                  />
                ) : null}
              </span>
              {!last ? (
                <span className="relative mx-1 h-px flex-1 overflow-hidden bg-border-strong">
                  <motion.span
                    className="absolute inset-y-0 left-0 bg-foreground"
                    initial={false}
                    animate={{ width: state === "done" ? "100%" : "0%" }}
                    transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                  />
                  {state === "active" ? (
                    <motion.span
                      className="absolute -top-px h-[3px] w-6 bg-primary"
                      animate={{ left: ["-25%", "100%"] }}
                      transition={{ duration: 1.3, repeat: Infinity, ease: "easeInOut" }}
                    />
                  ) : null}
                </span>
              ) : null}
            </div>
            <span
              className={cn(
                "hidden pr-2 text-xs leading-tight transition-colors duration-300 sm:block",
                state === "todo" ? "text-subtle" : state === "active" ? "font-semibold text-foreground" : "text-muted-foreground",
              )}
            >
              {step.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
